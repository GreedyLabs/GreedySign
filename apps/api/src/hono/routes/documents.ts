/**
 * /api/documents — 문서 루트 CRUD + 업로드 + 발송/무효화/삭제 (Hono 포팅본)
 *
 * 하위 라우트(`/participants`, `/fields`, `/signing`, `/export`, `/certificate`)
 * 는 상위 app 에서 별도로 마운트한다 (`app.route('/documents/:docId/export', export)` 등).
 *
 * 멀티파트: Hono 의 `c.req.parseBody({ all: true })` 사용. `file.pdf` 가
 * File/Blob 으로 들어오며, `file.arrayBuffer()` 로 바이너리를 꺼내 기존
 * `storePdf(Buffer)` 에 전달한다 (express-fileupload 와 동일한 저장 경로).
 */
import { Hono } from 'hono';
import { createHash } from 'crypto';
import { sql, eq, and, isNotNull } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { VoidDocumentBody } from '@greedylabs/greedysign-shared';
import { validate } from '../validator.js';
import { db } from '../../db/pool.js';
import { documents, documentParticipants, users, notifications } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess, requireOwner } from '../middleware/docAccess.js';
import { storePdf, readPdf, deletePdf } from '../../services/storage.js';
import { logAudit } from '../../services/audit.js';
import {
  getDocumentWithStatus,
  getDocumentFields,
  getParticipantFieldsAndResponses,
  getAllFieldResponses,
} from '../../services/queries.js';
import { broadcast, notifyUser } from '../../services/sse.js';
import { sendInviteEmail } from '../../services/email.js';
import { expressReqLike } from '../reqInfo.js';
import type { AppEnv } from '../context.js';
import type { ParticipantRole } from '../../types.js';

const documentsRoute = new Hono<AppEnv>();

documentsRoute.use('*', authMiddleware);

