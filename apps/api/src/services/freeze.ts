/**
 * freezeDocument — 문서를 `completed` 로 확정하는 트랜잭션.
 * (1) DB status 전환 [필수] + (2) 서명 PDF 병합 [best-effort].
 * Hono 라우트에서는 `hono/reqInfo.ts` 의 `expressReqLike(c)` 로 req 를 넘긴다.
 */
import { createHash } from 'crypto';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { documents, documentParticipants, notifications } from '../db/schema.js';
import { broadcast, notifyUser } from './sse.js';
import { logAudit } from './audit.js';
import { buildCombinedPdf } from './pdfMerge.js';
import { storePdf } from './storage.js';
import { sendCompletionEmail } from './email.js';
import { onCampaignEnvelopeCompleted } from './campaignHooks.js';
import type { ReqInfo } from '../types.js';

export async function freezeDocument(
  docId: string,
  req: ReqInfo | null = null
): Promise<void> {
  const [check] = await db
    .select({ status: documents.status })
    .from(documents)
    .where(eq(documents.id, docId));
  if (!check || check.status !== 'in_progress') return;

  const [docInfo] = await db
    .select({ pdf_path: documents.pdf_path })
    .from(documents)
    .where(eq(documents.id, docId));

  const accepted = await db
    .select({ id: documentParticipants.id })
    .from(documentParticipants)
    .where(
      and(
        eq(documentParticipants.document_id, docId),
        eq(documentParticipants.invite_status, 'accepted')
      )
    );
  const participantIds = accepted.map((p) => p.id);

  // ── 1단계: 상태 전환 (필수) ──
  await db
    .update(documents)
    .set({
      status: 'completed',
      completed_at: sql`NOW()`,
      updated_at: sql`NOW()`,
    })
    .where(eq(documents.id, docId));

  // ── 2단계: 서명 PDF 병합 (best-effort) ──
  let signed_pdf_hash: string | null = null;
  try {
    const pdfBytes = await buildCombinedPdf(docInfo!.pdf_path, docId, participantIds);
    const signed_pdf_path = await storePdf(Buffer.from(pdfBytes));
    signed_pdf_hash = createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex');

    await db
      .update(documents)
      .set({
        signed_pdf_path,
        signed_pdf_hash,
        updated_at: sql`NOW()`,
      })
      .where(eq(documents.id, docId));
  } catch (err) {
    console.error(
      `[freeze:warn] Signed PDF build failed for ${docId} but status updated to completed:`,
      (err as Error).message
    );
  }

  try {
    await logAudit({
      docId,
      userId: null,
      action: 'document_completed',
      meta: { signed_pdf_hash, participant_count: participantIds.length },
      req,
    });

    const allPartsResult = await db.execute(sql`
      SELECT p.user_id, p.email AS participant_email, p.name AS participant_name,
             d.name AS doc_name, owner.name AS owner_name
      FROM document_participants p
      JOIN documents d ON d.id = ${docId}::uuid
      JOIN users owner ON owner.id = d.owner_id
      WHERE p.document_id = ${docId}::uuid
    `);
    const allParts = allPartsResult.rows as {
      user_id?: string;
      participant_email?: string;
      participant_name?: string;
      doc_name: string;
      owner_name: string;
    }[];

    const completedDocName = allParts[0]?.doc_name ?? '';
    const ownerName = allParts[0]?.owner_name ?? '';

    const emailPromises: Promise<void>[] = [];
    for (const p of allParts) {
      if (p.user_id) {
        await db.insert(notifications).values({
          user_id: p.user_id,
          type: 'document_completed',
          title: `서명 완료: ${completedDocName}`,
          body: '모든 서명자가 서명을 완료했습니다. 문서를 확인하세요.',
          document_id: docId,
        });
        notifyUser(p.user_id, { type: 'document_completed', document_id: docId });
      }
      if (p.participant_email) {
        emailPromises.push(
          sendCompletionEmail({
            toEmail: p.participant_email,
            recipientName: p.participant_name,
            ownerName,
            docName: completedDocName,
            docId,
          }).catch((err) =>
            console.error(`[email] completion to ${p.participant_email}:`, (err as Error).message)
          )
        );
      }
    }
    Promise.all(emailPromises).catch(() => {});

    broadcast(docId, { type: 'document_completed', document_id: docId });
    console.log(`[freeze:ok] Document ${docId} completed. Hash: ${signed_pdf_hash}`);

    onCampaignEnvelopeCompleted(docId).catch((err) =>
      console.error('[campaign aggregate]', (err as Error).message)
    );
  } catch (err) {
    console.error(`[freeze:err] Failed to freeze document ${docId}:`, (err as Error).message);
  }
}
