/**
 * /api/campaigns — 템플릿 기반 대량 배포 캠페인 (Hono 포팅본)
 *
 * 수신자 라이프사이클(여러 변경 사유에 유연하게 대응):
 *   pending → sent → viewed → signed        (정상 완료)
 *                         └→ declined       (거절)
 *                         └→ expired        (만료)
 *                         └→ failed         (이메일 실패 등)
 *                         └→ excluded       (소유자가 제외 — 퇴사·오류 등)
 *
 * `excluded` 는 "더 이상 응답 대기하지 않음"을 의미하며, 캠페인 집계 시
 * 완료 판정을 막지 않는다. `replace` 는 기존 수신자를 excluded 로 전환한
 * 뒤 새 이메일로 새 문서를 발송한다. `POST /:id/complete` 는 미응답
 * 수신자를 모두 expired 처리하며 캠페인을 강제 완료한다.
 *
 * `maybeFinalizeCampaign` 은 `services/campaignHooks.js` 에서 공유 — 서명
 * 완료/거절 훅과 동일한 판정 로직을 써야 하므로 공통 모듈로 뺐다.
 */
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { PassThrough, Readable } from 'stream';
import archiver from 'archiver';
import { sql, eq, and } from 'drizzle-orm';
import {
  CreateCampaignBody,
  UpdateCampaignBody,
  AddRecipientsBody,
  ExcludeRecipientBody,
  ReplaceRecipientBody,
} from '@greedylabs/greedysign-shared';
import { validate } from '../validator.js';
import { db } from '../../db/pool.js';
import {
  documentTemplates,
  templateFields,
  signingCampaigns,
  campaignRecipients,
  documents,
  documentParticipants,
  formFields,
  notifications,
  users,
} from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { logAudit } from '../../services/audit.js';
import { sendInviteEmail } from '../../services/email.js';
import { readPdf } from '../../services/storage.js';
import { notifyUser } from '../../services/sse.js';
import { maybeFinalizeCampaign } from '../../services/campaignHooks.js';
import { expressReqLike } from '../reqInfo.js';
import type { AppEnv } from '../context.js';
import type { ReqInfo } from '../../types.js';

const campaigns = new Hono<AppEnv>();

campaigns.use('*', authMiddleware);

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getOwnedCampaign(campaignId: string, userId: string) {
  const [c] = await db
    .select()
    .from(signingCampaigns)
    .where(eq(signingCampaigns.id, campaignId));
  if (!c) return { error: 'NOT_FOUND' as const };
  if (c.owner_id !== userId) return { error: 'FORBIDDEN' as const };
  return { campaign: c };
}

interface CampaignStats {
  total: number;
  pending: number;
  sent: number;
  viewed: number;
  signed: number;
  declined: number;
  expired: number;
  failed: number;
  excluded: number;
}

