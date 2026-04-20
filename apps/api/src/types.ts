/**
 * GreedySign API — 공유 타입 정의
 *
 * Express 는 Phase 6 에서 제거됐다. 감사 로그/IP 추출을 위해 서비스 계층이
 * 필요로 하는 최소 필드만 노출하는 `ReqInfo` 타입을 공통으로 쓴다. Hono
 * 라우트에서는 `hono/reqInfo.ts` 의 `expressReqLike(c)` 가 이 shape 으로
 * 컨텍스트를 변환해 넘겨준다.
 */

// ─── JWT Payload ──────────────────────────────────────────────────────────────
export interface JwtUser {
  id: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

// 감사 로그/IP 추출용 최소 request-like 인터페이스. 이름은 호환성을 위해
// `ReqInfo` 로 둔다. Node `http.IncomingMessage` 와 Express Request 양쪽과
// 구조적으로 호환.
export interface ReqInfo {
  ip?: string | null;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null } | undefined;
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
// API 응답에 노출하는 통합 라이프사이클 상태. 스키마 이중 컬럼을 UI 친화적
// 단일 값으로 합친 것. 자세한 매핑은 services/queries.ts 참고.
export type ParticipantStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'declined';

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
  req?: ReqInfo | null;
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

// ─── Template / Campaign (대량 배포 플로우) ────────────────────────────────
export type TemplateStatus = 'draft' | 'ready' | 'archived';
export type CampaignStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';
export type RecipientStatus =
  | 'pending'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'expired'
  | 'failed';

export interface TemplateRow {
  id: string;
  owner_id: string;
  name: string;
  description?: string | null;
  pdf_path: string;
  pdf_hash?: string | null;
  size_bytes?: number | null;
  page_count?: number | null;
  status: TemplateStatus;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateFieldRow {
  id: string;
  template_id: string;
  recipient_role: string;
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

export interface CampaignRow {
  id: string;
  owner_id: string;
  template_id: string;
  name: string;
  message?: string | null;
  status: CampaignStatus;
  expires_at?: Date | null;
  started_at?: Date | null;
  completed_at?: Date | null;
  cancelled_at?: Date | null;
  total_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CampaignRecipientRow {
  id: string;
  campaign_id: string;
  email: string;
  name?: string | null;
  document_id?: string | null;
  status: RecipientStatus;
  error?: string | null;
  sent_at?: Date | null;
  viewed_at?: Date | null;
  signed_at?: Date | null;
  declined_at?: Date | null;
  created_at: Date;
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
