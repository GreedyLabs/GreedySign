import { Router } from 'express';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { notifications } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, req.user.id))
      .orderBy(desc(notifications.created_at))
      .limit(50);

    const unread_count = rows.filter((n) => !n.read_at).length;
    res.json({ notifications: rows, unread_count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/read', async (req, res) => {
  try {
    await db
      .update(notifications)
      .set({ read_at: sql`NOW()` })
      .where(and(eq(notifications.user_id, req.user.id), isNull(notifications.read_at)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    await db
      .update(notifications)
      .set({ read_at: sql`NOW()` })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.user_id, req.user.id)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
