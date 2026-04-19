import { Router, Request, Response } from 'express';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { documentParticipants } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { notifyUser } from '../services/sse.js';

const router = Router();

router.get('/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT p.id, p.email, p.invite_status, p.role,
             d.name AS doc_name, d.page_count, d.size_bytes,
             u.name AS owner_name
      FROM document_participants p
      JOIN documents d ON d.id = p.document_id
      JOIN users u ON u.id = d.owner_id
      WHERE p.invite_token = ${req.params.token}
    `);
    if (!result.rows.length) {
      res.status(404).json({ error: '유효하지 않은 초대 링크입니다' });
      return;
    }

    const invite = result.rows[0] as {
      email: string;
      role: string;
      doc_name: string;
      page_count: number;
      size_bytes: number;
      owner_name: string;
      invite_status: string;
    };
    if (invite.invite_status === 'accepted') {
      res.status(410).json({ error: '이미 수락된 초대입니다' });
      return;
    }
    if (invite.invite_status === 'declined') {
      res.status(410).json({ error: '거절된 초대입니다' });
      return;
    }

    res.json({
      email: invite.email,
      role: invite.role,
      doc_name: invite.doc_name,
      doc_page_count: invite.page_count,
      doc_size_bytes: invite.size_bytes,
      owner_name: invite.owner_name,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post(
  '/:token/accept',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await db.execute(sql`
      SELECT p.*, d.id AS document_id, d.owner_id
      FROM document_participants p
      JOIN documents d ON d.id = p.document_id
      WHERE p.invite_token = ${req.params.token}
    `);
      if (!result.rows.length) {
        res.status(404).json({ error: '유효하지 않은 초대 링크입니다' });
        return;
      }

      const invite = result.rows[0] as {
        id: string;
        invite_status: string;
        email: string;
        document_id: string;
        owner_id: string;
      };
      if (invite.invite_status === 'accepted') {
        res.status(410).json({ error: '이미 수락된 초대입니다' });
        return;
      }

      if (invite.email.toLowerCase() !== req.user.email.toLowerCase()) {
        res.status(403).json({ error: `이 초대는 ${invite.email} 계정으로만 수락할 수 있습니다` });
        return;
      }

      await db
        .update(documentParticipants)
        .set({
          invite_status: 'accepted',
          responded_at: sql`NOW()`,
          invite_token: null,
          user_id: sql`COALESCE(user_id, ${req.user.id}::uuid)`,
        })
        .where(eq(documentParticipants.id, invite.id));

      await logAudit({
        docId: invite.document_id,
        userId: req.user.id,
        participantId: invite.id,
        action: 'invite_accepted',
        req,
      });

      notifyUser(req.user.id, { type: 'document_shared', document_id: invite.document_id });
      notifyUser(invite.owner_id, { type: 'invite_accepted', document_id: invite.document_id });

      res.json({ document_id: invite.document_id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

export default router;
