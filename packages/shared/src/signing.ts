/**
 * /api/documents/:docId/signing 관련 입력 스키마.
 * (실제 필드 채우기는 /fields/:fieldId/response → fields.ts 의 FillFieldBody.)
 */
import { z } from 'zod';
import { OptionalText } from './common.js';

// PATCH /api/documents/:docId/signing/decline — 서명 거부 사유.
export const DeclineSigningBody = z.object({
  reason: OptionalText,
});
export type DeclineSigningBody = z.infer<typeof DeclineSigningBody>;
