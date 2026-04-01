import { Router } from 'express';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { checkSigningLocked } from '../services/queries.js';

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

// GET /signatures/documents/:docId/placements/:userEmail — 소유자가 특정 공유자 서명 배치 조회
router.get('/documents/:docId/placements/:userEmail', async (req, res) => {
  const { docId, userEmail } = req.params;
  try {
    // 소유자 확인
    const { rows: ownerRows } = await query(
      `SELECT 1 FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id=$1 AND u.email=$2`,
      [docId, req.user.email]
    );
    if (!ownerRows.length) return res.status(403).json({ error: '소유자만 조회할 수 있습니다' });

    const { rows: placements } = await query(
      `SELECT sp.* FROM signature_placements sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.document_id=$1 AND u.email=$2`,
      [docId, userEmail]
    );

    // 해당 사용자가 만든 필드와 그 값
    const { rows: fields } = await query(
      `SELECT ff.* FROM form_fields ff
       JOIN users u ON u.id = ff.created_by
       WHERE ff.document_id=$1 AND u.email=$2
       ORDER BY ff.page_number, ff.id`,
      [docId, userEmail]
    );

    const { rows: fieldValues } = await query(
      `SELECT fv.field_id, fv.value
       FROM field_values fv
       JOIN form_fields ff ON ff.id = fv.field_id
       JOIN users u ON u.id = fv.user_id
       WHERE ff.document_id=$1 AND u.email=$2`,
      [docId, userEmail]
    );

    res.json({ placements, fields, fieldValues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/documents/:docId/placements', async (req, res) => {
  const { docId } = req.params;
  const { signature_id, svg_data, page_number = 1, x, y, width, height, rotation = 0 } = req.body;
  try {
    if (await checkSigningLocked(docId, req.user.email))
      return res.status(403).json({ error: '서명이 완료된 상태에서는 편집할 수 없습니다' });
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
    const { rows: existing } = await query(
      `SELECT document_id FROM signature_placements WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ error: '배치를 찾을 수 없습니다' });
    if (await checkSigningLocked(existing[0].document_id, req.user.email))
      return res.status(403).json({ error: '서명이 완료된 상태에서는 편집할 수 없습니다' });

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
    const { rows: existing } = await query(
      `SELECT document_id FROM signature_placements WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ error: '배치를 찾을 수 없습니다' });
    if (await checkSigningLocked(existing[0].document_id, req.user.email))
      return res.status(403).json({ error: '서명이 완료된 상태에서는 편집할 수 없습니다' });

    await query('DELETE FROM signature_placements WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