async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const result = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count
    FROM campaign_recipients
    WHERE campaign_id = ${campaignId}::uuid
    GROUP BY status
  `);
  const stats: CampaignStats = {
    total: 0,
    pending: 0,
    sent: 0,
    viewed: 0,
    signed: 0,
    declined: 0,
    expired: 0,
    failed: 0,
    excluded: 0,
  };
  for (const row of result.rows as Array<{ status: keyof CampaignStats; count: number }>) {
    stats.total += row.count;
    if (row.status in stats) stats[row.status] = row.count;
  }
  return stats;
}

// ─── 문서 1건 생성 + 이메일 발송 (dispatch 공통 헬퍼) ───────────────────────
// 이미 campaign_recipients 행이 존재하고, 상태가 pending 인 수신자에 대해
// documents / participants / form_fields 를 생성하고 초대 메일을 보낸다.
// 성공 시 recipient.status = 'sent' 로 전환한다.
async function dispatchSingleRecipient(opts: {
  campaign: typeof signingCampaigns.$inferSelect;
  recipient: typeof campaignRecipients.$inferSelect;
  template: typeof documentTemplates.$inferSelect;
  templateFields: (typeof templateFields.$inferSelect)[];
  owner: { id: string; name: string; email: string };
  req: ReqInfo | null;
}): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  const { campaign, recipient, template, owner, req } = opts;
  try {
    // 1. 문서 documents row — 템플릿 PDF 재사용(파일 복제 X)
    const [doc] = await db
      .insert(documents)
      .values({
        owner_id: owner.id,
        name: `${campaign.name} — ${recipient.email}`,
        pdf_path: template.pdf_path,
        pdf_hash: template.pdf_hash,
        size_bytes: template.size_bytes,
        page_count: template.page_count,
        status: 'in_progress',
        signing_mode: 'parallel',
        campaign_id: campaign.id,
        template_id: template.id,
      })
      .returning({ id: documents.id });

    // 2. owner cc participant
    await db.insert(documentParticipants).values({
      document_id: doc.id,
      user_id: owner.id,
      email: owner.email,
      name: owner.name,
      role: 'cc',
      is_owner: true,
      invite_status: 'accepted',
      signing_status: 'completed',
      completed_at: new Date(),
    });

    // 3. signer participant + invite token
    const inviteToken = randomBytes(24).toString('hex');
    const [signerPart] = await db
      .insert(documentParticipants)
      .values({
        document_id: doc.id,
        email: recipient.email,
        name: recipient.name,
        role: 'signer',
        is_owner: false,
        invite_token: inviteToken,
        invite_status: 'pending',
        signing_status: 'in_progress',
        expires_at: campaign.expires_at ?? null,
      })
      .returning({ id: documentParticipants.id });

    // 4. 템플릿 필드 → form_fields (signer에게 배정)
    await db.insert(formFields).values(
      opts.templateFields.map((f) => ({
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

    // 5. recipient 행 갱신
    await db
      .update(campaignRecipients)
      .set({
        document_id: doc.id,
        status: 'sent',
        sent_at: sql`NOW()`,
        error: null,
      })
      .where(eq(campaignRecipients.id, recipient.id));

    // 6. 이메일 — 실패는 경고만, recipient 상태는 sent 유지
    sendInviteEmail({
      toEmail: recipient.email,
      inviterName: owner.name,
      docName: campaign.name,
      token: inviteToken,
      role: 'signer',
    }).catch((err) => {
      console.error('[campaign email]', recipient.email, (err as Error).message);
    });

    await logAudit({
      docId: doc.id,
      userId: owner.id,
      action: 'campaign_envelope_dispatched',
      meta: { campaign_id: campaign.id, recipient_id: recipient.id, email: recipient.email },
      req,
    });
    return { ok: true, documentId: doc.id };
  } catch (err) {
    const message = (err as Error).message;
    await db
      .update(campaignRecipients)
      .set({ status: 'failed', error: message })
      .where(eq(campaignRecipients.id, recipient.id));
    console.error('[campaign dispatch fail]', recipient.email, message);
    return { ok: false, error: message };
  }
}

// ─── GET / — 내 캠페인 목록 ─────────────────────────────────────────────────
campaigns.get('/', async (c) => {
  try {
    const me = c.get('user');
    const result = await db.execute(sql`
      SELECT
        c.id, c.name, c.message, c.status, c.expires_at,
        c.started_at, c.completed_at, c.cancelled_at,
        c.total_count, c.created_at, c.updated_at,
        c.template_id, t.name AS template_name,
        (SELECT COUNT(*)::int FROM campaign_recipients WHERE campaign_id = c.id) AS recipient_count,
        (SELECT COUNT(*)::int FROM campaign_recipients
          WHERE campaign_id = c.id AND status = 'signed') AS signed_count,
        (SELECT COUNT(*)::int FROM campaign_recipients
          WHERE campaign_id = c.id AND status = 'declined') AS declined_count,
        (SELECT COUNT(*)::int FROM campaign_recipients
          WHERE campaign_id = c.id AND status = 'excluded') AS excluded_count
      FROM signing_campaigns c
      JOIN document_templates t ON t.id = c.template_id
      WHERE c.owner_id = ${me.id}::uuid
      ORDER BY c.updated_at DESC
    `);
    return c.json(result.rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST / — 신규 캠페인 (draft) ───────────────────────────────────────────
campaigns.post('/', validate('json', CreateCampaignBody), async (c) => {
  const me = c.get('user');
  const reqLike = expressReqLike(c);
  const { template_id, name, message, expires_at } = c.req.valid('json');
  try {
    const [tpl] = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, template_id));
    if (!tpl || tpl.owner_id !== me.id) {
      return c.json({ error: '템플릿에 접근할 수 없습니다' }, 403);
    }
    const [{ count }] = (await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM template_fields WHERE template_id = ${template_id}::uuid
    `)).rows as Array<{ count: number }>;
    if (!count) {
      return c.json({ error: '템플릿에 필드가 없습니다. 먼저 필드를 배치하세요.' }, 400);
    }

    const [created] = await db
      .insert(signingCampaigns)
      .values({
        owner_id: me.id,
        template_id,
        name,
        message: message ?? null,
        status: 'draft',
        expires_at: expires_at ? new Date(expires_at) : null,
      })
      .returning();
    await logAudit({
      userId: me.id,
      action: 'campaign_created',
      meta: { campaign_id: created.id, template_id },
      req: reqLike,
    });
    return c.json(created);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── GET /:id — 캠페인 상세 + 통계 ──────────────────────────────────────────
