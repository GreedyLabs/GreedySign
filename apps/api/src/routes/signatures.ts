import { Router } from 'express';
import { db } from '../db/pool.js';
import { eq, and, desc } from 'drizzle-orm';
import { userSignatures } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(userSignatures)
      .where(eq(userSignatures.user_id, req.user.id))
      .orderBy(desc(userSignatures.is_default), desc(userSignatures.created_at));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req, res) => {
  const {
    name,
    method,
    svg_data,
    thumbnail,
    is_default = false,
  } = req.body as {
    name?: string;
    method?: string;
    svg_data?: string;
    thumbnail?: string;
    is_default?: boolean;
  };
  if (!svg_data || !method) {
    res.status(400).json({ error: 'svg_data와 method가 필요합니다' });
    return;
  }

  try {
    if (is_default) {
      await db
        .update(userSignatures)
        .set({ is_default: false })
        .where(eq(userSignatures.user_id, req.user.id));
    }
    const [inserted] = await db
      .insert(userSignatures)
      .values({
        user_id: req.user.id,
        name: name ?? '서명',
        method,
        svg_data,
        thumbnail,
        is_default,
      })
      .returning();
    res.json(inserted);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, method, svg_data, thumbnail } = req.body as {
    name?: string;
    method?: string;
    svg_data?: string;
    thumbnail?: string;
  };
  if (!svg_data || !method) {
    res.status(400).json({ error: 'svg_data와 method가 필요합니다' });
    return;
  }
  try {
    const [updated] = await db
      .update(userSignatures)
      .set({ name: name ?? '서명', method, svg_data, thumbnail })
      .where(and(eq(userSignatures.id, req.params.id), eq(userSignatures.user_id, req.user.id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: '서명을 찾을 수 없습니다' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db
      .delete(userSignatures)
      .where(and(eq(userSignatures.id, req.params.id), eq(userSignatures.user_id, req.user.id)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
