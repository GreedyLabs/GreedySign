/**
 * /api/activity — 감사 로그 (Hono 포팅본)
 * 사용자가 접근 권한을 가진 문서(소유 또는 참여)의 audit_logs 만 노출.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../context.js';

const activity = new Hono<AppEnv>();

activity.use('*', authMiddleware);

activity.get('/', async (c) => {
  try {
    const userId = c.get('user').id;
    const result = await db.execute(sql`
      SELECT
        al.id,
        al.action,
        al.meta,
        al.created_at,
        d.id    AS doc_id,
        d.name  AS doc_name,
        u.id    AS actor_id,
        u.name  AS actor_name,
        u.email AS actor_email
      FROM audit_logs al
      LEFT JOIN documents d ON d.id = al.document_id
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.document_id IN (
        SELECT id FROM documents WHERE owner_id = ${userId}::uuid
        UNION
        SELECT document_id FROM document_participants WHERE user_id = ${userId}::uuid
      )
      ORDER BY al.created_at DESC
      LIMIT 100
    `);
    return c.json(result.rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default activity;
