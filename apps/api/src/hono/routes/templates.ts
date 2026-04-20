/**
 * /api/templates — PDF 템플릿 + 앵커 필드 + 1:1 발송 (Hono 포팅본)
 *
 * 멀티파트 업로드는 `c.req.parseBody()` 로 받는다 — `express-fileupload` 의
 * `req.files.pdf` 와 동일하게 `pdf` 키를 기대.
 */
import { Hono } from 'hono';
import { createHash, randomBytes } from 'crypto';
import { sql, eq, and } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import {
  UpdateTemplateBody,
  CreateTemplateFieldBody,
  UpdateTemplateFieldBody,
  InstantiateTemplateBody,
} from '@greedylabs/greedysign-shared';
import { validate } from '../validator.js';
import { db } from '../../db/pool.js';
import {
  documentTemplates,
  templateFields,
  signingCampaigns,
  documents,
  documentParticipants,
  formFields,
  users,
  notifications,
} from '../../db/schema.js';
import { storePdf, readPdf, deletePdf } from '../../services/storage.js';
import { logAudit } from '../../services/audit.js';
import { sendInviteEmail } from '../../services/email.js';
import { notifyUser } from '../../services/sse.js';
import { authMiddleware } from '../middleware/auth.js';
import { expressReqLike } from '../reqInfo.js';
import type { AppEnv } from '../context.js';

const templates = new Hono<AppEnv>();

templates.use('*', authMiddleware);

async function getOwnedTemplate(templateId: string, userId: string) {
  const [tpl] = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.id, templateId));
  if (!tpl) return { error: 'NOT_FOUND' as const };
  if (tpl.owner_id !== userId) return { error: 'FORBIDDEN' as const };
  return { template: tpl };
}

