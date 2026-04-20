/**
 * /api/documents/:docId/export — PDF/ZIP 내보내기 (Hono 포팅본)
 *
 * 응답은 바이너리. Hono 는 Web Fetch Response 기반이라 Buffer/Uint8Array/Stream
 * 을 직접 body 로 넣을 수 있다.
 *  - PDF 단일: `c.body(bytes, 200, headers)` 로 고정 크기 바이너리 반환
 *  - ZIP bulk-individual: `archiver` → Node PassThrough → ReadableStream 변환 후
 *    `c.body(stream, ...)` 로 스트리밍 (Hono 가 Web Stream 을 소비)
 */
import { Hono } from 'hono';
import { createHash } from 'crypto';
import { PassThrough, Readable } from 'stream';
import archiver from 'archiver';
import { sql, eq } from 'drizzle-orm';
import { ExportDocumentBody } from '@greedylabs/greedysign-shared';
import { validate } from '../validator.js';
import { db } from '../../db/pool.js';
import { documents, documentParticipants } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { buildCombinedPdf, buildIndividualPdf } from '../../services/pdfMerge.js';
import { readPdf } from '../../services/storage.js';
import { logAudit } from '../../services/audit.js';
import { expressReqLike } from '../reqInfo.js';
import type { AppEnv } from '../context.js';

const exportRoute = new Hono<AppEnv>();

exportRoute.use('*', authMiddleware);

function attachmentHeaders(contentType: string, filename: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  };
}

exportRoute.post('/', requireDocAccess, validate('json', ExportDocumentBody), async (c) => {
  const docId = c.req.param('docId')!;
  const me = c.get('user');
  const reqLike = expressReqLike(c);
  const mode = c.req.valid('json').mode ?? 'combined';

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
      .where(eq(documents.id, docId));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);

    // 서명 완료 문서 → 확정된 PDF 직접 서빙
    if (doc.status === 'completed' && doc.signed_pdf_path) {
      const frozenBytes = await readPdf(doc.signed_pdf_path);
      if (doc.signed_pdf_hash) {
        const hash = createHash('sha256').update(frozenBytes).digest('hex');
        if (hash !== doc.signed_pdf_hash) {
          return c.json({ error: '서명본 무결성 검증 실패: 파일이 변조되었습니다' }, 500);
        }
      }
      const filename = doc.name.replace('.pdf', '') + '_fully_signed.pdf';
      await logAudit({
        docId,
        userId: me.id,
        action: 'document_exported',
        meta: { mode: 'frozen', filename },
        req: reqLike,
      });
      return c.body(new Uint8Array(frozenBytes), 200, attachmentHeaders('application/pdf', filename));
    }

    // 원본 무결성 검증
    if (doc.pdf_hash) {
      const origBytes = await readPdf(doc.pdf_path);
      if (createHash('sha256').update(origBytes).digest('hex') !== doc.pdf_hash) {
        return c.json({ error: '문서 무결성 검증 실패: 원본 파일이 변조되었습니다' }, 500);
      }
    }

    if (mode === 'combined') {
      if (doc.owner_id !== me.id) {
        return c.json({ error: '합본 내보내기는 문서 소유자만 가능합니다' }, 403);
      }
      const accepted = await db
        .select({ id: documentParticipants.id })
        .from(documentParticipants)
        .where(eq(documentParticipants.document_id, docId));
      const pdfBytes = await buildCombinedPdf(
        doc.pdf_path,
        docId,
        accepted.map((p) => p.id)
      );
      const filename = doc.name.replace('.pdf', '') + '_combined.pdf';
      await logAudit({
        docId,
        userId: me.id,
        action: 'document_exported',
        meta: { mode: 'combined', filename },
        req: reqLike,
      });
      return c.body(
        new Uint8Array(pdfBytes),
        200,
        attachmentHeaders('application/pdf', filename)
      );
    }

    // individual
    const [myPart] = await db
      .select({ id: documentParticipants.id })
      .from(documentParticipants)
      .where(eq(documentParticipants.document_id, docId));
    if (!myPart) return c.json({ error: '참여자를 찾을 수 없습니다' }, 403);

    const pdfBytes = await buildIndividualPdf(doc.pdf_path, docId, myPart.id);
    const filename = doc.name.replace('.pdf', '') + '_signed.pdf';
    await logAudit({
      docId,
      userId: me.id,
      action: 'document_exported',
      meta: { mode: 'individual', filename },
      req: reqLike,
    });
    return c.body(
      new Uint8Array(pdfBytes),
      200,
      attachmentHeaders('application/pdf', filename)
    );
  } catch (err) {
    console.error('Export error:', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

exportRoute.post('/bulk-individual', async (c) => {
  const docId = c.req.param('docId')!;
  const me = c.get('user');
  const reqLike = expressReqLike(c);

  try {
    const [doc] = await db
      .select({
        pdf_path: documents.pdf_path,
        pdf_hash: documents.pdf_hash,
        name: documents.name,
        owner_id: documents.owner_id,
      })
      .from(documents)
      .where(eq(documents.id, docId));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);
    if (doc.owner_id !== me.id) return c.json({ error: '문서 소유자만 가능합니다' }, 403);

    if (doc.pdf_hash) {
      const origBytes = await readPdf(doc.pdf_path);
      if (createHash('sha256').update(origBytes).digest('hex') !== doc.pdf_hash) {
        return c.json({ error: '문서 무결성 검증 실패' }, 500);
      }
    }

    const partsResult = await db.execute(sql`
      SELECT p.id, COALESCE(u.name, p.name, p.email) AS display_name
      FROM document_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.document_id = ${docId}::uuid AND p.invite_status = 'accepted'
    `);

    const zipName = doc.name.replace('.pdf', '') + '_individual_exports.zip';

    // archiver → Node stream → Web ReadableStream. archiver 에 직접 Web stream
    // 을 연결할 수 없어 PassThrough 로 한번 거친다.
    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('archiver error:', err.message);
      passThrough.destroy(err);
    });
    archive.pipe(passThrough);

    // 비동기로 엔트리 추가 → finalize. 응답은 먼저 반환(스트리밍 시작).
    (async () => {
      try {
        for (const p of partsResult.rows as { id: string; display_name: string }[]) {
          const pdfBytes = await buildIndividualPdf(doc.pdf_path, docId, p.id);
          const safeName = p.display_name.replace(/[/\\?%*:|"<>]/g, '_');
          archive.append(Buffer.from(pdfBytes), { name: `${safeName}_signed.pdf` });
        }
        await archive.finalize();
        await logAudit({
          docId,
          userId: me.id,
          action: 'document_exported',
          meta: { mode: 'bulk-individual', zipName },
          req: reqLike,
        });
      } catch (err) {
        console.error('Bulk export build error:', (err as Error).message);
        passThrough.destroy(err as Error);
      }
    })();

    const webStream = Readable.toWeb(passThrough) as ReadableStream<Uint8Array>;
    return c.body(webStream, 200, attachmentHeaders('application/zip', zipName));
  } catch (err) {
    console.error('Bulk export error:', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default exportRoute;
