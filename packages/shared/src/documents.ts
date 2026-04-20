/**
 * /api/documents 관련 입력 스키마.
 * (업로드는 multipart 라 zValidator('form', ...) 의 대상이 아니며 핸들러 내부
 *  `c.req.parseBody()` 에서 직접 검증한다.)
 */
import { z } from 'zod';
import { OptionalText } from './common.js';

// PATCH /api/documents/:id/void — 무효화 사유.
export const VoidDocumentBody = z.object({
  reason: OptionalText,
});
export type VoidDocumentBody = z.infer<typeof VoidDocumentBody>;
