import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import { documents, documentParticipants, users, notifications } from '../db/schema.js';
import { PDFDocument } from 'pdf-lib';
import { storePdf, readPdf, deletePdf } from '../services/storage.js';
import { logAudit } from '../services/audit.js';
import {
  getDocumentWithStatus,
  getDocumentFields,
  getParticipantFieldsAndResponses,
} from '../services/queries.js';
import { broadcast, notifyUser } from '../services/sse.js';
import { sendInviteEmail } from '../services/email.js';
import participantsRouter from './participants.js';
import signingRouter from './signing.js';
import exportRouter from './export.js';
import fieldsRouter from './fields.js';
import certificateRouter from './certificate.js';

import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess, requireOwner } from '../middleware/docAccess.js';
import type { UploadedFile, FileArray } from 'express-fileupload';
import type { ParticipantRole } from '../types.js';
declare module 'express-serve-static-core' {
  interface Request {
    files?: FileArray | null;
  }
}

const router = Router();
router.use(authMiddleware);

// ─── GET / — 문서 목록 ──────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT
        d.id, d.name, d.size_bytes, d.page_count,
        d.status, d.signing_mode,
        d.created_at, d.updated_at, d.completed_at,
        u.name  AS owner_name,
        (d.owner_id = ${req.user.id}::uuid) AS is_owner,
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
      LEFT JOIN document_participants p ON p.document_id = d.id AND p.user_id = ${req.user.id}::uuid
      WHERE d.owner_id = ${req.user.id}::uuid
         OR (p.invite_status IN ('pending','accepted','declined'))
      ORDER BY d.updated_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /upload — PDF 업로드 ────────────────────────────────────────────────
router.post('/upload', async (req: Request, res: Response): Promise<void> => {
  if (!req.files?.pdf) {
    res.status(400).json({ error: 'PDF 파일이 필요합니다' });
    return;
  }
  const file = req.files.pdf as UploadedFile;
  if (file.mimetype !== 'application/pdf') {
    res.status(400).json({ error: 'PDF 파일만 업로드 가능합니다' });
    return;
  }
  const fileName =
    Buffer.from(file.name, 'binary').toString('utf8').replace(/\0/g, '').trim() || 'document.pdf';

  try {
    const pdfDoc = await PDFDocument.load(file.data);
    const pageCount = pdfDoc.getPageCount();
    const pdf_path = await storePdf(file.data);
    const pdf_hash = createHash('sha256').update(file.data).digest('hex');

    const [doc] = await db
      .insert(documents)
      .values({
        owner_id: req.user.id,
        name: fileName,
        pdf_path,
        pdf_hash,
        size_bytes: file.size,
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
      user_id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: 'signer',
      is_owner: true,
      invite_status: 'accepted',
      signing_status: 'not_started',
    });

    await logAudit({
      docId: doc.id,
      userId: req.user.id,
      action: 'document_uploaded',
      meta: { name: fileName, size: file.size, hash: pdf_hash },
      req,
    });

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /:id/pdf — PDF 서빙 ──────────────────────────────────────────────────
router.get('/:id/pdf', requireDocAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const [doc] = await db
      .select({ pdf_path: documents.pdf_path, name: documents.name })
      .from(documents)
      .where(eq(documents.id, req.params.id));
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }

    const buffer = await readPdf(doc.pdf_path);
    res.set('Content-Type', 'application/pdf; charset=utf-8');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /:id — 문서 상세 ────────────────────────────────────────────────────
router.get('/:id', requireDocAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await getDocumentWithStatus(req.params.id, req.user.id);
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }

    const fields = await getDocumentFields(req.params.id);
    let myFields: Record<string, unknown>[] = [];
    let myResponses: Record<string, unknown>[] = [];
    if (doc.participant_id) {
      const result = await getParticipantFieldsAndResponses(
        req.params.id,
        doc.participant_id as string
      );
      myFields = result.fields;
      myResponses = result.responses;
    }
    res.json({ ...doc, fields, myFields, myResponses });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /:id/send — 발송 ────────────────────────────────────────────────────
router.post('/:id/send', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const docId = req.params.id;
  try {
    const docResult = await db.execute(sql`
      SELECT d.*, u.name AS owner_name
      FROM documents d JOIN users u ON u.id = d.owner_id
      WHERE d.id = ${docId}::uuid
    `);
    if (!docResult.rows.length) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }
    const doc = docResult.rows[0] as { status: string; name: string; owner_name: string };
    if (doc.status !== 'draft') {
      res.status(400).json({ error: '초안 상태의 문서만 발송할 수 있습니다' });
      return;
    }

    const signers = await db
      .select({ id: documentParticipants.id })
      .from(documentParticipants)
      .where(
        and(eq(documentParticipants.document_id, docId), eq(documentParticipants.role, 'signer'))
      );
    if (!signers.length) {
      res
        .status(400)
        .json({ error: '서명자가 없습니다. 참여자 중 최소 1명은 서명자 역할이어야 합니다' });
      return;
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

    // pending 참여자들 초대 이메일
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
          inviterName: doc.owner_name,
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
          body: `${doc.owner_name}님이 서명을 요청했습니다.`,
          document_id: docId,
        });
        notifyUser(existingUser.id, { type: 'invite_received', document_id: docId });
      }
    }

    await logAudit({
      docId,
      userId: req.user.id,
      action: 'document_sent',
      meta: { signer_count: signers.length },
      req,
    });
    const updatedDoc = await getDocumentWithStatus(docId, req.user.id);
    res.json(updatedDoc);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── PATCH /:id/void — 무효화 ────────────────────────────────────────────────
router.patch('/:id/void', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const docId = req.params.id;
  const { reason = '' } = req.body as { reason?: string };
  try {
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId));
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }
    if (doc.status === 'completed') {
      res.status(400).json({ error: '서명이 완료된 문서는 무효화할 수 없습니다' });
      return;
    }
    if (doc.status === 'voided') {
      res.status(400).json({ error: '이미 무효화된 문서입니다' });
      return;
    }

    await db
      .update(documents)
      .set({
        status: 'voided',
        voided_at: sql`NOW()`,
        voided_by: req.user.id,
        voided_reason: reason,
        updated_at: sql`NOW()`,
      })
      .where(eq(documents.id, docId));

    const partsResult = await db.execute(sql`
      SELECT p.user_id FROM document_participants p
      WHERE p.document_id = ${docId}::uuid AND p.user_id IS NOT NULL AND NOT p.is_owner
    `);
    const [docInfo] = await db
      .select({ name: documents.name })
      .from(documents)
      .where(eq(documents.id, docId));

    for (const p of partsResult.rows as { user_id: string }[]) {
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
      userId: req.user.id,
      action: 'document_voided',
      meta: { reason },
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── DELETE /:id — 삭제 ──────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const [doc] = await db
      .select({ owner_id: documents.owner_id, pdf_path: documents.pdf_path })
      .from(documents)
      .where(eq(documents.id, req.params.id));
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }
    if (doc.owner_id !== req.user.id) {
      res.status(403).json({ error: '권한이 없습니다' });
      return;
    }

    await db.delete(documents).where(eq(documents.id, req.params.id));
    await deletePdf(doc.pdf_path);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── 하위 라우터 ─────────────────────────────────────────────────────────────
router.use('/:docId/participants', participantsRouter);
router.use('/:docId/signing', signingRouter);
router.use('/:docId/export', exportRouter);
router.use('/:docId/fields', fieldsRouter);
router.use('/:docId/certificate', certificateRouter);

export default router;
