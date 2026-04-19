import { Router } from 'express';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
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
        SELECT id FROM documents WHERE owner_id = ${req.user.id}::uuid
        UNION
        SELECT document_id FROM document_participants WHERE user_id = ${req.user.id}::uuid
      )
      ORDER BY al.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
