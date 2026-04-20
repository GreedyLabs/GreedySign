import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and, ne, notInArray } from 'drizzle-orm';
import { documents, documentParticipants } from '../db/schema.js';

// ─── Unified Participant Status ──────────────────────────────────────────────
//
// 스키마에는 `invite_status`(pending·accepted·declined) 와
// `signing_status`(not_started·in_progress·completed·declined) 두 컬럼이
// 분리돼 있다. 초대 수락 이후에만 서명 상태가 의미를 가지므로, UI 에는 두
// 값을 하나의 라이프사이클로 합친 `participant_status` 를 제공한다:
//
//   pending      → 초대 미응답 (invite_status='pending')
//   declined     → 어느 단계에서든 거절
//   accepted     → 수락했으나 아직 발송되지 않음 (draft 에디터 상태)
//   in_progress  → 수락 + 발송됨, 서명 대기
//   completed    → 서명 완료
//
// 스키마 이중 컬럼은 감사·백업 목적으로 그대로 유지한다.
export const participantStatusSql = sql`CASE
  WHEN p.invite_status = 'declined' OR p.signing_status = 'declined' THEN 'declined'
  WHEN p.invite_status = 'pending' THEN 'pending'
  WHEN p.signing_status = 'completed' THEN 'completed'
  WHEN p.signing_status = 'in_progress' THEN 'in_progress'
  ELSE 'accepted'
END`;

export function computeParticipantStatus(
  invite_status: string,
  signing_status: string
): 'pending' | 'accepted' | 'in_progress' | 'completed' | 'declined' {
  if (invite_status === 'declined' || signing_status === 'declined') return 'declined';
  if (invite_status === 'pending') return 'pending';
  if (signing_status === 'completed') return 'completed';
  if (signing_status === 'in_progress') return 'in_progress';
  return 'accepted';
}

// ─── Document Lock Checks ─────────────────────────────────────────────────────

export async function checkDocumentLocked(docId: string): Promise<boolean> {
  const [doc] = await db
    .select({ status: documents.status })
    .from(documents)
    .where(eq(documents.id, docId));
  if (!doc) return true; // 문서 없으면 차단
  return doc.status === 'completed' || doc.status === 'voided';
}

export async function checkParticipantLocked(docId: string, userId: string): Promise<boolean> {
  const [part] = await db
    .select({ signing_status: documentParticipants.signing_status })
    .from(documentParticipants)
    .where(
      and(eq(documentParticipants.document_id, docId), eq(documentParticipants.user_id, userId))
    );
  if (!part) return false;
  return part.signing_status === 'completed' || part.signing_status === 'declined';
}

// ─── Document Queries ─────────────────────────────────────────────────────────

export async function getDocumentWithStatus(
  docId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.execute(sql`
    SELECT
      d.id, d.name, d.size_bytes, d.page_count, d.created_at, d.updated_at,
      d.status, d.signing_mode, d.completed_at, d.signed_pdf_hash,
      d.voided_at, d.voided_reason,
      u.name  AS owner_name,
      u.email AS owner_email,
      (d.owner_id = ${userId}::uuid) AS is_owner,
      p.id    AS participant_id,
      p.role,
      p.invite_status,
      p.signing_status AS my_signing_status,
      CASE
        WHEN p.invite_status = 'declined' OR p.signing_status = 'declined' THEN 'declined'
        WHEN p.invite_status = 'pending' THEN 'pending'
        WHEN p.signing_status = 'completed' THEN 'completed'
        WHEN p.signing_status = 'in_progress' THEN 'in_progress'
        WHEN p.id IS NULL THEN NULL
        ELSE 'accepted'
      END AS my_participant_status,
      p.is_owner AS p_is_owner
    FROM documents d
    JOIN users u ON u.id = d.owner_id
    LEFT JOIN document_participants p ON p.document_id = d.id AND p.user_id = ${userId}::uuid
    WHERE d.id = ${docId}::uuid
  `);
  return (result.rows[0] as Record<string, unknown>) ?? null;
}

// ─── Participant Queries ──────────────────────────────────────────────────────

export async function getParticipants(docId: string): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`
    SELECT
      p.id, p.user_id, p.email, p.name,
      COALESCE(u.name, p.name, p.email) AS display_name,
      p.role, p.is_owner, p.signing_order,
      p.invite_status, p.signing_status,
      CASE
        WHEN p.invite_status = 'declined' OR p.signing_status = 'declined' THEN 'declined'
        WHEN p.invite_status = 'pending' THEN 'pending'
        WHEN p.signing_status = 'completed' THEN 'completed'
        WHEN p.signing_status = 'in_progress' THEN 'in_progress'
        ELSE 'accepted'
      END AS participant_status,
      p.invited_at, p.responded_at, p.completed_at,
      (SELECT COUNT(*)::int FROM form_fields ff WHERE ff.participant_id = p.id) AS field_count,
      (SELECT COUNT(*)::int FROM field_responses fr
       JOIN form_fields ff ON ff.id = fr.field_id
       WHERE ff.participant_id = p.id AND fr.participant_id = p.id) AS response_count
    FROM document_participants p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.document_id = ${docId}::uuid
    ORDER BY p.is_owner DESC, p.signing_order, p.invited_at
  `);
  return result.rows as Record<string, unknown>[];
}

