import { Router } from 'express';
import { createHash } from 'crypto';
import archiver from 'archiver';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { buildCombinedPdf, buildIndividualPdf } from '../services/pdfMerge.js';
import { readPdf } from '../services/storage.js';
import { logAudit } from '../services/audit.js';

const router = Router();
router.use(authMiddleware);

router.post('/:docId/export', requireDocAccess, async (req, res) => {
  const { docId } = req.params;
  const userId = req.user.id;
  const { mode } = req.body;

  try {
    const { rows: docs } = await query(
      `SELECT d.pdf_path, d.pdf_hash, d.name, d.merge_mode, u.email AS owner_email
       FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id=$1`,
      [docId]
    );
    if (!docs.length) return res.status(404).json({ error: '문서를 찾을 수 없습니다' });

    const doc = docs[0];

    // 원본 PDF 무결성 검증
    if (doc.pdf_hash) {
      const originalBytes = await readPdf(doc.pdf_path);
      const currentHash = createHash('sha256').update(originalBytes).digest('hex');
      if (currentHash !== doc.pdf_hash) {
        console.error(`Integrity check failed for doc ${docId}: stored=${doc.pdf_hash} current=${currentHash}`);
        return res.status(500).json({ error: '문서 무결성 검증 실패: 원본 파일이 변조되었습니다' });
      }
    }

    const resolvedMode = mode || doc.merge_mode;

    if (resolvedMode === 'combined') {
      if (doc.owner_email !== req.user.email) return res.status(403).json({ error: '합본 내보내기는 문서 소유자만 가능합니다' });

      const { rows: shares } = await query(
        `SELECT invitee_email FROM document_shares WHERE document_id=$1 AND invite_status='accepted'`,
        [docId]
      );
      const emails = [doc.owner_email, ...shares.map(s => s.invitee_email)];
      const pdfBytes = await buildCombinedPdf(doc.pdf_path, emails, docId);
      const filename = doc.name.replace('.pdf', '') + '_combined_signed.pdf';

      await logAudit({ docId, userId, action: 'document_exported', meta: { mode: 'combined', filename }, req });
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      return res.send(Buffer.from(pdfBytes));
    }

    const pdfBytes = await buildIndividualPdf(doc.pdf_path, req.user.email, docId);
    const filename = doc.name.replace('.pdf', '') + '_signed.pdf';

    await logAudit({ docId, userId, action: 'document_exported', meta: { mode: 'individual', filename }, req });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:docId/export/bulk-individual', async (req, res) => {
  const { docId } = req.params;
  const userId = req.user.id;

  try {
    const { rows: docs } = await query(
      `SELECT d.pdf_path, d.name, u.email AS owner_email
       FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id=$1`,
      [docId]
    );
    if (!docs.length) return res.status(404).json({ error: '문서를 찾을 수 없습니다' });
    if (docs[0].owner_email !== req.user.email) return res.status(403).json({ error: '문서 소유자만 가능합니다' });

    const { rows: shares } = await query(
      `SELECT invitee_email, COALESCE(u.name, invitee_email) AS user_name
       FROM document_shares ds
       LEFT JOIN users u ON u.email = ds.invitee_email
       WHERE ds.document_id=$1 AND ds.invite_status='accepted'`,
      [docId]
    );

    const zipName = docs[0].name.replace('.pdf', '') + '_individual_exports.zip';
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    const allUsers = [{ invitee_email: req.user.email, user_name: '소유자' }, ...shares];
    for (const { invitee_email, user_name } of allUsers) {
      const pdfBytes = await buildIndividualPdf(docs[0].pdf_path, invitee_email, docId);
      const safeName = user_name.replace(/[/\\?%*:|"<>]/g, '_');
      archive.append(Buffer.from(pdfBytes), { name: `${safeName}_signed.pdf` });
    }

    await archive.finalize();
  } catch (err) {
    console.error('Bulk export error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

export default router;