campaigns.get('/:id', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const [tpl] = await db
      .select({
        id: documentTemplates.id,
        name: documentTemplates.name,
        page_count: documentTemplates.page_count,
      })
      .from(documentTemplates)
      .where(eq(documentTemplates.id, owned.campaign.template_id));
    const stats = await getCampaignStats(id);
    return c.json({ ...owned.campaign, template: tpl, stats });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── PATCH /:id — 이름/메시지/만료 수정 (draft 한정) ─────────────────────────
campaigns.patch('/:id', validate('json', UpdateCampaignBody), async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const { name, message, expires_at } = c.req.valid('json');
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status !== 'draft') {
      return c.json({ error: 'draft 상태의 캠페인만 수정할 수 있습니다' }, 400);
    }
    const [updated] = await db
      .update(signingCampaigns)
      .set({
        ...(name !== undefined && { name }),
        ...(message !== undefined && { message }),
        ...(expires_at !== undefined && {
          expires_at: expires_at ? new Date(expires_at) : null,
        }),
        updated_at: sql`NOW()`,
      })
      .where(eq(signingCampaigns.id, id))
      .returning();
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── PATCH /:id/cancel — 캠페인 취소 (미응답 모두 무효화) ────────────────────
campaigns.patch('/:id/cancel', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const reqLike = expressReqLike(c);
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status === 'completed' || owned.campaign.status === 'cancelled') {
      return c.json({ error: '이미 종료된 캠페인입니다' }, 400);
    }

    await db
      .update(signingCampaigns)
      .set({
        status: 'cancelled',
        cancelled_at: sql`NOW()`,
        updated_at: sql`NOW()`,
      })
      .where(eq(signingCampaigns.id, id));

    await db.execute(sql`
      UPDATE documents SET status = 'voided', voided_at = NOW(), voided_by = ${me.id}::uuid,
        voided_reason = '캠페인 취소', updated_at = NOW()
      WHERE campaign_id = ${id}::uuid AND status IN ('draft','in_progress')
    `);
    await db.execute(sql`
      UPDATE campaign_recipients SET status = 'expired'
      WHERE campaign_id = ${id}::uuid
        AND status NOT IN ('signed','declined','excluded')
    `);
    await logAudit({
      userId: me.id,
      action: 'campaign_cancelled',
      meta: { campaign_id: id },
      req: reqLike,
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /:id/complete — 강제 완료 ─────────────────────────────────────────
// 서명자 변경·퇴사 등으로 일부 수신자의 응답이 불가능할 때, 현재까지의
// 응답으로 마감하고 미응답 수신자는 expired 로 마킹하며 문서도 void 한다.
// 이미 signed/declined/excluded 처리된 수신자는 그대로 보존.
campaigns.post('/:id/complete', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const reqLike = expressReqLike(c);
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status !== 'in_progress') {
      return c.json({ error: '진행 중인 캠페인만 강제 완료할 수 있습니다' }, 400);
    }

    // 미응답(pending/sent/viewed/failed) → expired
    const pending = await db.execute(sql`
      SELECT id, document_id FROM campaign_recipients
      WHERE campaign_id = ${id}::uuid
        AND status NOT IN ('signed','declined','expired','excluded')
    `);
    const pendingRows = pending.rows as Array<{ id: string; document_id: string | null }>;

    for (const r of pendingRows) {
      if (r.document_id) {
        await db.execute(sql`
          UPDATE documents SET status = 'voided', voided_at = NOW(),
            voided_by = ${me.id}::uuid,
            voided_reason = '캠페인 강제 완료', updated_at = NOW()
          WHERE id = ${r.document_id}::uuid AND status IN ('draft','in_progress')
        `);
      }
    }
    await db.execute(sql`
      UPDATE campaign_recipients SET status = 'expired'
      WHERE campaign_id = ${id}::uuid
        AND status NOT IN ('signed','declined','expired','excluded')
    `);

    await db
      .update(signingCampaigns)
      .set({
        status: 'completed',
        completed_at: sql`NOW()`,
        updated_at: sql`NOW()`,
      })
      .where(eq(signingCampaigns.id, id));

    await db.insert(notifications).values({
      user_id: me.id,
      type: 'campaign_completed',
      title: `캠페인 완료: ${owned.campaign.name}`,
      body: '소유자가 캠페인을 수동 완료 처리했습니다.',
    });
    notifyUser(me.id, { type: 'campaign_completed', campaign_id: id });

    await logAudit({
      userId: me.id,
      action: 'campaign_force_completed',
      meta: { campaign_id: id, expired: pendingRows.length },
      req: reqLike,
    });

    return c.json({ ok: true, expired: pendingRows.length });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── DELETE /:id — 캠페인 삭제 (draft 한정) ──────────────────────────────────
campaigns.delete('/:id', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status !== 'draft') {
      return c.json({ error: 'draft 상태의 캠페인만 삭제할 수 있습니다' }, 400);
    }
    await db.delete(signingCampaigns).where(eq(signingCampaigns.id, id));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── 수신자 목록 ─────────────────────────────────────────────────────────────
campaigns.get('/:id/recipients', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const result = await db.execute(sql`
      SELECT
        r.id, r.email, r.name, r.status, r.error,
        r.sent_at, r.viewed_at, r.signed_at, r.declined_at, r.created_at,
        r.document_id,
        d.status AS document_status,
        d.completed_at AS document_completed_at
      FROM campaign_recipients r
      LEFT JOIN documents d ON d.id = r.document_id
      WHERE r.campaign_id = ${id}::uuid
      ORDER BY r.created_at ASC
    `);
    return c.json(result.rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /:id/recipients — 수신자 추가 ─────────────────────────────────────
// draft: 다건 등록만 (발송은 dispatch 시점)
// in_progress: 등록과 동시에 개별 문서 즉시 발송
campaigns.post('/:id/recipients', validate('json', AddRecipientsBody), async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const reqLike = expressReqLike(c);
    const { recipients } = c.req.valid('json');
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status === 'completed' || owned.campaign.status === 'cancelled') {
      return c.json({ error: '종료된 캠페인에는 수신자를 추가할 수 없습니다' }, 400);
    }

    // 정규화 + 검증
    const normalized: Array<{ email: string; name: string | null }> = [];
    const skipped: Array<{ email: string; reason: string }> = [];
    const seen = new Set<string>();
    for (const r of recipients) {
      const email = (r.email ?? '').trim().toLowerCase();
      const name = (r.name ?? '').trim() || null;
      if (!email) {
        skipped.push({ email: '', reason: 'empty' });
        continue;
      }
      if (!isValidEmail(email)) {
        skipped.push({ email, reason: 'invalid' });
        continue;
      }
      if (seen.has(email)) {
        skipped.push({ email, reason: 'duplicate_in_request' });
        continue;
      }
      seen.add(email);
      normalized.push({ email, name });
    }
    if (!normalized.length) {
      return c.json({ error: '유효한 수신자가 없습니다', skipped }, 400);
    }

    const inserted = await db
      .insert(campaignRecipients)
      .values(normalized.map((r) => ({ campaign_id: id, ...r })))
      .onConflictDoNothing({
        target: [campaignRecipients.campaign_id, campaignRecipients.email],
      })
      .returning();

    // 진행 중 캠페인에 추가된 수신자는 즉시 발송.
    let dispatched = 0;
    let failed = 0;
    if (owned.campaign.status === 'in_progress' && inserted.length) {
      const [tpl] = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.id, owned.campaign.template_id));
      const tplFields = tpl
        ? await db.select().from(templateFields).where(eq(templateFields.template_id, tpl.id))
        : [];
      const [owner] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, me.id));
      if (tpl && owner && tplFields.length) {
        for (const r of inserted) {
          const result = await dispatchSingleRecipient({
            campaign: owned.campaign,
            recipient: r,
            template: tpl,
            templateFields: tplFields,
            owner,
            req: reqLike,
          });
          if (result.ok) dispatched += 1;
          else failed += 1;
        }
        // total_count 증가분 반영
        await db
          .update(signingCampaigns)
          .set({
            total_count: sql`${signingCampaigns.total_count} + ${inserted.length}`,
            updated_at: sql`NOW()`,
          })
          .where(eq(signingCampaigns.id, id));
      }
    }

    return c.json({
      added: inserted.length,
      skipped: skipped.length + (normalized.length - inserted.length),
      dispatched,
      failed,
      recipients: inserted,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── DELETE /:id/recipients/:rid — 수신자 제거 (draft 한정) ──────────────────
campaigns.delete('/:id/recipients/:recipientId', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const recipientId = c.req.param('recipientId');
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status !== 'draft') {
      return c.json(
        { error: 'draft 상태의 캠페인만 수신자를 제거할 수 있습니다. 진행 중이면 /exclude 를 사용하세요.' },
        400
      );
    }
    await db
      .delete(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.id, recipientId),
          eq(campaignRecipients.campaign_id, id)
        )
      );
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── PATCH /:id/recipients/:rid/exclude — 진행 중 수신자 제외 ───────────────
// 퇴사·응답 불가 등으로 해당 수신자를 더 이상 기다리지 않겠다고 마킹.
// 이미 발송된 문서는 voided 로 전환해 signer 가 접근해도 서명되지 않도록 함.
// excluded 는 캠페인 완료 판정에서 terminal 로 취급되므로, 제외 후에는
// 나머지 수신자만 응답하면 캠페인이 자동 완료될 수 있음.
campaigns.patch('/:id/recipients/:recipientId/exclude', validate('json', ExcludeRecipientBody), async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const recipientId = c.req.param('recipientId');
    const reqLike = expressReqLike(c);
    const { reason } = c.req.valid('json');

    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status !== 'in_progress') {
      return c.json({ error: '진행 중인 캠페인에서만 제외할 수 있습니다' }, 400);
    }
    const [recip] = await db
      .select()
      .from(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.id, recipientId),
          eq(campaignRecipients.campaign_id, id)
        )
      );
    if (!recip) return c.json({ error: '수신자를 찾을 수 없습니다' }, 404);
    if (recip.status === 'signed' || recip.status === 'declined') {
      return c.json({ error: '이미 응답한 수신자는 제외할 수 없습니다' }, 400);
    }

    if (recip.document_id) {
      await db.execute(sql`
        UPDATE documents SET status = 'voided', voided_at = NOW(),
          voided_by = ${me.id}::uuid,
          voided_reason = ${reason ?? '수신자 제외'}, updated_at = NOW()
        WHERE id = ${recip.document_id}::uuid AND status IN ('draft','in_progress')
      `);
    }

    await db
      .update(campaignRecipients)
      .set({ status: 'excluded', error: reason ?? null })
      .where(eq(campaignRecipients.id, recip.id));

    await logAudit({
      userId: me.id,
      action: 'campaign_recipient_excluded',
      meta: {
        campaign_id: id,
        recipient_id: recip.id,
        email: recip.email,
        reason: reason ?? null,
      },
      req: reqLike,
    });

    // 제외 후 미응답이 0이면 자동 완료 처리
    await maybeFinalizeCampaign(id);

    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /:id/recipients/:rid/replace — 수신자 교체 ────────────────────────
