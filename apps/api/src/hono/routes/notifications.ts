/**
 * /api/notifications — 알림 (Hono 포팅본)
 * Express 버전과 응답 JSON / 상태코드 동일.
 */
import { Hono } from 'hono';
import { sql, eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/pool.js';
import { notifications } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../context.js';

const notificationsRoute = new Hono<AppEnv>();

notificationsRoute.use('*', authMiddleware);

notificationsRoute.get('/', async (c) => {
  try {
    const userId = c.get('user').id;
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.created_at))
      .limit(50);

    const unread_count = rows.filter((n) => !n.read_at).length;
    return c.json({ notifications: rows, unread_count });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

notificationsRoute.patch('/read', async (c) => {
  try {
    const userId = c.get('user').id;
    await db
      .update(notifications)
      .set({ read_at: sql`NOW()` })
      .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

notificationsRoute.patch('/:id/read', async (c) => {
  try {
    const userId = c.get('user').id;
    const id = c.req.param('id');
    await db
      .update(notifications)
      .set({ read_at: sql`NOW()` })
      .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default notificationsRoute;
