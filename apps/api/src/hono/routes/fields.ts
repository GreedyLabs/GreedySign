/**
 * /api/documents/:docId/fields — 폼 필드 CRUD + 응답 저장 (Hono 포팅본)
 */
import { Hono } from 'hono';
import { sql, eq, and } from 'drizzle-orm';
import {
  CreateFieldBody,
  UpdateFieldBody,
  FillFieldBody,
} from '@greedylabs/greedysign-shared';
import { db } from '../../db/pool.js';
import { formFields, fieldResponses, documentParticipants, documents } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess, requireOwner } from '../middleware/docAccess.js';
import { validate } from '../validator.js';
import { checkDocumentLocked } from '../../services/queries.js';
import { broadcast } from '../../services/sse.js';
import type { AppEnv } from '../context.js';

const fields = new Hono<AppEnv>();

fields.use('*', authMiddleware);

fields.get('/', requireDocAccess, async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const result = await db.execute(sql`
      SELECT
        ff.*,
        p.email   AS participant_email,
        COALESCE(u.name, p.name, p.email) AS participant_name,
        p.role    AS participant_role,
        p.is_owner AS participant_is_owner
      FROM form_fields ff
      LEFT JOIN document_participants p ON p.id = ff.participant_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE ff.document_id = ${docId}::uuid
      ORDER BY ff.page_number, ff.created_at
    `);
    return c.json(result.rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

fields.post('/', requireOwner, validate('json', CreateFieldBody), async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const {
      participant_id,
      field_type,
      label,
      required = true,
      x,
      y,
      width,
      height,
      page_number = 1,
    } = c.req.valid('json');

    if (await checkDocumentLocked(docId)) {
      return c.json({ error: '편집할 수 없는 상태의 문서입니다' }, 403);
    }
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId));
    if (doc?.status !== 'draft') {
      return c.json({ error: '발송된 문서의 필드는 추가할 수 없습니다' }, 400);
    }
    const [part] = await db
      .select({ id: documentParticipants.id })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.id, participant_id),
          eq(documentParticipants.document_id, docId)
        )
      );
    if (!part) return c.json({ error: '유효하지 않은 참여자입니다' }, 400);

    const [inserted] = await db
      .insert(formFields)
      .values({
        document_id: docId,
        participant_id,
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
    return c.json(inserted);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

fields.put('/:fieldId', requireOwner, validate('json', UpdateFieldBody), async (c) => {
  try {
    const fieldId = c.req.param('fieldId');
    const { x, y, width, height, label, required, participant_id } = c.req.valid('json');

    const [check] = await db
      .select({ document_id: formFields.document_id })
      .from(formFields)
      .where(eq(formFields.id, fieldId));
    if (!check) return c.json({ error: '필드를 찾을 수 없습니다' }, 404);
    if (await checkDocumentLocked(check.document_id!)) {
      return c.json({ error: '편집할 수 없는 상태의 문서입니다' }, 403);
    }
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, check.document_id!));
    if (doc?.status !== 'draft') {
      return c.json({ error: '발송된 문서의 필드는 수정할 수 없습니다' }, 400);
    }
    const [updated] = await db
      .update(formFields)
      .set({
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(width !== undefined && { width }),
        ...(height !== undefined && { height }),
        ...(label !== undefined && { label }),
        ...(required !== undefined && { required }),
        ...(participant_id !== undefined && { participant_id }),
      })
      .where(eq(formFields.id, fieldId))
      .returning();
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

fields.delete('/:fieldId', requireOwner, async (c) => {
  try {
    const fieldId = c.req.param('fieldId');
    const [check] = await db
      .select({ document_id: formFields.document_id })
      .from(formFields)
      .where(eq(formFields.id, fieldId));
    if (!check) return c.json({ error: '필드를 찾을 수 없습니다' }, 404);
    if (await checkDocumentLocked(check.document_id!)) {
      return c.json({ error: '편집할 수 없는 상태의 문서입니다' }, 403);
    }
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, check.document_id!));
    if (doc?.status !== 'draft') {
      return c.json({ error: '발송된 문서의 필드는 삭제할 수 없습니다' }, 400);
    }
    await db.delete(formFields).where(eq(formFields.id, fieldId));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

fields.put('/:fieldId/response', requireDocAccess, validate('json', FillFieldBody), async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const fieldId = c.req.param('fieldId');
    const me = c.get('user');
    const { text_value, checked, svg_data, date_value, source_sig_id } = c.req.valid('json');

    if (await checkDocumentLocked(docId)) {
      return c.json({ error: '편집할 수 없는 상태의 문서입니다' }, 403);
    }
    const result = await db.execute(sql`
      SELECT ff.participant_id, dp.user_id, dp.signing_status
      FROM form_fields ff
      JOIN document_participants dp ON dp.id = ff.participant_id
      WHERE ff.id = ${fieldId}::uuid AND ff.document_id = ${docId}::uuid
    `);
    if (!result.rows.length) return c.json({ error: '필드를 찾을 수 없습니다' }, 404);

    const field = result.rows[0] as {
      participant_id: string;
      user_id: string;
      signing_status: string;
    };
    if (field.user_id !== me.id) {
      return c.json({ error: '본인에게 할당된 필드만 응답할 수 있습니다' }, 403);
    }
    if (field.signing_status === 'completed' || field.signing_status === 'declined') {
      return c.json({ error: '서명이 완료된 상태에서는 수정할 수 없습니다' }, 403);
    }

    const [upserted] = await db
      .insert(fieldResponses)
      .values({
        field_id: fieldId,
        participant_id: field.participant_id,
        text_value: text_value ?? null,
        checked: checked ?? null,
        svg_data: svg_data ?? null,
        date_value: date_value ?? null,
        source_sig_id: source_sig_id ?? null,
      })
      .onConflictDoUpdate({
        target: [fieldResponses.field_id, fieldResponses.participant_id],
        set: {
          text_value: text_value ?? null,
          checked: checked ?? null,
          svg_data: svg_data ?? null,
          date_value: date_value ?? null,
          source_sig_id: sql`COALESCE(${source_sig_id ?? null}::uuid, field_responses.source_sig_id)`,
          updated_at: sql`NOW()`,
        },
      })
      .returning();

    broadcast(docId, { type: 'field_response_updated', field_id: fieldId }, me.id);
    return c.json(upserted);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default fields;
