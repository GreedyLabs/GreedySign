import { Router } from 'express';
import { createHash } from 'crypto';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { PDFDocument } from 'pdf-lib';
import { storePdf, readPdf, deletePdf } from '../services/storage.js';
import { logAudit } from '../services/audit.js';
import { getDocumentWithSigningStatus, getDocumentFields, getUserFieldValues, getUserSignaturePlacements } from '../services/queries.js';
import sharesRouter from './shares.js';
import signingRouter from './signing.js';
import exportRouter from './export.js';
import fieldsRouter from './fields.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const userEmail = req.user.email;
    const { rows } = await query(
      `SELECT d.id, d.name, d.size_bytes, d.page_count, d.created_at, d.updated_at,
              u.name AS owner_name, d.merge_mode,
              (u.email = $1) AS is_owner,
              ds.invite_status,
              COALESCE(ds.signing_status, 'not_started') AS my_signing_status,
              (SELECT COUNT(*)::int FROM document_shares WHERE document_id = d.id AND invite_status = 'accepted') AS share_count
       FROM documents d
       JOIN users u ON d.owner_id = u.id
       LEFT JOIN document_shares ds ON ds.document_id = d.id AND ds.invitee_email = $1
       WHERE u.email = $1
          OR ds.invite_status IN ('pending', 'accepted', 'declined')
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
  try {
    const doc = await getDocumentWithSigningStatus(req.params.id, req.user.email);
    if (!doc) return res.status(404).json({ error: '문서를 찾을 수 없습니다' });

    const fields = await getDocumentFields(req.params.id);
    const values = await getUserFieldValues(req.params.id, req.user.id);
    const sigs = await getUserSignaturePlacements(req.params.id, req.user.id);

    res.json({ ...doc, fields, myValues: values, mySignatures: sigs });
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

// 하위 라우터 마운트 (문서별 리소스)
router.use('/:docId/shares', sharesRouter);
router.use('/:docId/signing', signingRouter);
router.use('/:docId/export', exportRouter);
router.use('/:docId/fields', fieldsRouter);

export default router;
