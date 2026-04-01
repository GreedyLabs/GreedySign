import { Router } from 'express';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, method, svg_data, thumbnail, is_default, created_at FROM user_signatures WHERE user_id=$1 ORDER BY is_default DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, method, svg_data, thumbnail, is_default = false } = req.body;
  if (!svg_data || !method) return res.status(400).json({ error: 'svg_data와 method가 필요합니다' });

  try {
    if (is_default) {
      await query('UPDATE user_signatures SET is_default=FALSE WHERE user_id=$1', [req.user.id]);
    }
    const { rows } = await query(
      `INSERT INTO user_signatures (user_id, name, method, svg_data, thumbnail, is_default)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, name || '서명', method, svg_data, thumbnail, is_default]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, method, svg_data, thumbnail } = req.body;
  if (!svg_data || !method) return res.status(400).json({ error: 'svg_data와 method가 필요합니다' });
  try {
    const { rows } = await query(
      `UPDATE user_signatures SET name=$1, method=$2, svg_data=$3, thumbnail=$4
       WHERE id=$5 AND user_id=$6 RETURNING *`,
      [name || '서명', method, svg_data, thumbnail, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: '서명을 찾을 수 없습니다' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM user_signatures WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/documents/:docId/placements', async (req, res) => {
  const { docId } = req.params;
  const { signature_id, svg_data, page_number = 1, x, y, width, height, rotation = 0 } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO signature_placements (document_id, user_id, signature_id, svg_data, page_number, x, y, width, height, rotation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [docId, req.user.id, signature_id, svg_data, page_number, x, y, width, height, rotation]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/placements/:id', async (req, res) => {
  const { x, y, width, height, rotation } = req.body;
  try {
    const { rows } = await query(
      `UPDATE signature_placements SET x=$1,y=$2,width=$3,height=$4,rotation=$5,updated_at=NOW()
       WHERE id=$6 AND user_id=$7 RETURNING *`,
      [x, y, width, height, rotation, req.params.id, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/placements/:id', async (req, res) => {
  try {
    await query('DELETE FROM signature_placements WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
