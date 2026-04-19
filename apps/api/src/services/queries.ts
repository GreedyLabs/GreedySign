import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and, ne } from 'drizzle-orm';
import { documents, documentParticipants } from '../db/schema.js';

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
  const result = await db.execute(sql`
    SELECT
      fr.field_id, fr.participant_id,
      fr.text_value, fr.checked, fr.svg_data, fr.date_value,
      ff.field_type, ff.x, ff.y, ff.width, ff.height, ff.page_number
    FROM field_responses fr
    JOIN form_fields ff ON ff.id = fr.field_id
    WHERE ff.document_id = ${docId}::uuid
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

  // 아직 서명을 완료하지 않은 accepted signer가 한 명이라도 있으면 false
  const pending = await db
    .select({ id: documentParticipants.id })
    .from(documentParticipants)
    .where(
      and(
        eq(documentParticipants.document_id, docId),
        eq(documentParticipants.role, 'signer'),
        eq(documentParticipants.invite_status, 'accepted'),
        ne(documentParticipants.signing_status, 'completed')
      )
    )
    .limit(1);

  return pending.length === 0;
}
