/**
 * /api/documents/:docId/participants — 문서 참여자 (Hono 포팅본)
 * 서브 라우트이므로 상위 app 에서 `app.route('/documents/:docId/participants', participants)`
 * 로 장착한다. `c.req.param('docId')` 로 상위 파라미터에 접근.
 */
import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { sql, eq, and } from 'drizzle-orm';
import {
  AddParticipantBody,
  UpdateParticipantBody,
  DeclineParticipantBody,
} from '@greedylabs/greedysign-shared';
import { db } from '../../db/pool.js';
import { documents, documentParticipants, users } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireOwner, requireDocAccess } from '../middleware/docAccess.js';
import { validate } from '../validator.js';
import { logAudit } from '../../services/audit.js';
import { notifyUser } from '../../services/sse.js';
import { getParticipants } from '../../services/queries.js';
import { expressReqLike } from '../reqInfo.js';
import type { AppEnv } from '../context.js';

const participants = new Hono<AppEnv>();

participants.use('*', authMiddleware);

participants.get('/', requireDocAccess, async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const rows = await getParticipants(docId);
    return c.json(rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

participants.post('/', requireOwner, validate('json', AddParticipantBody), async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const me = c.get('user');
    const { email, name, role = 'signer', signing_order = 0 } = c.req.valid('json');

    const [doc] = await db
      .select({ status: documents.status, name: documents.name })
      .from(documents)
      .where(eq(documents.id, docId));
    if (!doc) return c.json({ error: '문서를 찾을 수 없습니다' }, 404);
    if (doc.status !== 'draft') {
      return c.json({ error: '이미 발송된 문서에는 참여자를 추가할 수 없습니다' }, 400);
    }

    const [docOwner] = await db
      .select({ owner_id: documents.owner_id })
      .from(documents)
      .where(eq(documents.id, docId));
    if (docOwner) {
      const [ownerUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, docOwner.owner_id));
      if (ownerUser && ownerUser.email.toLowerCase() === email.toLowerCase()) {
        return c.json({ error: '소유자는 이미 참여자로 등록되어 있습니다' }, 400);
      }
    }

    const token = randomUUID();
    const [existingUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, email));

    const user_id = existingUser?.id ?? null;
    const resolvedName = name || existingUser?.name || null;

    const [inserted] = await db
      .insert(documentParticipants)
      .values({
        document_id: docId,
        user_id,
        email,
        name: resolvedName,
        role,
        is_owner: false,
        signing_order,
        invite_token: token,
      })
      .onConflictDoUpdate({
        target: [documentParticipants.document_id, documentParticipants.email],
        set: {
          role,
          signing_order,
          name: sql`COALESCE(${resolvedName}, document_participants.name)`,
          user_id: sql`COALESCE(${user_id}::uuid, document_participants.user_id)`,
          invite_token: token,
        },
      })
      .returning();

    await logAudit({
      docId,
      userId: me.id,
      action: 'participant_added',
      meta: { email, role },
      req: expressReqLike(c),
    });
    return c.json(inserted);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

participants.patch('/:id', requireOwner, validate('json', UpdateParticipantBody), async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const id = c.req.param('id');
    const { role, signing_order } = c.req.valid('json');

    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId));
    if (doc?.status !== 'draft') {
      return c.json({ error: '이미 발송된 문서의 참여자 역할은 변경할 수 없습니다' }, 400);
    }
    const [updated] = await db
      .update(documentParticipants)
      .set({
        ...(role !== undefined && { role }),
        ...(signing_order !== undefined && { signing_order }),
      })
      .where(
        and(
          eq(documentParticipants.id, id),
          eq(documentParticipants.document_id, docId),
          eq(documentParticipants.is_owner, false)
        )
      )
      .returning();
    if (!updated) return c.json({ error: '참여자를 찾을 수 없습니다' }, 404);
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

participants.delete('/:id', requireOwner, async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const id = c.req.param('id');

    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId));
    if (doc?.status !== 'draft') {
      return c.json({ error: '이미 발송된 문서의 참여자는 제거할 수 없습니다' }, 400);
    }
    const [part] = await db
      .select({ user_id: documentParticipants.user_id, is_owner: documentParticipants.is_owner })
      .from(documentParticipants)
      .where(and(eq(documentParticipants.id, id), eq(documentParticipants.document_id, docId)));
    if (!part) return c.json({ error: '참여자를 찾을 수 없습니다' }, 404);
    if (part.is_owner) return c.json({ error: '소유자는 제거할 수 없습니다' }, 400);

    await db.delete(documentParticipants).where(eq(documentParticipants.id, id));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

participants.patch('/me/accept', async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const me = c.get('user');

    const [updated] = await db
      .update(documentParticipants)
      .set({
        invite_status: 'accepted',
        responded_at: sql`NOW()`,
        user_id: sql`COALESCE(user_id, ${me.id}::uuid)`,
      })
      .where(
        and(
          eq(documentParticipants.document_id, docId),
          eq(documentParticipants.email, me.email),
          eq(documentParticipants.invite_status, 'pending')
        )
      )
      .returning();
    if (!updated) return c.json({ error: '초대를 찾을 수 없습니다' }, 404);

    const [docOwner] = await db
      .select({ owner_id: documents.owner_id })
      .from(documents)
      .where(eq(documents.id, docId));
    if (docOwner) {
      notifyUser(docOwner.owner_id, { type: 'invite_accepted', document_id: docId });
    }

    await logAudit({ docId, userId: me.id, action: 'invite_accepted', req: expressReqLike(c) });
    notifyUser(me.id, { type: 'document_shared', document_id: docId });
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

participants.patch('/me/decline', validate('json', DeclineParticipantBody), async (c) => {
  try {
    const docId = c.req.param('docId')!;
    const me = c.get('user');
    const reason = c.req.valid('json').reason ?? '';

    const [updated] = await db
      .update(documentParticipants)
      .set({ invite_status: 'declined', responded_at: sql`NOW()`, decline_reason: reason })
      .where(
        and(
          eq(documentParticipants.document_id, docId),
          eq(documentParticipants.email, me.email)
        )
      )
      .returning();
    if (!updated) return c.json({ error: '초대를 찾을 수 없습니다' }, 404);

    const [docOwner] = await db
      .select({ owner_id: documents.owner_id })
      .from(documents)
      .where(eq(documents.id, docId));
    if (docOwner) {
      notifyUser(docOwner.owner_id, { type: 'invite_declined', document_id: docId });
    }

    await logAudit({
      docId,
      userId: me.id,
      action: 'invite_declined',
      meta: { reason },
      req: expressReqLike(c),
    });
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default participants;
