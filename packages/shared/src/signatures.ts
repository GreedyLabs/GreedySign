/**
 * /api/signatures 관련 입력 스키마.
 */
import { z } from 'zod';
import { SignatureMethod, OptionalText } from './common.js';

// POST /api/signatures — 저장된 서명 생성.
export const CreateSignatureBody = z.object({
  name: z.string().trim().max(100).optional(),
  method: SignatureMethod,
  svg_data: z.string().min(1, 'svg_data와 method가 필요합니다'),
  thumbnail: OptionalText,
  is_default: z.boolean().optional(),
});
export type CreateSignatureBody = z.infer<typeof CreateSignatureBody>;

// PUT /api/signatures/:id — 기존 서명 덮어쓰기 (svg_data·method 필수).
export const UpdateSignatureBody = z.object({
  name: z.string().trim().max(100).optional(),
  method: SignatureMethod,
  svg_data: z.string().min(1, 'svg_data와 method가 필요합니다'),
  thumbnail: OptionalText,
});
export type UpdateSignatureBody = z.infer<typeof UpdateSignatureBody>;
