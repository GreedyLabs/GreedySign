import { Router } from 'express';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.post('/documents/:docId/fields', async (req, res) => {
  const { docId } = req.params;
  const { field_type, field_name, x, y, width, height, page_number = 1 } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO form_fields (document_id, page_number, field_type, field_name, x, y, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [docId, page_number, field_type, field_name, x, y, width, height]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/fields/:fieldId', async (req, res) => {
  const { fieldId } = req.params;
  const { x, y, width, height, field_name } = req.body;
  try {
    const { rows } = await query(
      `UPDATE form_fields SET x=$1,y=$2,width=$3,height=$4,field_name=$5 WHERE id=$6 RETURNING *`,
      [x, y, width, height, field_name, fieldId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/fields/:fieldId', async (req, res) => {
  try {
    await query('DELETE FROM form_fields WHERE id=$1', [req.params.fieldId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/fields/:fieldId/value', async (req, res) => {
  const { fieldId } = req.params;
  const { value } = req.body;
  try {
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
