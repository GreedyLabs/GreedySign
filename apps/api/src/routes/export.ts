import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import archiver from 'archiver';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { documents, documentParticipants, users } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { buildCombinedPdf, buildIndividualPdf } from '../services/pdfMerge.js';
import { readPdf } from '../services/storage.js';
import { logAudit } from '../services/audit.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.post('/', requireDocAccess, async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  const { mode = 'combined' } = req.body as { mode?: string };

  try {
    const [doc] = await db
      .select({
        pdf_path: documents.pdf_path,
        pdf_hash: documents.pdf_hash,
        name: documents.name,
        status: documents.status,
        signed_pdf_path: documents.signed_pdf_path,
        signed_pdf_hash: documents.signed_pdf_hash,
        owner_id: documents.owner_id,
      })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }

    // 서명 완료 문서 → frozen PDF 직접 서빙
    if (doc.status === 'completed' && doc.signed_pdf_path) {
      const frozenBytes = await readPdf(doc.signed_pdf_path);
      if (doc.signed_pdf_hash) {
        const hash = createHash('sha256').update(frozenBytes).digest('hex');
        if (hash !== doc.signed_pdf_hash) {
          res.status(500).json({ error: '서명본 무결성 검증 실패: 파일이 변조되었습니다' });
          return;
        }
      }
      const filename = doc.name.replace('.pdf', '') + '_fully_signed.pdf';
      await logAudit({
        docId: docId!,
        userId: req.user.id,
        action: 'document_exported',
        meta: { mode: 'frozen', filename },
        req,
      });
      res.set('Content-Type', 'application/pdf');
      res.set(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      );
      res.send(frozenBytes);
      return;
    }

    // 원본 무결성 검증
    if (doc.pdf_hash) {
      const origBytes = await readPdf(doc.pdf_path);
      if (createHash('sha256').update(origBytes).digest('hex') !== doc.pdf_hash) {
        res.status(500).json({ error: '문서 무결성 검증 실패: 원본 파일이 변조되었습니다' });
        return;
      }
    }

    if (mode === 'combined') {
      if (doc.owner_id !== req.user.id) {
        res.status(403).json({ error: '합본 내보내기는 문서 소유자만 가능합니다' });
        return;
      }
      const accepted = await db
        .select({ id: documentParticipants.id })
        .from(documentParticipants)
        .where(eq(documentParticipants.document_id, docId!));
      const pdfBytes = await buildCombinedPdf(
        doc.pdf_path,
        docId!,
        accepted.map((p) => p.id)
      );
      const filename = doc.name.replace('.pdf', '') + '_combined.pdf';
      await logAudit({
        docId: docId!,
        userId: req.user.id,
        action: 'document_exported',
        meta: { mode: 'combined', filename },
        req,
      });
      res.set('Content-Type', 'application/pdf');
      res.set(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      );
      res.send(Buffer.from(pdfBytes));
      return;
    }

    // individual
    const [myPart] = await db
      .select({ id: documentParticipants.id })
      .from(documentParticipants)
      .where(eq(documentParticipants.document_id, docId!));
    if (!myPart) {
      res.status(403).json({ error: '참여자를 찾을 수 없습니다' });
      return;
    }

    const pdfBytes = await buildIndividualPdf(doc.pdf_path, docId!, myPart.id);
    const filename = doc.name.replace('.pdf', '') + '_signed.pdf';
    await logAudit({
      docId: docId!,
      userId: req.user.id,
      action: 'document_exported',
      meta: { mode: 'individual', filename },
      req,
    });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/bulk-individual', async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  try {
    const [doc] = await db
      .select({
        pdf_path: documents.pdf_path,
        pdf_hash: documents.pdf_hash,
        name: documents.name,
        owner_id: documents.owner_id,
      })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }
    if (doc.owner_id !== req.user.id) {
      res.status(403).json({ error: '문서 소유자만 가능합니다' });
      return;
    }

    if (doc.pdf_hash) {
      const origBytes = await readPdf(doc.pdf_path);
      if (createHash('sha256').update(origBytes).digest('hex') !== doc.pdf_hash) {
        res.status(500).json({ error: '문서 무결성 검증 실패' });
        return;
      }
    }

    const partsResult = await db.execute(sql`
      SELECT p.id, COALESCE(u.name, p.name, p.email) AS display_name
      FROM document_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.document_id = ${docId}::uuid AND p.invite_status = 'accepted'
    `);

    const zipName = doc.name.replace('.pdf', '') + '_individual_exports.zip';
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const p of partsResult.rows as { id: string; display_name: string }[]) {
      const pdfBytes = await buildIndividualPdf(doc.pdf_path, docId!, p.id);
      const safeName = p.display_name.replace(/[/\\?%*:|"<>]/g, '_');
      archive.append(Buffer.from(pdfBytes), { name: `${safeName}_signed.pdf` });
    }

    await archive.finalize();
    await logAudit({
      docId: docId!,
      userId: req.user.id,
      action: 'document_exported',
      meta: { mode: 'bulk-individual', zipName },
      req,
    });
  } catch (err) {
    console.error('Bulk export error:', err);
    if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