// ─── GET / — 내 템플릿 목록 ─────────────────────────────────────────────────
templates.get('/', async (c) => {
  try {
    const me = c.get('user');
    const result = await db.execute(sql`
      SELECT
        t.id, t.name, t.description, t.size_bytes, t.page_count,
        t.status, t.created_at, t.updated_at,
        (SELECT COUNT(*)::int FROM template_fields WHERE template_id = t.id) AS field_count,
        (SELECT COUNT(*)::int FROM signing_campaigns WHERE template_id = t.id) AS campaign_count
      FROM document_templates t
      WHERE t.owner_id = ${me.id}::uuid
        AND t.status <> 'archived'
      ORDER BY t.updated_at DESC
    `);
    return c.json(result.rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /upload — PDF 업로드 → 템플릿 생성 (multipart) ───────────────────
templates.post('/upload', async (c) => {
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
    const fileName = (file.name || '').replace(/\0/g, '').trim() || 'template.pdf';

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pageCount = pdfDoc.getPageCount();
    const pdf_path = await storePdf(fileBuffer);
    const pdf_hash = createHash('sha256').update(fileBuffer).digest('hex');

    const [tpl] = await db
      .insert(documentTemplates)
      .values({
        owner_id: me.id,
        name: fileName,
        pdf_path,
        pdf_hash,
        size_bytes: fileBuffer.length,
        page_count: pageCount,
        status: 'draft',
      })
      .returning();

    await logAudit({
      userId: me.id,
      action: 'template_created',
      meta: { template_id: tpl.id, name: fileName, hash: pdf_hash },
      req: reqLike,
    });
    return c.json(tpl);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── GET /:id — 템플릿 상세 + 필드 ──────────────────────────────────────────
templates.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const me = c.get('user');
    const owned = await getOwnedTemplate(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const fields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.template_id, id));
    return c.json({ ...owned.template, fields });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── GET /:id/pdf — 템플릿 PDF 서빙 ─────────────────────────────────────────
templates.get('/:id/pdf', async (c) => {
  try {
    const id = c.req.param('id');
    const me = c.get('user');
    const owned = await getOwnedTemplate(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const buffer = await readPdf(owned.template.pdf_path);
    return c.body(new Uint8Array(buffer), 200, {
      'Content-Type': 'application/pdf; charset=utf-8',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(owned.template.name)}`,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── PATCH /:id — 이름/설명/상태 ─────────────────────────────────────────────
templates.patch('/:id', validate('json', UpdateTemplateBody), async (c) => {
  try {
    const id = c.req.param('id');
    const me = c.get('user');
    const { name, description, status } = c.req.valid('json');

    const owned = await getOwnedTemplate(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);

    if (status === 'ready') {
      const [{ count }] = (await db.execute(sql`
        SELECT COUNT(*)::int AS count FROM template_fields WHERE template_id = ${id}::uuid
      `)).rows as Array<{ count: number }>;
      if (!count) return c.json({ error: '필드가 1개 이상 필요합니다' }, 400);
    }

    const [updated] = await db
      .update(documentTemplates)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        updated_at: sql`NOW()`,
      })
      .where(eq(documentTemplates.id, id))
      .returning();
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── DELETE /:id — 템플릿 삭제 ──────────────────────────────────────────────
templates.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const me = c.get('user');
    const owned = await getOwnedTemplate(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const [{ count }] = (await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM signing_campaigns
      WHERE template_id = ${id}::uuid AND status IN ('draft','in_progress')
    `)).rows as Array<{ count: number }>;
    if (count > 0) {
      return c.json(
        {
          error:
            '진행 중인 캠페인이 있는 템플릿은 삭제할 수 없습니다 (보관(archive) 처리하세요).',
        },
        400
      );
    }

    await db.delete(documentTemplates).where(eq(documentTemplates.id, id));
    await deletePdf(owned.template.pdf_path);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── 필드 ────────────────────────────────────────────────────────────────────
templates.get('/:id/fields', async (c) => {
  try {
    const id = c.req.param('id');
    const me = c.get('user');
    const owned = await getOwnedTemplate(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const rows = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.template_id, id));
    return c.json(rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

templates.post('/:id/fields', validate('json', CreateTemplateFieldBody), async (c) => {
  try {
    const id = c.req.param('id');
    const me = c.get('user');
    const {
      field_type,
      label,
      required = true,
      page_number = 1,
      x,
      y,
      width,
      height,
    } = c.req.valid('json');

    const owned = await getOwnedTemplate(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.template.status !== 'draft') {
      return c.json({ error: '편집 가능한 상태가 아닙니다 (draft 만 가능)' }, 400);
    }

    const [inserted] = await db
      .insert(templateFields)
      .values({
        template_id: id,
        recipient_role: 'self',
        field_type,
        label: label ?? undefined,
        required,
        page_number,
        x,
        y,
        width,
        height,
      })
      .returning();
    await db
      .update(documentTemplates)
      .set({ updated_at: sql`NOW()` })
      .where(eq(documentTemplates.id, id));
    return c.json(inserted);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

templates.put('/:id/fields/:fieldId', validate('json', UpdateTemplateFieldBody), async (c) => {
  try {
    const templateId = c.req.param('id');
    const fieldId = c.req.param('fieldId');
    const me = c.get('user');
    const { x, y, width, height, label, required } = c.req.valid('json');

    const owned = await getOwnedTemplate(templateId, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.template.status !== 'draft') {
      return c.json({ error: '편집 가능한 상태가 아닙니다 (draft 만 가능)' }, 400);
    }
    const [updated] = await db
      .update(templateFields)
      .set({
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(width !== undefined && { width }),
        ...(height !== undefined && { height }),
        ...(label !== undefined && { label }),
        ...(required !== undefined && { required }),
      })
      .where(and(eq(templateFields.id, fieldId), eq(templateFields.template_id, templateId)))
      .returning();
    if (!updated) return c.json({ error: '필드를 찾을 수 없습니다' }, 404);
    await db
      .update(documentTemplates)
      .set({ updated_at: sql`NOW()` })
      .where(eq(documentTemplates.id, templateId));
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

templates.delete('/:id/fields/:fieldId', async (c) => {
  try {
    const templateId = c.req.param('id');
    const fieldId = c.req.param('fieldId');
    const me = c.get('user');
    const owned = await getOwnedTemplate(templateId, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.template.status !== 'draft') {
      return c.json({ error: '편집 가능한 상태가 아닙니다 (draft 만 가능)' }, 400);
    }
    await db
      .delete(templateFields)
      .where(and(eq(templateFields.id, fieldId), eq(templateFields.template_id, templateId)));
    await db
      .update(documentTemplates)
      .set({ updated_at: sql`NOW()` })
      .where(eq(documentTemplates.id, templateId));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /:id/instantiate — 템플릿 → 1:1 문서 + 즉시 발송 ─────────────────
templates.post('/:id/instantiate', validate('json', InstantiateTemplateBody), async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const reqLike = expressReqLike(c);
  const { email, name, document_name } = c.req.valid('json');
  const normalizedEmail = email; // 스키마의 .trim().toLowerCase() 로 이미 정규화됨
  if (normalizedEmail === me.email.toLowerCase()) {
    return c.json({ error: '본인에게는 1:1 발송할 수 없습니다' }, 400);
  }

  try {
    const owned = await getOwnedTemplate(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const tpl = owned.template;
    if (tpl.status !== 'ready') {
      return c.json({ error: '배포 가능(ready) 상태의 템플릿만 사용할 수 있습니다' }, 400);
    }

    const tplFields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.template_id, tpl.id));
    if (!tplFields.length) return c.json({ error: '템플릿에 필드가 없습니다' }, 400);

    const docName = (document_name ?? '').trim() || `${tpl.name} — ${normalizedEmail}`;

    const [doc] = await db
      .insert(documents)
      .values({
        owner_id: me.id,
        name: docName,
        pdf_path: tpl.pdf_path,
        pdf_hash: tpl.pdf_hash,
        size_bytes: tpl.size_bytes,
        page_count: tpl.page_count,
        status: 'in_progress',
        signing_mode: 'parallel',
        template_id: tpl.id,
      })
      .returning({ id: documents.id });

    await db.insert(documentParticipants).values({
      document_id: doc.id,
      user_id: me.id,
      email: me.email,
      name: me.name,
      role: 'cc',
      is_owner: true,
      invite_status: 'accepted',
      signing_status: 'completed',
      completed_at: new Date(),
    });

    const inviteToken = randomBytes(24).toString('hex');
    const [signerPart] = await db
      .insert(documentParticipants)
      .values({
        document_id: doc.id,
        email: normalizedEmail,
        name: name?.trim() || null,
        role: 'signer',
        is_owner: false,
        invite_token: inviteToken,
        invite_status: 'pending',
        signing_status: 'in_progress',
      })
      .returning({ id: documentParticipants.id });

    await db.insert(formFields).values(
      tplFields.map((f) => ({
        document_id: doc.id,
        participant_id: signerPart.id,
        field_type: f.field_type,
        label: f.label,
        required: f.required,
        page_number: f.page_number,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      }))
    );

    sendInviteEmail({
      toEmail: normalizedEmail,
      inviterName: me.name,
      docName,
      token: inviteToken,
      role: 'signer',
    }).catch((err) => {
      console.error('[template instantiate email]', normalizedEmail, (err as Error).message);
    });

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail));
    if (existingUser) {
      await db.insert(notifications).values({
        user_id: existingUser.id,
        type: 'invite_received',
        title: `서명 요청: ${docName}`,
        body: `${me.name}님이 서명을 요청했습니다.`,
        document_id: doc.id,
      });
      notifyUser(existingUser.id, { type: 'invite_received', document_id: doc.id });
    }

    await logAudit({
      docId: doc.id,
      userId: me.id,
      action: 'template_instantiated',
      meta: { template_id: tpl.id, email: normalizedEmail },
      req: reqLike,
    });

    return c.json({ id: doc.id, name: docName });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── GET /:id/campaigns ─────────────────────────────────────────────────────
templates.get('/:id/campaigns', async (c) => {
  try {
    const id = c.req.param('id');
    const me = c.get('user');
    const owned = await getOwnedTemplate(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '템플릿을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const rows = await db
      .select()
      .from(signingCampaigns)
      .where(eq(signingCampaigns.template_id, id))
      .orderBy(sql`created_at DESC`);
    return c.json(rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default templates;
