import { Router, Request, Response } from 'express';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get('/', requireDocAccess, async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  try {
    const docResult = await db.execute(sql`
      SELECT d.id, d.name, d.size_bytes, d.page_count,
             d.status, d.signing_mode,
             d.created_at, d.completed_at, d.signed_pdf_hash,
             d.voided_at, d.voided_reason,
             u.name AS owner_name, u.email AS owner_email
      FROM documents d
      JOIN users u ON d.owner_id = u.id
      WHERE d.id = ${docId}::uuid
    `);
    if (!docResult.rows.length) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }
    const doc = docResult.rows[0] as Record<string, unknown>;

    const partResult = await db.execute(sql`
      SELECT
        p.id, p.role, p.is_owner,
        COALESCE(u.name, p.name, p.email) AS name,
        p.email, p.invite_status, p.signing_status,
        p.signing_order, p.invited_at, p.responded_at, p.completed_at
      FROM document_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.document_id = ${docId}::uuid
      ORDER BY p.is_owner DESC, p.signing_order, p.invited_at
    `);

    const auditResult = await db.execute(sql`
      SELECT al.participant_id, al.ip, al.created_at
      FROM audit_logs al
      WHERE al.document_id = ${docId}::uuid AND al.action = 'signing_completed'
      ORDER BY al.created_at
    `);

    const auditByParticipant: Record<string, { ip?: string | null; created_at: Date }> = {};
    for (const row of auditResult.rows as {
      participant_id: string;
      ip?: string | null;
      created_at: Date;
    }[]) {
      if (!auditByParticipant[row.participant_id]) auditByParticipant[row.participant_id] = row;
    }

    const participantsWithAudit = (
      partResult.rows as Array<{ id: string; role: string; signing_status: string } & Record<string, unknown>>
    ).map((p) => ({
      ...p,
      signed_ip: auditByParticipant[p.id]?.ip ?? null,
    }));

    const signers = participantsWithAudit.filter((p) => p.role === 'signer');

    res.json({
      document: { ...doc, is_complete: doc.status === 'completed' },
      participants: participantsWithAudit,
      signers,
      total_signers: signers.length,
      completed_signers: signers.filter((p) => p.signing_status === 'completed').length,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
