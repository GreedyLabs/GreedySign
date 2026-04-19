/**
 * GreedySign API — 공유 타입 정의
 * Express Request 확장 및 DB Row 타입 포함.
 */
import type { Request } from 'express';

// ─── JWT Payload ──────────────────────────────────────────────────────────────
export interface JwtUser {
  id: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

// Express Request 글로벌 타입 확장
declare global {
  namespace Express {
    interface Request {
      user: JwtUser;
    }
  }
}

// ─── DB Row Types ─────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  name: string;
  google_id?: string | null;
  avatar_url?: string | null;
  created_at: Date;
}

export type DocumentStatus = 'draft' | 'in_progress' | 'completed' | 'voided';
export type SigningMode = 'parallel' | 'sequential';

export interface DocumentRow {
  id: string;
  owner_id: string;
  name: string;
  pdf_path: string;
  pdf_hash?: string | null;
  size_bytes?: number | null;
  page_count?: number | null;
  status: DocumentStatus;
  signing_mode: SigningMode;
  completed_at?: Date | null;
  signed_pdf_path?: string | null;
  signed_pdf_hash?: string | null;
  voided_at?: Date | null;
  voided_by?: string | null;
  voided_reason?: string | null;
  created_at: Date;
  updated_at: Date;
}

export type ParticipantRole = 'signer' | 'cc';
export type InviteStatus = 'pending' | 'accepted' | 'declined';
export type SigningStatus = 'not_started' | 'in_progress' | 'completed' | 'declined';

export interface ParticipantRow {
  id: string;
  document_id: string;
  user_id?: string | null;
  email: string;
  name?: string | null;
  role: ParticipantRole;
  is_owner: boolean;
  signing_order: number;
  invite_token?: string | null;
  invite_status: InviteStatus;
  signing_status: SigningStatus;
  decline_reason?: string | null;
  invited_at: Date;
  responded_at?: Date | null;
  completed_at?: Date | null;
}

export type FieldType = 'text' | 'checkbox' | 'signature' | 'initial' | 'date';

export interface FormFieldRow {
  id: string;
  document_id: string;
  participant_id?: string | null;
  field_type: FieldType;
  label?: string | null;
  required: boolean;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: Date;
}

export interface FieldResponseRow {
  id: string;
  field_id: string;
  participant_id: string;
  text_value?: string | null;
  checked?: boolean | null;
  svg_data?: string | null;
  date_value?: Date | null;
  source_sig_id?: string | null;
  updated_at: Date;
}

export interface AuditLogRow {
  id: string;
  document_id?: string | null;
  user_id?: string | null;
  participant_id?: string | null;
  action: string;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
  created_at: Date;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  document_id?: string | null;
  read_at?: Date | null;
  created_at: Date;
}

export interface UserSignatureRow {
  id: string;
  user_id: string;
  name: string;
  method: 'draw' | 'image';
  svg_data: string;
  thumbnail?: string | null;
  is_default: boolean;
  created_at: Date;
}

// ─── Service Param Types ──────────────────────────────────────────────────────

export interface AuditLogParams {
  docId?: string | null;
  userId?: string | null;
  participantId?: string | null;
  action: string;
  meta?: Record<string, unknown> | null;
  req?: Request | null;
}

export interface SendInviteEmailParams {
  toEmail: string;
  inviterName: string;
  docName: string;
  token: string;
  role?: ParticipantRole;
}

export interface SendCompletionEmailParams {
  toEmail: string;
  recipientName?: string | null;
  ownerName: string;
  docName: string;
  docId: string;
}

export interface SendDeclineEmailParams {
  toEmail: string;
  ownerName: string;
  signerName?: string | null;
  signerEmail: string;
  docName: string;
  reason?: string;
}

// ─── Search Types ─────────────────────────────────────────────────────────────

export interface SearchResultItem {
  type: 'document';
  id: string;
  name: string;
  status: DocumentStatus;
  is_owner: boolean;
  owner_name?: string | null;
  updated_at: Date;
  matched_participant?: string | null; // 참여자 이름/이메일로 매칭된 경우
}
