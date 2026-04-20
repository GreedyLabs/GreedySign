/**
 * /api/documents/:docId/signing — 서명 제출 / 거부 (Hono 포팅본)
 * `freezeDocument` 는 공통 서비스(`services/freeze.ts`)로 분리됨.
 */
import { Hono } from 'hono';
import { sql, eq, and } from 'drizzle-orm';
import { DeclineSigningBody } from '@greedylabs/greedysign-shared';
import { db } from '../../db/pool.js';
import { documents, documentParticipants, notifications, users } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { validate } from '../validator.js';
import { broadcast, notifyUser } from '../../services/sse.js';
import { logAudit } from '../../services/audit.js';
import { shouldFreezeDocument } from '../../services/queries.js';
import { sendDeclineEmail } from '../../services/email.js';
import { freezeDocument } from '../../services/freeze.js';
import { onCampaignEnvelopeDeclined } from '../../services/campaignHooks.js';
import { expressReqLike } from '../reqInfo.js';
import type { AppEnv } from '../context.js';

const signing = new Hono<AppEnv>();

signing.use('*', authMiddleware);

signing.patch('/submit', requireDocAccess, async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const me = c.get('user');
    const reqLike = expressReqLike(c);

    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);
    if (doc.status !== 'in_progress') {
      return c.json({ error: '서명 진행 중인 문서만 제출할 수 있습니다' }, 400);
    }

    const [participant] = await db
      .select({
        id: documentParticipants.id,
        signing_status: documentParticipants.signing_status,
        role: documentParticipants.role,
      })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.document_id, docId),
          eq(documentParticipants.user_id, me.id),
          eq(documentParticipants.invite_status, 'accepted')
        )
      );
    if (!participant) return c.json({ error: '접근 권한이 없습니다' }, 403);
    if (participant.signing_status === 'completed') {
      return c.json({ error: '이미 서명을 완료했습니다' }, 400);
    }
    if (participant.signing_status === 'declined') {
      return c.json({ error: '서명을 거부한 상태입니다' }, 400);
    }

    const unfilledResult = await db.execute(sql`
      SELECT ff.id FROM form_fields ff
      LEFT JOIN field_responses fr ON fr.field_id = ff.id AND fr.participant_id = ${participant.id}::uuid
      WHERE ff.document_id = ${docId}::uuid AND ff.participant_id = ${participant.id}::uuid AND ff.required = TRUE
        AND (fr.id IS NULL
             OR (ff.field_type = 'text'      AND (fr.text_value IS NULL OR fr.text_value = ''))
             OR (ff.field_type = 'checkbox'  AND fr.checked IS NULL)
             OR (ff.field_type IN ('signature','initial') AND (fr.svg_data IS NULL OR fr.svg_data = ''))
             OR (ff.field_type = 'date'      AND fr.date_value IS NULL))
    `);
    if (unfilledResult.rows.length > 0) {
      return c.json(
        {
          error: `필수 항목 ${unfilledResult.rows.length}개가 입력되지 않았습니다`,
          unfilled_count: unfilledResult.rows.length,
        },
        400
      );
    }

    await db
      .update(documentParticipants)
      .set({ signing_status: 'completed', completed_at: sql`NOW()` })
      .where(eq(documentParticipants.id, participant.id));

    await logAudit({
      docId,
      userId: me.id,
      participantId: participant.id,
      action: 'signing_completed',
      req: reqLike,
    });
    broadcast(docId, {
      type: 'signing_status_changed',
      participant_id: participant.id,
      status: 'completed',
    });

    const [docOwner] = await db
      .select({ owner_id: documents.owner_id, name: documents.name })
      .from(documents)
      .where(eq(documents.id, docId));
    if (docOwner && docOwner.owner_id !== me.id) {
      const [signer] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, me.id));
      await db.insert(notifications).values({
        user_id: docOwner.owner_id,
        type: 'signing_completed',
        title: `서명 완료: ${docOwner.name}`,
        body: `${signer?.name ?? ''}님이 서명을 완료했습니다.`,
        document_id: docId,
      });
      notifyUser(docOwner.owner_id, { type: 'signing_status_changed', document_id: docId });
    }

    if (await shouldFreezeDocument(docId)) {
      await freezeDocument(docId, reqLike);
    }
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

signing.patch('/decline', requireDocAccess, validate('json', DeclineSigningBody), async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const me = c.get('user');
    const reason = c.req.valid('json').reason ?? '';
    const reqLike = expressReqLike(c);

    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);
    if (doc.status !== 'in_progress') {
      return c.json({ error: '서명 진행 중인 문서만 거부할 수 있습니다' }, 400);
    }

    const [part] = await db
      .select({ id: documentParticipants.id, is_owner: documentParticipants.is_owner })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.document_id, docId),
          eq(documentParticipants.user_id, me.id),
          eq(documentParticipants.invite_status, 'accepted')
        )
      );
    if (!part) return c.json({ error: '접근 권한이 없습니다' }, 403);
    if (part.is_owner) {
      return c.json(
        { error: '소유자는 서명을 거부할 수 없습니다. 무효화(void)를 이용하세요' },
        400
      );
    }

    await db
      .update(documentParticipants)
      .set({ signing_status: 'declined', decline_reason: reason, completed_at: sql`NOW()` })
      .where(eq(documentParticipants.id, part.id));

    const [docRow] = await db
      .select({
        owner_id: documents.owner_id,
        doc_name: documents.name,
      })
      .from(documents)
      .where(eq(documents.id, docId));
    if (docRow) {
      const [ownerUser] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, docRow.owner_id));
      const [signerUser] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, me.id));
      if (ownerUser) {
        await db.insert(notifications).values({
          user_id: docRow.owner_id,
          type: 'signing_declined',
          title: `서명 거부: ${docRow.doc_name}`,
          body: `${signerUser?.name ?? ''}님이 서명을 거부했습니다.${reason ? ' 사유: ' + reason : ''}`,
          document_id: docId,
        });
        notifyUser(docRow.owner_id, { type: 'signing_declined', document_id: docId });
        sendDeclineEmail({
          toEmail: ownerUser.email,
          ownerName: ownerUser.name,
          signerName: signerUser?.name ?? '',
          signerEmail: signerUser?.email ?? '',
          docName: docRow.doc_name,
          reason,
        }).catch((err) => console.error('[email] decline:', (err as Error).message));
      }
    }

    broadcast(docId, {
      type: 'signing_status_changed',
      participant_id: part.id,
      status: 'declined',
    });
    await logAudit({
      docId,
      userId: me.id,
      participantId: part.id,
      action: 'signing_declined',
      meta: { reason },
      req: reqLike,
    });

    onCampaignEnvelopeDeclined(docId, reason).catch((err) =>
      console.error('[campaign decline sync]', (err as Error).message)
    );

    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default signing;
