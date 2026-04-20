/**
 * /api/invite — 초대 토큰 처리 (Hono 포팅본)
 *  - GET  /:token          : 비인증 (미리보기)
 *  - POST /:token/accept   : 인증
 */
import { Hono } from 'hono';
import { sql, eq } from 'drizzle-orm';
import { db } from '../../db/pool.js';
import { documentParticipants } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { logAudit } from '../../services/audit.js';
import { notifyUser } from '../../services/sse.js';
import { markRecipientViewed } from '../../services/campaignHooks.js';
import { expressReqLike } from '../reqInfo.js';
import type { AppEnv } from '../context.js';

const invite = new Hono<AppEnv>();

invite.get('/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const result = await db.execute(sql`
      SELECT p.id, p.email, p.invite_status, p.role,
             d.id AS document_id,
             d.name AS doc_name, d.page_count, d.size_bytes,
             u.name AS owner_name
      FROM document_participants p
      JOIN documents d ON d.id = p.document_id
      JOIN users u ON u.id = d.owner_id
      WHERE p.invite_token = ${token}
    `);
    if (!result.rows.length) {
      return c.json({ error: '유효하지 않은 초대 링크입니다' }, 404);
    }
    const row = result.rows[0] as {
      email: string;
      role: string;
      document_id: string;
      doc_name: string;
      page_count: number;
      size_bytes: number;
      owner_name: string;
      invite_status: string;
    };
    if (row.invite_status === 'accepted') {
      return c.json({ error: '이미 수락된 초대입니다' }, 410);
    }
    if (row.invite_status === 'declined') {
      return c.json({ error: '거절된 초대입니다' }, 410);
    }

    markRecipientViewed(row.document_id).catch(() => {});

    return c.json({
      email: row.email,
      role: row.role,
      doc_name: row.doc_name,
      doc_page_count: row.page_count,
      doc_size_bytes: row.size_bytes,
      owner_name: row.owner_name,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

invite.post('/:token/accept', authMiddleware, async (c) => {
  try {
    const token = c.req.param('token');
    const me = c.get('user');

    const result = await db.execute(sql`
      SELECT p.*, d.id AS document_id, d.owner_id
      FROM document_participants p
      JOIN documents d ON d.id = p.document_id
      WHERE p.invite_token = ${token}
    `);
    if (!result.rows.length) {
      return c.json({ error: '유효하지 않은 초대 링크입니다' }, 404);
    }
    const row = result.rows[0] as {
      id: string;
      invite_status: string;
      email: string;
      document_id: string;
      owner_id: string;
    };
    if (row.invite_status === 'accepted') {
      return c.json({ error: '이미 수락된 초대입니다' }, 410);
    }
    if (row.email.toLowerCase() !== me.email.toLowerCase()) {
      return c.json({ error: `이 초대는 ${row.email} 계정으로만 수락할 수 있습니다` }, 403);
    }

    await db
      .update(documentParticipants)
      .set({
        invite_status: 'accepted',
        responded_at: sql`NOW()`,
        invite_token: null,
        user_id: sql`COALESCE(user_id, ${me.id}::uuid)`,
      })
      .where(eq(documentParticipants.id, row.id));

    await logAudit({
      docId: row.document_id,
      userId: me.id,
      participantId: row.id,
      action: 'invite_accepted',
      req: expressReqLike(c),
    });

    notifyUser(me.id, { type: 'document_shared', document_id: row.document_id });
    notifyUser(row.owner_id, { type: 'invite_accepted', document_id: row.document_id });

    return c.json({ document_id: row.document_id });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default invite;
