import { Router } from 'express';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { checkSigningLocked } from '../services/queries.js';

const router = Router();
router.use(authMiddleware);

// PUT /fields/:fieldId — 필드 수정
router.put('/:fieldId', async (req, res) => {
  const { fieldId } = req.params;
  const { x, y, width, height, field_name } = req.body;
  try {
    const { rows: check } = await query(
      `SELECT document_id FROM form_fields WHERE id=$1`,
      [fieldId]
    );
    if (!check.length) return res.status(404).json({ error: '필드를 찾을 수 없습니다' });
    if (await checkSigningLocked(check[0].document_id, req.user.email))
      return res.status(403).json({ error: '서명이 완료된 상태에서는 편집할 수 없습니다' });

    const { rows } = await query(
      `UPDATE form_fields SET x=$1,y=$2,width=$3,height=$4,field_name=$5 WHERE id=$6 RETURNING *`,
      [x, y, width, height, field_name, fieldId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /fields/:fieldId — 필드 삭제
router.delete('/:fieldId', async (req, res) => {
  try {
    const { rows: check } = await query(
      `SELECT document_id FROM form_fields WHERE id=$1`,
      [req.params.fieldId]
    );
    if (!check.length) return res.status(404).json({ error: '필드를 찾을 수 없습니다' });
    if (await checkSigningLocked(check[0].document_id, req.user.email))
      return res.status(403).json({ error: '서명이 완료된 상태에서는 편집할 수 없습니다' });

    await query('DELETE FROM form_fields WHERE id=$1', [req.params.fieldId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /fields/:fieldId/value — 필드 값 업데이트
router.put('/:fieldId/value', async (req, res) => {
  const { fieldId } = req.params;
  const { value } = req.body;
  try {
    const { rows: check } = await query(
      `SELECT document_id FROM form_fields WHERE id=$1`,
      [fieldId]
    );
    if (check.length && await checkSigningLocked(check[0].document_id, req.user.email))
      return res.status(403).json({ error: '서명이 완료된 상태에서는 편집할 수 없습니다' });

    const { rows } = await query(
      `INSERT INTO field_values (field_id, user_id, value)
       VALUES ($1,$2,$3)
       ON CONFLICT (field_id, user_id)
       DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
       RETURNING *`,
      [fieldId, req.user.id, value]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
