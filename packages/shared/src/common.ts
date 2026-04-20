/**
 * 공통 스키마 조각 — 여러 도메인에서 재사용.
 */
import { z } from 'zod';

// 이메일 — 소문자·공백 정리. 서버도 동일하게 normalize 하므로 input 단에서
// 일관성 보장.
export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, '이메일을 입력해주세요')
  .email('올바른 이메일 형식이 아닙니다');

// ISO-8601 datetime 문자열. null 또는 undefined 허용 (서버가 null 로 normalize).
export const OptionalIsoDate = z
  .union([z.string().datetime({ offset: true }), z.null()])
  .optional();

// 자유 텍스트 (사유 / 메모 등). 빈 문자열과 null 을 동일하게 취급 — 양쪽 모두 ""/null 로 온다.
export const OptionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null ? null : v));

// 서명 필드 메서드.
export const SignatureMethod = z.enum(['draw', 'image']);

// 참여자 역할.
export const ParticipantRole = z.enum(['signer', 'cc']);

// 필드 타입 (서버와 DB CHECK 제약이 수용하는 값).
export const FieldType = z.enum([
  'signature',
  'text',
  'checkbox',
  'date',
  'name',
  'email',
]);

// 템플릿 상태.
export const TemplateStatus = z.enum(['draft', 'ready', 'archived']);
