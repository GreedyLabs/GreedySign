import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import { documents, documentParticipants, users, notifications } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireOwner } from '../middleware/docAccess.js';
import { logAudit } from '../services/audit.js';
import { sendInviteEmail } from '../services/email.js';
import { notifyUser } from '../services/sse.js';
import { getParticipants } from '../services/queries.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get('/', requireOwner, async (req: Request, res: Response): Promise<void> => {
  try {
    const participants = await getParticipants(req.params.docId!);
    res.json(participants);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  const {
    email,
    name,
    role = 'signer',
    signing_order = 0,
  } = req.body as {
    email?: string;
    name?: string;
    role?: string;
    signing_order?: number;
  };

  if (!email) {
    res.status(400).json({ error: '이메일을 입력하세요' });
    return;
  }

  try {
    const [doc] = await db
      .select({ status: documents.status, name: documents.name })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (!doc) {
      res.status(404).json({ error: '문서를 찾을 수 없습니다' });
      return;
    }
    if (doc.status !== 'draft') {
      res.status(400).json({ error: '이미 발송된 문서에는 참여자를 추가할 수 없습니다' });
      return;
    }

    // 소유자 이메일 체크
    const ownerResult = await db.execute(sql`
      SELECT u.email FROM users u
      WHERE u.id = (SELECT owner_id FROM documents WHERE id = ${docId}::uuid)
    `);
    if (ownerResult.rows.length) {
      const ownerEmail = (ownerResult.rows[0] as { email: string }).email;
      if (ownerEmail.toLowerCase() === email.toLowerCase()) {
        res.status(400).json({ error: '소유자는 이미 참여자로 등록되어 있습니다' });
        return;
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
        document_id: docId!,
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
      docId: docId!,
      userId: req.user.id,
      action: 'participant_added',
      meta: { email, role },
      req,
    });
    res.json(inserted);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const { docId, id } = req.params;
  const { role, signing_order } = req.body as { role?: string; signing_order?: number };
  try {
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (doc?.status !== 'draft') {
      res.status(400).json({ error: '이미 발송된 문서의 참여자 역할은 변경할 수 없습니다' });
      return;
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
          eq(documentParticipants.document_id, docId!),
          eq(documentParticipants.is_owner, false)
        )
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: '참여자를 찾을 수 없습니다' });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', requireOwner, async (req: Request, res: Response): Promise<void> => {
  const { docId, id } = req.params;
  try {
    const [doc] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (doc?.status !== 'draft') {
      res.status(400).json({ error: '이미 발송된 문서의 참여자는 제거할 수 없습니다' });
      return;
    }
    const [part] = await db
      .select({ user_id: documentParticipants.user_id, is_owner: documentParticipants.is_owner })
      .from(documentParticipants)
      .where(and(eq(documentParticipants.id, id), eq(documentParticipants.document_id, docId!)));
    if (!part) {
      res.status(404).json({ error: '참여자를 찾을 수 없습니다' });
      return;
    }
    if (part.is_owner) {
      res.status(400).json({ error: '소유자는 제거할 수 없습니다' });
      return;
    }

    await db.delete(documentParticipants).where(eq(documentParticipants.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/me/accept', async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  try {
    const [updated] = await db
      .update(documentParticipants)
      .set({
        invite_status: 'accepted',
        responded_at: sql`NOW()`,
        user_id: sql`COALESCE(user_id, ${req.user.id}::uuid)`,
      })
      .where(
        and(
          eq(documentParticipants.document_id, docId!),
          eq(documentParticipants.email, req.user.email),
          eq(documentParticipants.invite_status, 'pending')
        )
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: '초대를 찾을 수 없습니다' });
      return;
    }

    const [docOwner] = await db
      .select({ owner_id: documents.owner_id })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (docOwner) {
      notifyUser(docOwner.owner_id, { type: 'invite_accepted', document_id: docId });
    }

    await logAudit({ docId: docId!, userId: req.user.id, action: 'invite_accepted', req });
    notifyUser(req.user.id, { type: 'document_shared', document_id: docId });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/me/decline', async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;
  const { reason = '' } = req.body as { reason?: string };
  try {
    const [updated] = await db
      .update(documentParticipants)
      .set({ invite_status: 'declined', responded_at: sql`NOW()`, decline_reason: reason })
      .where(
        and(
          eq(documentParticipants.document_id, docId!),
          eq(documentParticipants.email, req.user.email)
        )
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: '초대를 찾을 수 없습니다' });
      return;
    }

    const [docOwner] = await db
      .select({ owner_id: documents.owner_id })
      .from(documents)
      .where(eq(documents.id, docId!));
    if (docOwner) {
      notifyUser(docOwner.owner_id, { type: 'invite_declined', document_id: docId });
    }

    await logAudit({
      docId: docId!,
      userId: req.user.id,
      action: 'invite_declined',
      meta: { reason },
      req,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
