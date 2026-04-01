import { Router } from 'express';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { checkSigningLocked } from '../services/queries.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// POST / — 필드 생성 (문서 접근 권한 필요)
router.post('/', requireDocAccess, async (req, res) => {
  const { docId } = req.params;
  const { field_type, field_name, x, y, width, height, page_number = 1 } = req.body;
  try {
    if (await checkSigningLocked(docId, req.user.email))
      return res.status(403).json({ error: '서명이 완료된 상태에서는 편집할 수 없습니다' });
    const { rows } = await query(
      `INSERT INTO form_fields (document_id, created_by, page_number, field_type, field_name, x, y, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [docId, req.user.id, page_number, field_type, field_name, x, y, width, height]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
