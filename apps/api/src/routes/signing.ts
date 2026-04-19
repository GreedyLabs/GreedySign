/**
 * /api/documents/:docId/signing
 * PATCH /submit  — 서명 완료 제출
 * PATCH /decline — 서명 거부
 */
import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import { documents, documentParticipants, notifications, users } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { broadcast, notifyUser } from '../services/sse.js';
import { logAudit } from '../services/audit.js';
import { buildCombinedPdf } from '../services/pdfMerge.js';
import { storePdf } from '../services/storage.js';
import { shouldFreezeDocument } from '../services/queries.js';
import { sendCompletionEmail, sendDeclineEmail } from '../services/email.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// PATCH /submit
router.patch('/submit', requireDocAccess, async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  const userId = req.user.id;

  try {
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }
    if (doc.status !== 'in_progress') {
      res.status(400).json({ error: '서명 진행 중인 문서만 제출할 수 있습니다' });
      return;
    }

    const [participant] = await db
      .select({
        id: documentParticipants.id,
        signing_status: documentParticipants.signing_status,
        role: documentParticipants.role,
      })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.document_id, docId!),
          eq(documentParticipants.user_id, userId),
          eq(documentParticipants.invite_status, 'accepted')
        )
      );
    if (!participant) {
      res.status(403).json({ error: '접근 권한이 없습니다' });
      return;
    }
    if (participant.signing_status === 'completed') {
      res.status(400).json({ error: '이미 서명을 완료했습니다' });
      return;
    }
    if (participant.signing_status === 'declined') {
      res.status(400).json({ error: '서명을 거부한 상태입니다' });
      return;
    }

    // 필수 필드 미응답 확인
    const unfilledResult = await db.execute(sql`
      SELECT ff.id FROM form_fields ff
      LEFT JOIN field_responses fr ON fr.field_id = ff.id AND fr.participant_id = ${participant.id}::uuid
      WHERE ff.document_id = ${docId}::uuid AND ff.participant_id = ${participant.id}::uuid AND ff.required = TRUE
        AND (fr.id IS NULL
             OR (ff.field_type = 'text'      AND (fr.text_value IS NULL OR fr.text_value = ''))
             OR (ff.field_type = 'checkbox'  AND fr.checked IS NULL)
             OR (ff.field_type IN ('signature','initial') AND (fr.svg_data IS NULL OR fr.svg_data = ''))
             OR (ff.field_type = 'date'      AND fr.date_value IS NULL))
    `);
    if (unfilledResult.rows.length > 0) {
      res.status(400).json({
        error: `필수 항목 ${unfilledResult.rows.length}개가 입력되지 않았습니다`,
        unfilled_count: unfilledResult.rows.length,
      });
      return;
    }

    await db
      .update(documentParticipants)
      .set({ signing_status: 'completed', completed_at: sql`NOW()` })
      .where(eq(documentParticipants.id, participant.id));

    await logAudit({
      docId: docId!,
      userId,
      participantId: participant.id,
      action: 'signing_completed',
      req,
    });
    broadcast(docId!, {
      type: 'signing_status_changed',
      participant_id: participant.id,
      status: 'completed',
    });

    // 소유자 알림
    const ownerResult = await db.execute(sql`
      SELECT d.owner_id, d.name, u2.name AS signer_name
      FROM documents d
      JOIN users u2 ON u2.id = ${userId}::uuid
      WHERE d.id = ${docId}::uuid
    `);
    if (ownerResult.rows.length) {
      const row = ownerResult.rows[0] as { owner_id: string; name: string; signer_name: string };
      if (row.owner_id !== userId) {
        await db.insert(notifications).values({
          user_id: row.owner_id,
          type: 'signing_completed',
          title: `서명 완료: ${row.name}`,
          body: `${row.signer_name}님이 서명을 완료했습니다.`,
          document_id: docId!,
        });
        notifyUser(row.owner_id, { type: 'signing_status_changed', document_id: docId });
      }
    }

    if (await shouldFreezeDocument(docId!)) {
      await freezeDocument(docId!, req);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /decline
router.patch('/decline', requireDocAccess, async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  const { reason = '' } = req.body as { reason?: string };
  const userId = req.user.id;

  try {
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }
    if (doc.status !== 'in_progress') {
      res.status(400).json({ error: '서명 진행 중인 문서만 거부할 수 있습니다' });
      return;
    }

    const [part] = await db
      .select({ id: documentParticipants.id, is_owner: documentParticipants.is_owner })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.document_id, docId!),
          eq(documentParticipants.user_id, userId),
          eq(documentParticipants.invite_status, 'accepted')
        )
      );
    if (!part) {
      res.status(403).json({ error: '접근 권한이 없습니다' });
      return;
    }
    if (part.is_owner) {
      res
        .status(400)
        .json({ error: '소유자는 서명을 거부할 수 없습니다. 무효화(void)를 이용하세요' });
      return;
    }

    await db
      .update(documentParticipants)
      .set({ signing_status: 'declined', decline_reason: reason, completed_at: sql`NOW()` })
      .where(eq(documentParticipants.id, part.id));

    const ownerResult = await db.execute(sql`
      SELECT d.owner_id, d.name AS doc_name, u2.name AS signer_name, u2.email AS signer_email,
             owner.name AS owner_name, owner.email AS owner_email
      FROM documents d
      JOIN users u2 ON u2.id = ${userId}::uuid
      JOIN users owner ON owner.id = d.owner_id
      WHERE d.id = ${docId}::uuid
    `);
    if (ownerResult.rows.length) {
      const row = ownerResult.rows[0] as {
        owner_id: string;
        doc_name: string;
        signer_name: string;
        signer_email: string;
        owner_name: string;
        owner_email: string;
      };
      await db.insert(notifications).values({
        user_id: row.owner_id,
        type: 'signing_declined',
        title: `서명 거부: ${row.doc_name}`,
        body: `${row.signer_name}님이 서명을 거부했습니다.${reason ? ' 사유: ' + reason : ''}`,
        document_id: docId!,
      });
      notifyUser(row.owner_id, { type: 'signing_declined', document_id: docId });
      sendDeclineEmail({
        toEmail: row.owner_email,
        ownerName: row.owner_name,
        signerName: row.signer_name,
        signerEmail: row.signer_email,
        docName: row.doc_name,
        reason,
      }).catch((err) => console.error('[email] decline:', (err as Error).message));
    }

    broadcast(docId!, {
      type: 'signing_status_changed',
      participant_id: part.id,
      status: 'declined',
    });
    await logAudit({
      docId: docId!,
      userId,
      participantId: part.id,
      action: 'signing_declined',
      meta: { reason },
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Internal: 문서 완료 잠금 ──────────────────────────────────────────────
export async function freezeDocument(docId: string, req: Request): Promise<void> {
  const [check] = await db
    .select({ status: documents.status })
    .from(documents)
    .where(eq(documents.id, docId));
  if (!check || check.status !== 'in_progress') return;

  try {
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

    const pdfBytes = await buildCombinedPdf(docInfo!.pdf_path, docId, participantIds);
    const signed_pdf_path = await storePdf(Buffer.from(pdfBytes));
    const signed_pdf_hash = createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex');

    await db
      .update(documents)
      .set({
        status: 'completed',
        completed_at: sql`NOW()`,
        signed_pdf_path,
        signed_pdf_hash,
        updated_at: sql`NOW()`,
      })
      .where(eq(documents.id, docId));

    await logAudit({
      docId,
      userId: null,
      action: 'document_completed',
      meta: { signed_pdf_hash, participant_count: participantIds.length },
      req,
    });

    // 모든 참여자 완료 알림 + 이메일
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
    console.log(`✅ Document ${docId} completed. Hash: ${signed_pdf_hash}`);
  } catch (err) {
    console.error(`❌ Failed to freeze document ${docId}:`, (err as Error).message);
  }
}

export default router;