// ─── GET / — 문서 목록 ──────────────────────────────────────────────────────
documentsRoute.get('/', async (c) => {
  try {
    const me = c.get('user');
    const result = await db.execute(sql`
      SELECT
        d.id, d.name, d.size_bytes, d.page_count,
        d.status, d.signing_mode,
        d.created_at, d.updated_at, d.completed_at,
        u.name  AS owner_name,
        (d.owner_id = ${me.id}::uuid) AS is_owner,
        p.id    AS participant_id,
        p.role,
        p.invite_status,
        p.signing_status AS my_signing_status,
        p.is_owner AS p_is_owner,
        (SELECT COUNT(*)::int FROM document_participants
         WHERE document_id = d.id AND role = 'signer' AND invite_status = 'accepted'
           AND NOT is_owner) AS share_count,
        (SELECT COUNT(*)::int FROM document_participants
         WHERE document_id = d.id AND role = 'signer' AND invite_status = 'accepted'
           AND signing_status = 'completed' AND NOT is_owner) AS completed_count
      FROM documents d
      JOIN users u ON u.id = d.owner_id
      LEFT JOIN document_participants p ON p.document_id = d.id AND p.user_id = ${me.id}::uuid
      WHERE (
        (d.owner_id = ${me.id}::uuid AND d.campaign_id IS NULL)
        OR p.invite_status IN ('pending','accepted','declined')
      )
      ORDER BY d.updated_at DESC
    `);
    return c.json(result.rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /upload — PDF 업로드 (multipart) ───────────────────────────────────
documentsRoute.post('/upload', async (c) => {
  try {
    const me = c.get('user');
    const reqLike = expressReqLike(c);

    const form = await c.req.parseBody();
    const file = form['pdf'];
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'PDF 파일이 필요합니다' }, 400);
    }
    if (file.type !== 'application/pdf') {
      return c.json({ error: 'PDF 파일만 업로드 가능합니다' }, 400);
    }
    // Hono `parseBody` 는 표준 FormData — file.name 이 이미 UTF-8 디코드된 문자열.
    // (구 express-fileupload 시절처럼 binary→utf8 재해석하면 오히려 한글이 깨진다.)
    const fileName = (file.name || '').replace(/\0/g, '').trim() || 'document.pdf';

    const arrayBuf = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuf);

    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pageCount = pdfDoc.getPageCount();
    const pdf_path = await storePdf(fileBuffer);
    const pdf_hash = createHash('sha256').update(fileBuffer).digest('hex');

    const [doc] = await db
      .insert(documents)
      .values({
        owner_id: me.id,
        name: fileName,
        pdf_path,
        pdf_hash,
        size_bytes: fileBuffer.length,
        page_count: pageCount,
        status: 'draft',
      })
      .returning({
        id: documents.id,
        name: documents.name,
        size_bytes: documents.size_bytes,
        page_count: documents.page_count,
        status: documents.status,
        created_at: documents.created_at,
      });

    await db.insert(documentParticipants).values({
      document_id: doc.id,
      user_id: me.id,
      email: me.email,
      name: me.name,
      role: 'signer',
      is_owner: true,
      invite_status: 'accepted',
      signing_status: 'not_started',
    });

    await logAudit({
      docId: doc.id,
      userId: me.id,
      action: 'document_uploaded',
      meta: { name: fileName, size: fileBuffer.length, hash: pdf_hash },
      req: reqLike,
    });

    return c.json(doc);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── GET /:id/pdf — PDF 서빙 ──────────────────────────────────────────────────
documentsRoute.get('/:id/pdf', requireDocAccess, async (c) => {
  try {
    const id = c.req.param('id')!;
    const [doc] = await db
      .select({ pdf_path: documents.pdf_path, name: documents.name })
      .from(documents)
      .where(eq(documents.id, id));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);

    const buffer = await readPdf(doc.pdf_path);
    return c.body(new Uint8Array(buffer), 200, {
      'Content-Type': 'application/pdf; charset=utf-8',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── GET /:id — 문서 상세 ────────────────────────────────────────────────────
documentsRoute.get('/:id', requireDocAccess, async (c) => {
  try {
    const id = c.req.param('id')!;
    const me = c.get('user');
    const doc = await getDocumentWithStatus(id, me.id);
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);

    const fields = await getDocumentFields(id);
    let myFields: Record<string, unknown>[] = [];
    let myResponses: Record<string, unknown>[] = [];
    if (doc.participant_id) {
      const result = await getParticipantFieldsAndResponses(id, doc.participant_id as string);
      myFields = result.fields;
      myResponses = result.responses;
    }
    const allResponses = await getAllFieldResponses(id);
    return c.json({ ...doc, fields, myFields, myResponses, allResponses });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /:id/send — 발송 ────────────────────────────────────────────────────
documentsRoute.post('/:id/send', requireOwner, async (c) => {
  const docId = c.req.param('id')!;
  const me = c.get('user');
  const reqLike = expressReqLike(c);
  try {
    const [doc] = await db
      .select({
        status: documents.status,
        name: documents.name,
        owner_id: documents.owner_id,
      })
      .from(documents)
      .where(eq(documents.id, docId));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);
    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, doc.owner_id));
    const owner_name = owner?.name ?? '';
    if (doc.status !== 'draft') {
      return c.json({ error: '초안 상태의 문서만 발송할 수 있습니다' }, 400);
    }

    const signers = await db
      .select({ id: documentParticipants.id })
      .from(documentParticipants)
      .where(
        and(eq(documentParticipants.document_id, docId), eq(documentParticipants.role, 'signer'))
      );
    if (!signers.length) {
      return c.json(
        { error: '서명자가 없습니다. 참여자 중 최소 1명은 서명자 역할이어야 합니다' },
        400
      );
    }

    await db
      .update(documents)
      .set({ status: 'in_progress', updated_at: sql`NOW()` })
      .where(eq(documents.id, docId));
    await db
      .update(documentParticipants)
      .set({ signing_status: 'in_progress' })
      .where(
        and(eq(documentParticipants.document_id, docId), eq(documentParticipants.is_owner, true))
      );

    const pending = await db
      .select({
        id: documentParticipants.id,
        email: documentParticipants.email,
        role: documentParticipants.role,
        invite_token: documentParticipants.invite_token,
      })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.document_id, docId),
          eq(documentParticipants.invite_status, 'pending')
        )
      );

    for (const p of pending) {
      if (p.invite_token) {
        sendInviteEmail({
          toEmail: p.email,
          inviterName: owner_name,
          docName: doc.name,
          token: p.invite_token,
          role: (p.role as ParticipantRole) ?? undefined,
        }).catch((err) => console.error('Email error:', (err as Error).message));
      }

      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, p.email));
      if (existingUser) {
        await db.insert(notifications).values({
          user_id: existingUser.id,
          type: 'invite_received',
          title: `서명 요청: ${doc.name}`,
          body: `${owner_name}님이 서명을 요청했습니다.`,
          document_id: docId,
        });
        notifyUser(existingUser.id, { type: 'invite_received', document_id: docId });
      }
    }

    await logAudit({
      docId,
      userId: me.id,
      action: 'document_sent',
      meta: { signer_count: signers.length },
      req: reqLike,
    });
    const updatedDoc = await getDocumentWithStatus(docId, me.id);
    return c.json(updatedDoc);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── PATCH /:id/void — 무효화 ────────────────────────────────────────────────
documentsRoute.patch('/:id/void', requireOwner, validate('json', VoidDocumentBody), async (c) => {
  const docId = c.req.param('id')!;
  const me = c.get('user');
  const reqLike = expressReqLike(c);
  const reason = c.req.valid('json').reason ?? '';
  try {
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);
    if (doc.status === 'completed') {
      return c.json({ error: '서명이 완료된 문서는 무효화할 수 없습니다' }, 400);
    }
    if (doc.status === 'voided') {
      return c.json({ error: '이미 무효화된 문서입니다' }, 400);
    }

    await db
      .update(documents)
      .set({
        status: 'voided',
        voided_at: sql`NOW()`,
        voided_by: me.id,
        voided_reason: reason,
        updated_at: sql`NOW()`,
      })
      .where(eq(documents.id, docId));

    const parts = await db
      .select({ user_id: documentParticipants.user_id })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.document_id, docId),
          isNotNull(documentParticipants.user_id),
          eq(documentParticipants.is_owner, false)
        )
      );
    const [docInfo] = await db
      .select({ name: documents.name })
      .from(documents)
      .where(eq(documents.id, docId));

    for (const p of parts as { user_id: string }[]) {
      await db.insert(notifications).values({
        user_id: p.user_id,
        type: 'document_voided',
        title: `문서 무효화: ${docInfo?.name ?? ''}`,
        body: reason || '소유자가 서명 요청을 취소했습니다.',
        document_id: docId,
      });
      notifyUser(p.user_id, { type: 'document_voided', document_id: docId });
    }

    broadcast(docId, { type: 'document_voided', document_id: docId });
    await logAudit({
      docId,
      userId: me.id,
      action: 'document_voided',
      meta: { reason },
      req: reqLike,
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── DELETE /:id — 삭제 ──────────────────────────────────────────────────────
documentsRoute.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')!;
    const me = c.get('user');
    const [doc] = await db
      .select({ owner_id: documents.owner_id, pdf_path: documents.pdf_path })
      .from(documents)
      .where(eq(documents.id, id));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);
    if (doc.owner_id !== me.id) return c.json({ error: '권한이 없습니다' }, 403);

    await db.delete(documents).where(eq(documents.id, id));
    await deletePdf(doc.pdf_path);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default documentsRoute;
