import { Router } from 'express';
import { createHash } from 'crypto';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { PDFDocument } from 'pdf-lib';
import { storePdf, readPdf, deletePdf } from '../services/storage.js';
import { logAudit } from '../services/audit.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const userId = req.user.id;
  try {
    const userEmail = req.user.email;
    const { rows } = await query(
      `SELECT d.id, d.name, d.size_bytes, d.page_count, d.created_at, d.updated_at,
              u.name AS owner_name, d.merge_mode,
              (u.email = $1) AS is_owner,
              ds.invite_status,
              COALESCE(ds.signing_status, 'not_started') AS my_signing_status
       FROM documents d
       JOIN users u ON d.owner_id = u.id
       LEFT JOIN document_shares ds ON ds.document_id = d.id AND ds.invitee_email = $1
       WHERE u.email = $1
          OR ds.invite_status IN ('pending', 'accepted')
       ORDER BY d.updated_at DESC`,
      [userEmail]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', async (req, res) => {
  if (!req.files?.pdf) return res.status(400).json({ error: 'PDF 파일이 필요합니다' });

  const file = req.files.pdf;
  if (file.mimetype !== 'application/pdf')
    return res.status(400).json({ error: 'PDF 파일만 업로드 가능합니다' });

  const fileName = Buffer.from(file.name, 'binary').toString('utf8').replace(/\0/g, '').trim() || 'document.pdf';

  try {
    const pdfDoc = await PDFDocument.load(file.data);
    const pageCount = pdfDoc.getPageCount();
    const pdfPath = await storePdf(file.data);
    const pdfHash = createHash('sha256').update(file.data).digest('hex');

    const { rows } = await query(
      `INSERT INTO documents (owner_id, name, pdf_path, pdf_hash, size_bytes, page_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, size_bytes, page_count, created_at`,
      [req.user.id, fileName, pdfPath, pdfHash, file.size, pageCount]
    );
    await logAudit({ docId: rows[0].id, userId: req.user.id, action: 'document_uploaded', meta: { name: fileName, size: file.size, hash: pdfHash }, req });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/pdf', requireDocAccess, async (req, res) => {
  try {
    const { rows } = await query('SELECT pdf_path, name FROM documents WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '문서를 찾을 수 없습니다' });

    const buffer = await readPdf(rows[0].pdf_path);
    res.set('Content-Type', 'application/pdf; charset=utf-8');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].name)}`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireDocAccess, async (req, res) => {
  const userEmail = req.user.email;
  const userId = req.user.id;
  try {
    const { rows } = await query(
      `SELECT d.id, d.name, d.size_bytes, d.page_count, d.created_at, d.merge_mode,
              u.name AS owner_name, u.email AS owner_email,
              (u.email = $2) AS is_owner,
              COALESCE(ds.signing_status, 'not_started') AS my_signing_status
       FROM documents d
       JOIN users u ON d.owner_id = u.id
       LEFT JOIN document_shares ds ON ds.document_id = d.id AND ds.invitee_email = $2
       WHERE d.id = $1`,
      [req.params.id, userEmail]
    );
    if (!rows.length) return res.status(404).json({ error: '문서를 찾을 수 없습니다' });

    const { rows: fields } = await query(
      'SELECT * FROM form_fields WHERE document_id=$1 ORDER BY page_number, id',
      [req.params.id]
    );
    const { rows: values } = await query(
      `SELECT fv.field_id, fv.value, fv.updated_at
       FROM field_values fv
       JOIN form_fields ff ON ff.id = fv.field_id
       WHERE ff.document_id = $1 AND fv.user_id = $2`,
      [req.params.id, userId]
    );
    const { rows: sigs } = await query(
      'SELECT * FROM signature_placements WHERE document_id=$1 AND user_id=$2',
      [req.params.id, userId]
    );

    res.json({ ...rows[0], fields, myValues: values, mySignatures: sigs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/merge-mode', async (req, res) => {
  const { merge_mode } = req.body;
  if (!['combined', 'individual'].includes(merge_mode))
    return res.status(400).json({ error: '유효하지 않은 병합 방식입니다' });

  try {
    const { rows } = await query(
      'UPDATE documents SET merge_mode=$1 WHERE id=$2 AND owner_id=$3 RETURNING id, merge_mode',
      [merge_mode, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(403).json({ error: '권한이 없습니다' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT owner_id, pdf_path FROM documents WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '문서를 찾을 수 없습니다' });
    if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: '권한이 없습니다' });

    await query('DELETE FROM documents WHERE id=$1', [req.params.id]);
    await deletePdf(rows[0].pdf_path);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
