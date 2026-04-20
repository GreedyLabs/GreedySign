/**
 * /api/campaigns 관련 입력 스키마.
 */
import { z } from 'zod';
import { OptionalIsoDate, OptionalText } from './common.js';

// POST /api/campaigns — 새 캠페인 생성 (템플릿 기반).
export const CreateCampaignBody = z.object({
  template_id: z.string().min(1, 'template_id가 필요합니다'),
  name: z.string().trim().min(1, '캠페인 이름이 필요합니다').max(200),
  message: OptionalText,
  expires_at: OptionalIsoDate,
});
export type CreateCampaignBody = z.infer<typeof CreateCampaignBody>;

// PATCH /api/campaigns/:id — 캠페인 메타데이터 수정.
export const UpdateCampaignBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  message: OptionalText,
  expires_at: OptionalIsoDate,
});
export type UpdateCampaignBody = z.infer<typeof UpdateCampaignBody>;

// POST /api/campaigns/:id/recipients — 수신자 일괄 추가.
// CSV 대량 업로드를 지원하기 위해 스키마 단계에서는 이메일 포맷까지 검증하지
// 않는다. 핸들러가 항목별로 empty/invalid/duplicate 를 분류해서 `skipped` 리포트에
// 담아 클라이언트에 돌려주는 UX 를 유지해야 한다.
export const AddRecipientsBody = z.object({
  recipients: z
    .array(
      z.object({
        email: z.string().optional(),
        name: z.string().optional(),
      })
    )
    .min(1, 'recipients 배열이 필요합니다'),
});
export type AddRecipientsBody = z.infer<typeof AddRecipientsBody>;

// PATCH /api/campaigns/:id/recipients/:recipientId/exclude — 수신자 제외.
export const ExcludeRecipientBody = z.object({
  reason: OptionalText,
});
export type ExcludeRecipientBody = z.infer<typeof ExcludeRecipientBody>;

// POST /api/campaigns/:id/recipients/:recipientId/replace — 수신자 교체.
// 기존 핸들러의 에러 메시지('유효한 이메일이 필요합니다')를 유지하기 위해
// Email 공통 스키마를 그대로 쓰지 않고 에러 메시지를 덮어쓴다.
export const ReplaceRecipientBody = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, '유효한 이메일이 필요합니다')
    .email('유효한 이메일이 필요합니다'),
  name: z.string().trim().max(100).optional(),
  reason: OptionalText,
});
export type ReplaceRecipientBody = z.infer<typeof ReplaceRecipientBody>;
