/**
 * /api/documents/:docId/participants 관련 입력 스키마.
 */
import { z } from 'zod';
import { Email, OptionalText, ParticipantRole } from './common.js';

// POST /api/documents/:docId/participants — 참여자 추가.
export const AddParticipantBody = z.object({
  email: Email,
  name: z.string().trim().max(100).optional(),
  role: ParticipantRole.optional(),
  signing_order: z.number().int().min(0).optional(),
});
export type AddParticipantBody = z.infer<typeof AddParticipantBody>;

// PATCH /api/documents/:docId/participants/:id — 역할·순번 조정.
export const UpdateParticipantBody = z.object({
  role: ParticipantRole.optional(),
  signing_order: z.number().int().min(0).optional(),
});
export type UpdateParticipantBody = z.infer<typeof UpdateParticipantBody>;

// PATCH /api/documents/:docId/participants/me/decline — 서명 거부 사유.
export const DeclineParticipantBody = z.object({
  reason: OptionalText,
});
export type DeclineParticipantBody = z.infer<typeof DeclineParticipantBody>;
