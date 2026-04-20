/**
 * 캠페인 수신자 상태 동기화 훅 — 문서 라이프사이클 이벤트가 발생하면
 * 해당 문서가 캠페인에 속해 있을 경우 `campaign_recipients` 를 업데이트한다.
 *
 * 이 파일은 `routes/campaigns` 에서 추출됐다. 호출자
 *  - `services/freeze.ts` → onCampaignEnvelopeCompleted
 *  - `hono/routes/signing.ts` → onCampaignEnvelopeDeclined
 *  - `hono/routes/invite.ts` → markRecipientViewed
 * 가 라우터 객체(Express Router)가 아니라 순수 함수만 필요했기 때문에,
 * 라우트 파일이 Hono 로 이관되어 제거돼도 호출 관계가 깨지지 않도록
 * 별도 모듈로 분리한다.
 */
import { sql, eq } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { campaignRecipients, signingCampaigns, notifications } from '../db/schema.js';
import { notifyUser } from './sse.js';

/**
 * 모든 수신자가 terminal(signed/declined/expired/failed/excluded) 이면
 * 캠페인을 completed 로 전환하고 소유자에게 알림.
 */
async function maybeFinalizeCampaign(campaignId: string): Promise<void> {
  const [{ remaining }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS remaining FROM campaign_recipients
    WHERE campaign_id = ${campaignId}::uuid
      AND status NOT IN ('signed','declined','expired','failed','excluded')
  `)).rows as Array<{ remaining: number }>;
  if (remaining > 0) return;
  const [c] = await db
    .select({
      owner_id: signingCampaigns.owner_id,
      name: signingCampaigns.name,
      status: signingCampaigns.status,
    })
    .from(signingCampaigns)
    .where(eq(signingCampaigns.id, campaignId));
  if (!c || c.status !== 'in_progress') return;
  await db
    .update(signingCampaigns)
    .set({ status: 'completed', completed_at: sql`NOW()`, updated_at: sql`NOW()` })
    .where(eq(signingCampaigns.id, campaignId));
  await db.insert(notifications).values({
    user_id: c.owner_id,
    type: 'campaign_completed',
    title: `캠페인 완료: ${c.name}`,
    body: '모든 수신자 응답이 완료되었습니다.',
  });
  notifyUser(c.owner_id, { type: 'campaign_completed', campaign_id: campaignId });
}

// 라우트 핸들러에서도 같은 판정 로직을 공유해야 해 export.
export { maybeFinalizeCampaign };

export async function onCampaignEnvelopeCompleted(documentId: string): Promise<void> {
  try {
    const [recip] = await db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.document_id, documentId));
    if (!recip) return;
    await db
      .update(campaignRecipients)
      .set({ status: 'signed', signed_at: sql`NOW()` })
      .where(eq(campaignRecipients.id, recip.id));

    const [c] = await db
      .select({ owner_id: signingCampaigns.owner_id })
      .from(signingCampaigns)
      .where(eq(signingCampaigns.id, recip.campaign_id));
    if (c) {
      notifyUser(c.owner_id, {
        type: 'campaign_progress',
        campaign_id: recip.campaign_id,
      });
    }
    await maybeFinalizeCampaign(recip.campaign_id);
  } catch (err) {
    console.error('[campaign aggregate]', (err as Error).message);
  }
}

export async function onCampaignEnvelopeDeclined(
  documentId: string,
  reason?: string
): Promise<void> {
  try {
    const [recip] = await db
      .select({ id: campaignRecipients.id, campaign_id: campaignRecipients.campaign_id })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.document_id, documentId));
    if (!recip) return;
    await db
      .update(campaignRecipients)
      .set({ status: 'declined', declined_at: sql`NOW()`, error: reason ?? null })
      .where(eq(campaignRecipients.id, recip.id));
    await maybeFinalizeCampaign(recip.campaign_id);
  } catch (err) {
    console.error('[campaign decline sync]', (err as Error).message);
  }
}

export async function markRecipientViewed(documentId: string): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE campaign_recipients
      SET status = 'viewed', viewed_at = NOW()
      WHERE document_id = ${documentId}::uuid AND status = 'sent'
    `);
  } catch (err) {
    console.error('[campaign view mark]', (err as Error).message);
  }
}