// 기존 수신자를 excluded 처리한 뒤, 새 이메일로 새 문서 발송.
// 예: 담당자 A 가 퇴사 → 후임 B 로 교체.
campaigns.post('/:id/recipients/:recipientId/replace', validate('json', ReplaceRecipientBody), async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const recipientId = c.req.param('recipientId');
    const reqLike = expressReqLike(c);
    // 스키마가 email 을 trim·lowercase·포맷검증까지 마쳤다.
    const { email, name, reason } = c.req.valid('json');

    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status !== 'in_progress') {
      return c.json({ error: '진행 중인 캠페인에서만 교체할 수 있습니다' }, 400);
    }
    const [oldRecip] = await db
      .select()
      .from(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.id, recipientId),
          eq(campaignRecipients.campaign_id, id)
        )
      );
    if (!oldRecip) return c.json({ error: '수신자를 찾을 수 없습니다' }, 404);
    if (oldRecip.status === 'signed') {
      return c.json({ error: '이미 서명 완료된 수신자는 교체할 수 없습니다' }, 400);
    }

    if (email === oldRecip.email) {
      return c.json({ error: '동일한 이메일로는 교체할 수 없습니다' }, 400);
    }
    const normalizedEmail = email;

    // 1) 기존 수신자 excluded + 문서 void
    if (oldRecip.document_id) {
      await db.execute(sql`
        UPDATE documents SET status = 'voided', voided_at = NOW(),
          voided_by = ${me.id}::uuid,
          voided_reason = ${reason ?? '수신자 교체'}, updated_at = NOW()
        WHERE id = ${oldRecip.document_id}::uuid AND status IN ('draft','in_progress')
      `);
    }
    await db
      .update(campaignRecipients)
      .set({ status: 'excluded', error: reason ?? 'replaced' })
      .where(eq(campaignRecipients.id, oldRecip.id));

    // 2) 새 수신자 insert — 동일 캠페인 내 이메일 중복이면 409
    const [newRecip] = await db
      .insert(campaignRecipients)
      .values({
        campaign_id: id,
        email: normalizedEmail,
        name: name?.trim() || null,
      })
      .onConflictDoNothing({
        target: [campaignRecipients.campaign_id, campaignRecipients.email],
      })
      .returning();
    if (!newRecip) {
      return c.json({ error: '이미 해당 이메일의 수신자가 존재합니다' }, 409);
    }

    // 3) dispatch
    const [tpl] = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, owned.campaign.template_id));
    if (!tpl) return c.json({ error: '템플릿이 삭제되었습니다' }, 400);
    const tplFields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.template_id, tpl.id));
    const [owner] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, me.id));
    if (!owner) return c.json({ error: '소유자 정보를 찾을 수 없습니다' }, 500);

    const dispatchResult = await dispatchSingleRecipient({
      campaign: owned.campaign,
      recipient: newRecip,
      template: tpl,
      templateFields: tplFields,
      owner,
      req: reqLike,
    });

    await db
      .update(signingCampaigns)
      .set({
        total_count: sql`${signingCampaigns.total_count} + 1`,
        updated_at: sql`NOW()`,
      })
      .where(eq(signingCampaigns.id, id));

    await logAudit({
      userId: me.id,
      action: 'campaign_recipient_replaced',
      meta: {
        campaign_id: id,
        old_recipient_id: oldRecip.id,
        old_email: oldRecip.email,
        new_recipient_id: newRecip.id,
        new_email: newRecip.email,
        reason: reason ?? null,
      },
      req: reqLike,
    });

    return c.json({
      ok: dispatchResult.ok,
      old_recipient_id: oldRecip.id,
      new_recipient: newRecip,
      dispatch: dispatchResult,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /:id/dispatch — 캠페인 시작 (팬아웃) ──────────────────────────────
campaigns.post('/:id/dispatch', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const reqLike = expressReqLike(c);
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    if (owned.campaign.status !== 'draft') {
      return c.json({ error: 'draft 상태의 캠페인만 발송할 수 있습니다' }, 400);
    }

    const [tpl] = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, owned.campaign.template_id));
    if (!tpl) return c.json({ error: '템플릿이 삭제되었습니다' }, 400);
    const tplFields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.template_id, tpl.id));
    if (!tplFields.length) return c.json({ error: '템플릿에 필드가 없습니다' }, 400);
    const recips = await db
      .select()
      .from(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.campaign_id, id),
          eq(campaignRecipients.status, 'pending')
        )
      );
    if (!recips.length) return c.json({ error: '발송할 수신자가 없습니다' }, 400);

    const [owner] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, me.id));
    if (!owner) return c.json({ error: '소유자 정보를 찾을 수 없습니다' }, 500);

    await db
      .update(signingCampaigns)
      .set({
        status: 'in_progress',
        started_at: sql`NOW()`,
        total_count: recips.length,
        updated_at: sql`NOW()`,
      })
      .where(eq(signingCampaigns.id, id));

    let success = 0;
    let failed = 0;
    for (const recip of recips) {
      const result = await dispatchSingleRecipient({
        campaign: owned.campaign,
        recipient: recip,
        template: tpl,
        templateFields: tplFields,
        owner,
        req: reqLike,
      });
      if (result.ok) success += 1;
      else failed += 1;
    }

    notifyUser(me.id, {
      type: 'campaign_dispatched',
      campaign_id: id,
      success,
      failed,
    });

    return c.json({ ok: true, success, failed, total: recips.length });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── POST /:id/recipients/:rid/resend — 미응답 수신자 재발송 ──────────────
