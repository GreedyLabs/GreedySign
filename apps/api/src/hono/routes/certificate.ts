/**
 * GET /api/documents/:docId/certificate — 완료 인증서 페이로드 (Hono 포팅본)
 *
 * Express 구현과 완전히 동일한 JSON 응답. "좀비 상태 자가복구"
 * (completed + signed_pdf_path=null 일 때 best-effort 병합으로 backfill) 도
 * 그대로 포함.
 */
import { Hono } from 'hono';
import { createHash } from 'crypto';
import { sql, eq } from 'drizzle-orm';
import { db } from '../../db/pool.js';
import { documents, documentParticipants } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { buildCombinedPdf } from '../../services/pdfMerge.js';
import { storePdf } from '../../services/storage.js';
import type { AppEnv } from '../context.js';

const certificate = new Hono<AppEnv>();

certificate.use('*', authMiddleware);

const TRACKED_AUDIT_ACTIONS = [
  'document_uploaded',
  'document_sent',
  'invite_accepted',
  'invite_declined',
  'signing_completed',
  'signing_declined',
  'document_completed',
  'document_voided',
  'document_exported',
] as const;

certificate.get('/', requireDocAccess, async (c) => {
  const docId = c.req.param('docId')!;
  try {
    const docResult = await db.execute(sql`
      SELECT d.id, d.name, d.size_bytes, d.page_count,
             d.status, d.signing_mode,
             d.created_at, d.updated_at, d.completed_at,
             d.pdf_hash, d.signed_pdf_hash, d.signed_pdf_path,
             d.voided_at, d.voided_reason,
             u.id AS owner_id, u.name AS owner_name, u.email AS owner_email
      FROM documents d
      JOIN users u ON d.owner_id = u.id
      WHERE d.id = ${docId}::uuid
    `);
    if (!docResult.rows.length) {
      return c.json({ error: '문서를 찾을 수 없습니다' }, 404);
    }
    let doc = docResult.rows[0] as Record<string, unknown>;

    // ─── 좀비 상태 자가복구 ─────────────────────────────────────────────────
    if (doc.status === 'completed' && !doc.signed_pdf_path) {
      try {
        const [docForRebuild] = await db
          .select({ pdf_path: documents.pdf_path })
          .from(documents)
          .where(eq(documents.id, docId));
        const accepted = await db
          .select({ id: documentParticipants.id })
          .from(documentParticipants)
          .where(
            sql`${documentParticipants.document_id} = ${docId}::uuid
                AND ${documentParticipants.invite_status} = 'accepted'`
          );
        const participantIds = accepted.map((p) => p.id);
        const pdfBytes = await buildCombinedPdf(
          docForRebuild!.pdf_path,
          docId,
          participantIds
        );
        const signed_pdf_path = await storePdf(Buffer.from(pdfBytes));
        const signed_pdf_hash = createHash('sha256')
          .update(Buffer.from(pdfBytes))
          .digest('hex');
        await db
          .update(documents)
          .set({ signed_pdf_path, signed_pdf_hash, updated_at: sql`NOW()` })
          .where(eq(documents.id, docId));
        doc = { ...doc, signed_pdf_path, signed_pdf_hash };
        console.log(`[cert:backfill] Backfilled signed PDF for ${docId} (hash=${signed_pdf_hash})`);
      } catch (err) {
        console.error(
          `[cert:warn] Certificate backfill failed for ${docId}:`,
          (err as Error).message
        );
      }
    }

    const partResult = await db.execute(sql`
      SELECT
        p.id, p.role, p.is_owner,
        COALESCE(u.name, p.name, p.email) AS name,
        p.email, p.invite_status, p.signing_status,
        p.signing_order, p.invited_at, p.responded_at, p.completed_at,
        p.decline_reason
      FROM document_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.document_id = ${docId}::uuid
      ORDER BY p.is_owner DESC, p.signing_order, p.invited_at
    `);

    const signingAuditResult = await db.execute(sql`
      SELECT al.participant_id, al.ip, al.user_agent, al.created_at
      FROM audit_logs al
      WHERE al.document_id = ${docId}::uuid AND al.action = 'signing_completed'
      ORDER BY al.created_at
    `);

    const signingAuditByParticipant: Record<
      string,
      { ip?: string | null; user_agent?: string | null; created_at: Date }
    > = {};
    for (const row of signingAuditResult.rows as {
      participant_id: string;
      ip?: string | null;
      user_agent?: string | null;
      created_at: Date;
    }[]) {
      if (!signingAuditByParticipant[row.participant_id]) {
        signingAuditByParticipant[row.participant_id] = row;
      }
    }

    const participantsWithAudit = (
      partResult.rows as Array<
        { id: string; role: string; signing_status: string } & Record<string, unknown>
      >
    ).map((p) => ({
      ...p,
      signed_ip: signingAuditByParticipant[p.id]?.ip ?? null,
      signed_user_agent: signingAuditByParticipant[p.id]?.user_agent ?? null,
    }));

    const signers = participantsWithAudit.filter((p) => p.role === 'signer');

    const actionList = sql.join(
      TRACKED_AUDIT_ACTIONS.map((a) => sql`${a}`),
      sql`, `
    );
    const auditResult = await db.execute(sql`
      SELECT al.id, al.action, al.created_at, al.ip, al.meta,
             al.user_id, al.participant_id,
             u.name AS user_name, u.email AS user_email,
             p.email AS participant_email,
             COALESCE(pu.name, p.name, p.email) AS participant_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN document_participants p ON p.id = al.participant_id
      LEFT JOIN users pu ON pu.id = p.user_id
      WHERE al.document_id = ${docId}::uuid
        AND al.action IN (${actionList})
      ORDER BY al.created_at ASC
    `);

    return c.json({
      document: {
        ...doc,
        is_complete: doc.status === 'completed',
        has_signed_pdf: Boolean(doc.signed_pdf_path),
      },
      participants: participantsWithAudit,
      signers,
      total_signers: signers.length,
      completed_signers: signers.filter((p) => p.signing_status === 'completed').length,
      audit_trail: auditResult.rows,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default certificate;