// ─── Field Queries ────────────────────────────────────────────────────────────

export async function getDocumentFields(docId: string): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`
    SELECT
      ff.*,
      p.email   AS participant_email,
      COALESCE(u.name, p.name, p.email) AS participant_name,
      p.role    AS participant_role,
      p.is_owner AS participant_is_owner
    FROM form_fields ff
    LEFT JOIN document_participants p ON p.id = ff.participant_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE ff.document_id = ${docId}::uuid
    ORDER BY ff.page_number, ff.created_at
  `);
  return result.rows as Record<string, unknown>[];
}

export async function getParticipantFieldsAndResponses(
  docId: string,
  participantId: string
): Promise<{ fields: Record<string, unknown>[]; responses: Record<string, unknown>[] }> {
  const [fieldsResult, responsesResult] = await Promise.all([
    db.execute(sql`
      SELECT
        ff.*,
        p.email   AS participant_email,
        COALESCE(u.name, p.name, p.email) AS participant_name,
        p.role    AS participant_role,
        p.is_owner AS participant_is_owner
      FROM form_fields ff
      LEFT JOIN document_participants p ON p.id = ff.participant_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE ff.document_id = ${docId}::uuid AND ff.participant_id = ${participantId}::uuid
      ORDER BY ff.page_number, ff.created_at
    `),
    db.execute(sql`
      SELECT fr.*
      FROM field_responses fr
      JOIN form_fields ff ON ff.id = fr.field_id
      WHERE ff.document_id = ${docId}::uuid AND fr.participant_id = ${participantId}::uuid
    `),
  ]);

  return {
    fields: fieldsResult.rows as Record<string, unknown>[],
    responses: responsesResult.rows as Record<string, unknown>[],
  };
}

export async function getAllFieldResponses(docId: string): Promise<Record<string, unknown>[]> {
  // 프라이버시 정책: 같은 문서의 참여자끼리는 서로의 응답을 볼 수 있되,
  // "해당 참여자가 자신의 서명을 확정 제출한 뒤(signing_status='completed')"
  // 에만 노출한다. in-progress 단계에서 찍어둔 텍스트/서명이 다른 참여자에게
  // 실시간으로 누출되는 것을 막기 위함. (DocuSign/Adobe Sign 의 기본 동작과 일치)
  //
  // 본인 응답은 어차피 GET /documents/:id 가 myResponses 로 별도 반환하므로,
  // 여기서 자신이 빠져도 화면에는 비지 않는다.
  const result = await db.execute(sql`
    SELECT
      fr.field_id, fr.participant_id,
      fr.text_value, fr.checked, fr.svg_data, fr.date_value,
      ff.field_type, ff.x, ff.y, ff.width, ff.height, ff.page_number
    FROM field_responses fr
    JOIN form_fields ff ON ff.id = fr.field_id
    JOIN document_participants dp ON dp.id = fr.participant_id
    WHERE ff.document_id = ${docId}::uuid
      AND dp.signing_status = 'completed'
  `);
  return result.rows as Record<string, unknown>[];
}

// ─── Freeze / Completion ──────────────────────────────────────────────────────

export async function shouldFreezeDocument(docId: string): Promise<boolean> {
  const [doc] = await db
    .select({ status: documents.status })
    .from(documents)
    .where(eq(documents.id, docId));

  if (!doc || doc.status !== 'in_progress') return false;

  // 아직 서명이 끝나지 않은 signer가 한 명이라도 있으면 false.
  //
  // 핵심: 초대 미응답(`invite_status='pending'`) signer도 "아직 끝나지 않은"
  // 사람으로 카운트해야 한다. 공유자(소유자)가 자기 자신을 signer 로 넣고
  // 먼저 서명한 뒤 다른 초대자가 아직 수락 전이면, 이전 로직은
  // `invite_status='accepted'` 필터 때문에 pending 초대자를 제외하고
  // freeze 를 조기에 트리거했다 (결과: 다른 signer 가 나중에 수락·서명하려
  // 할 때 문서는 이미 completed 상태여서 /submit 이 400 으로 실패).
  //
  // 종결 상태(declined, completed)만 제외하고 나머지는 모두 블로커로 본다.
  const pending = await db
    .select({ id: documentParticipants.id })
    .from(documentParticipants)
    .where(
      and(
        eq(documentParticipants.document_id, docId),
        eq(documentParticipants.role, 'signer'),
        ne(documentParticipants.invite_status, 'declined'),
        notInArray(documentParticipants.signing_status, ['completed', 'declined'])
      )
    )
    .limit(1);

  return pending.length === 0;
}
