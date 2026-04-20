/**
 * /api/templates 관련 입력 스키마.
 */
import { z } from 'zod';
import { Email, FieldType, OptionalText, TemplateStatus } from './common.js';

// PATCH /api/templates/:id — 이름/설명/상태 변경.
// status='ready' 승격 시 ≥1 필드가 필요하다는 추가 GATE 는 핸들러에서 DB 조회 후
// 검증한다 (여기 스키마 범위 밖).
export const UpdateTemplateBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: OptionalText,
  status: TemplateStatus.optional(),
});
export type UpdateTemplateBody = z.infer<typeof UpdateTemplateBody>;

// POST /api/templates/:id/fields — 템플릿 필드 추가.
export const CreateTemplateFieldBody = z.object({
  field_type: FieldType,
  label: OptionalText,
  required: z.boolean().optional(),
  page_number: z.number().int().min(1).optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
});
export type CreateTemplateFieldBody = z.infer<typeof CreateTemplateFieldBody>;

// PUT /api/templates/:id/fields/:fieldId — 템플릿 필드 수정.
export const UpdateTemplateFieldBody = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().finite().optional(),
  height: z.number().finite().optional(),
  label: OptionalText,
  required: z.boolean().optional(),
});
export type UpdateTemplateFieldBody = z.infer<typeof UpdateTemplateFieldBody>;

// POST /api/templates/:id/instantiate — 템플릿으로부터 새 문서(+서명자) 생성.
// '본인에게 보낼 수 없습니다' 규칙은 로그인 사용자 이메일과 비교가 필요하므로
// 핸들러에서 추가 검증한다.
export const InstantiateTemplateBody = z.object({
  email: Email,
  name: z.string().trim().max(100).optional(),
  document_name: z.string().trim().max(200).optional(),
});
export type InstantiateTemplateBody = z.infer<typeof InstantiateTemplateBody>;
