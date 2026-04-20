/**
 * /api/documents/:docId/fields 관련 입력 스키마.
 */
import { z } from 'zod';
import { FieldType, OptionalText } from './common.js';

// 필드 좌표 — 서버에서 Number(...) 변환 후 그대로 DB 에 저장. 음수/NaN 은 허용하지
// 않는 것이 자연스럽다. 기존 핸들러는 타입 체크만 하고 경계값 검증은 하지 않아
// 동작상 호환을 위해 여기서도 경계값은 강제하지 않는다.
const Coordinate = z.number().finite();

// POST /api/documents/:docId/fields — 새 필드 배치.
export const CreateFieldBody = z.object({
  field_type: FieldType,
  participant_id: z.string().min(1, '참여자(participant_id)가 필요합니다'),
  label: OptionalText,
  required: z.boolean().optional(),
  x: Coordinate,
  y: Coordinate,
  width: Coordinate,
  height: Coordinate,
  page_number: z.number().int().min(1).optional(),
});
export type CreateFieldBody = z.infer<typeof CreateFieldBody>;

// PUT /api/documents/:docId/fields/:fieldId — 위치/라벨/담당자 변경.
export const UpdateFieldBody = z.object({
  x: Coordinate.optional(),
  y: Coordinate.optional(),
  width: Coordinate.optional(),
  height: Coordinate.optional(),
  label: OptionalText,
  participant_id: z.string().min(1).optional(),
});
export type UpdateFieldBody = z.infer<typeof UpdateFieldBody>;

// PUT /api/documents/:docId/fields/:fieldId/response — 서명자가 값을 채우는
// 엔드포인트. 필드 타입에 따라 의미 있는 키가 달라지지만 서버 핸들러는 수용한
// 값만 저장하므로 스키마에서는 모두 optional 로 둔다.
export const FillFieldBody = z.object({
  text_value: OptionalText,
  checked: z.boolean().optional().nullable(),
  svg_data: OptionalText,
  date_value: OptionalText,
  source_sig_id: OptionalText,
});
export type FillFieldBody = z.infer<typeof FillFieldBody>;