campaigns.post('/:id/recipients/:recipientId/resend', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const recipientId = c.req.param('recipientId');
    const reqLike = expressReqLike(c);
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);
    const [recip] = await db
      .select()
      .from(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.id, recipientId),
          eq(campaignRecipients.campaign_id, id)
        )
      );
    if (!recip) return c.json({ error: '수신자를 찾을 수 없습니다' }, 404);
    if (!recip.document_id) {
      return c.json({ error: '아직 발송되지 않은 수신자입니다' }, 400);
    }
    if (recip.status !== 'sent' && recip.status !== 'viewed') {
      return c.json({ error: '미응답(sent/viewed) 상태의 수신자만 재발송할 수 있습니다' }, 400);
    }

    const [signerPart] = await db
      .select({ token: documentParticipants.invite_token })
      .from(documentParticipants)
      .where(
        and(
          eq(documentParticipants.document_id, recip.document_id),
          eq(documentParticipants.role, 'signer')
        )
      );
    if (!signerPart?.token) {
      return c.json({ error: '초대 토큰을 찾을 수 없습니다' }, 400);
    }

    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, me.id));

    await sendInviteEmail({
      toEmail: recip.email,
      inviterName: owner?.name ?? me.name,
      docName: owned.campaign.name,
      token: signerPart.token,
      role: 'signer',
    });

    await logAudit({
      docId: recip.document_id,
      userId: me.id,
      action: 'campaign_invite_resent',
      meta: { campaign_id: id, recipient_id: recip.id, email: recip.email },
      req: reqLike,
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── GET /:id/export.csv — 수신자 응답 CSV ──────────────────────────────────
// BOM 포함 UTF-8 CSV — Excel 한글 깨짐 방지.
campaigns.get('/:id/export.csv', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);

    const result = await db.execute(sql`
      SELECT email, name, status, sent_at, signed_at, declined_at,
             COALESCE(error, '') AS error
      FROM campaign_recipients
      WHERE campaign_id = ${id}::uuid
      ORDER BY created_at ASC
    `);

    const csvLines = ['email,name,status,sent_at,signed_at,declined_at,error'];
    for (const r of result.rows as Array<{
      email: string;
      name: string | null;
      status: string;
      sent_at: Date | null;
      signed_at: Date | null;
      declined_at: Date | null;
      error: string;
    }>) {
      const fields = [
        r.email,
        r.name ?? '',
        r.status,
        r.sent_at ? new Date(r.sent_at).toISOString() : '',
        r.signed_at ? new Date(r.signed_at).toISOString() : '',
        r.declined_at ? new Date(r.declined_at).toISOString() : '',
        r.error,
      ];
      const escaped = fields.map((f) => {
        const s = String(f);
        return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      csvLines.push(escaped.join(','));
    }
    const csvBuffer = Buffer.from('\ufeff' + csvLines.join('\n'), 'utf8');
    const filename = owned.campaign.name + '_recipients.csv';
    return c.body(new Uint8Array(csvBuffer), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─── GET /:id/export.zip — 완료된 문서 PDF 묶음 ────────────────────────────
campaigns.get('/:id/export.zip', async (c) => {
  try {
    const me = c.get('user');
    const id = c.req.param('id');
    const owned = await getOwnedCampaign(id, me.id);
    if (owned.error === 'NOT_FOUND') return c.json({ error: '캠페인을 찾을 수 없습니다' }, 404);
    if (owned.error === 'FORBIDDEN') return c.json({ error: '권한이 없습니다' }, 403);

    const completed = await db.execute(sql`
      SELECT r.email, r.name, d.id AS document_id, d.signed_pdf_path, d.signed_pdf_hash
      FROM campaign_recipients r
      JOIN documents d ON d.id = r.document_id
      WHERE r.campaign_id = ${id}::uuid
        AND r.status = 'signed'
        AND d.signed_pdf_path IS NOT NULL
      ORDER BY r.created_at ASC
    `);
    const rows = completed.rows as Array<{
      email: string;
      name: string | null;
      document_id: string;
      signed_pdf_path: string;
      signed_pdf_hash: string | null;
    }>;
    if (!rows.length) return c.json({ error: '완료된 문서가 없습니다' }, 404);

    const zipName = owned.campaign.name + '.zip';

    // archiver → Node stream → Web ReadableStream — export.ts 와 동일 패턴.
    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[zip]', err.message);
      passThrough.destroy(err);
    });
    archive.pipe(passThrough);

    (async () => {
      try {
        const used = new Set<string>();
        for (const r of rows) {
          const buf = await readPdf(r.signed_pdf_path);
          const safeName = (r.name?.trim() || r.email.split('@')[0])
            .replace(/[\\/:*?"<>|]/g, '_')
            .slice(0, 80);
          let filename = `${safeName}.pdf`;
          let i = 2;
          while (used.has(filename)) filename = `${safeName} (${i++}).pdf`;
          used.add(filename);
          archive.append(Buffer.from(buf), { name: filename });
        }
        await archive.finalize();
      } catch (err) {
        console.error('[campaign zip build]', (err as Error).message);
        passThrough.destroy(err as Error);
      }
    })();

    const webStream = Readable.toWeb(passThrough) as ReadableStream<Uint8Array>;
    return c.body(webStream, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default campaigns;
