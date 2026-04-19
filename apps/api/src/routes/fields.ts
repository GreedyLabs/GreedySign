import { Router, Request, Response } from 'express';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import { formFields, fieldResponses, documentParticipants, documents } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess, requireOwner } from '../middleware/docAccess.js';
import { checkDocumentLocked } from '../services/queries.js';
import { broadcast } from '../services/sse.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get('/', requireDocAccess, async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  try {
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
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
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
  } = req.body as {
    participant_id?: string;
    field_type?: string;
    label?: string;
    required?: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    page_number?: number;
  };

  if (!field_type) {
    res.status(400).json({ error: 'field_type이 필요합니다' });
    return;
  }
  if (!participant_id) {
    res.status(400).json({ error: '참여자(participant_id)가 필요합니다' });
    return;
  }

  try {
    if (await checkDocumentLocked(docId!)) {
      res.status(403).json({ error: '편집할 수 없는 상태의 문서입니다' });
      return;
    }
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (doc?.status !== 'draft') {
      res.status(400).json({ error: '발송된 문서의 필드는 추가할 수 없습니다' });
      return;
    }
    const [part] = await db
      .select({ id: documentParticipants.id })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.id, participant_id),
          eq(documentParticipants.document_id, docId!)
        )
      );
    if (!part) {
      res.status(400).json({ error: '유효하지 않은 참여자입니다' });
      return;
    }

    const [inserted] = await db
      .insert(formFields)
      .values({
        document_id: docId!,
        participant_id,
        field_type,
        label,
        required,
        page_number,
        x: x!,
        y: y!,
        width: width!,
        height: height!,
      })
      .returning();
    res.json(inserted);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/:fieldId', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const { fieldId } = req.params;
  const { x, y, width, height, label, participant_id } = req.body as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    label?: string;
    participant_id?: string;
  };
  try {
    const [check] = await db
      .select({ document_id: formFields.document_id })
      .from(formFields)
      .where(eq(formFields.id, fieldId));
    if (!check) {
      res.status(404).json({ error: '필드를 찾을 수 없습니다' });
      return;
    }
    if (await checkDocumentLocked(check.document_id!)) {
      res.status(403).json({ error: '편집할 수 없는 상태의 문서입니다' });
      return;
    }
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, check.document_id!));
    if (doc?.status !== 'draft') {
      res.status(400).json({ error: '발송된 문서의 필드는 수정할 수 없습니다' });
      return;
    }
    const [updated] = await db
      .update(formFields)
      .set({
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(width !== undefined && { width }),
        ...(height !== undefined && { height }),
        ...(label !== undefined && { label }),
        ...(participant_id !== undefined && { participant_id }),
      })
      .where(eq(formFields.id, fieldId))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:fieldId', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const { fieldId } = req.params;
  try {
    const [check] = await db
      .select({ document_id: formFields.document_id })
      .from(formFields)
      .where(eq(formFields.id, fieldId));
    if (!check) {
      res.status(404).json({ error: '필드를 찾을 수 없습니다' });
      return;
    }
    if (await checkDocumentLocked(check.document_id!)) {
      res.status(403).json({ error: '편집할 수 없는 상태의 문서입니다' });
      return;
    }
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, check.document_id!));
    if (doc?.status !== 'draft') {
      res.status(400).json({ error: '발송된 문서의 필드는 삭제할 수 없습니다' });
      return;
    }
    await db.delete(formFields).where(eq(formFields.id, fieldId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put(
  '/:fieldId/response',
  requireDocAccess,
  async (req: Request, res: Response): Promise<void> => {
    const { docId, fieldId } = req.params;
    const { text_value, checked, svg_data, date_value, source_sig_id } = req.body as {
      text_value?: string;
      checked?: boolean;
      svg_data?: string;
      date_value?: string;
      source_sig_id?: string;
    };

    try {
      if (await checkDocumentLocked(docId!)) {
        res.status(403).json({ error: '편집할 수 없는 상태의 문서입니다' });
        return;
      }
      const result = await db.execute(sql`
      SELECT ff.participant_id, dp.user_id, dp.signing_status
      FROM form_fields ff
      JOIN document_participants dp ON dp.id = ff.participant_id
      WHERE ff.id = ${fieldId}::uuid AND ff.document_id = ${docId}::uuid
    `);
      if (!result.rows.length) {
        res.status(404).json({ error: '필드를 찾을 수 없습니다' });
        return;
      }

      const field = result.rows[0] as {
        participant_id: string;
        user_id: string;
        signing_status: string;
      };
      if (field.user_id !== req.user.id) {
        res.status(403).json({ error: '본인에게 할당된 필드만 응답할 수 있습니다' });
        return;
      }
      if (field.signing_status === 'completed' || field.signing_status === 'declined') {
        res.status(403).json({ error: '서명이 완료된 상태에서는 수정할 수 없습니다' });
        return;
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

      broadcast(docId!, { type: 'field_response_updated', field_id: fieldId }, req.user.id);
      res.json(upserted);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

export default router;
