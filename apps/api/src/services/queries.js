import { query } from '../db/pool.js';

/**
 * 서명 완료 여부 확인
 * 소유자는 항상 편집 가능, 서명자는 서명 완료 시 편집 불가
 */
export async function checkSigningLocked(docId, userEmail) {
  // 소유자 여부 확인
  const { rows: ownerCheck } = await query(
    `SELECT 1 FROM documents d JOIN users u ON u.id = d.owner_id
     WHERE d.id=$1 AND u.email=$2`,
    [docId, userEmail]
  );
  if (ownerCheck.length) return false; // 소유자는 항상 편집 가능

  // 서명자의 서명 완료 여부 확인
  const { rows: shareCheck } = await query(
    `SELECT signing_status FROM document_shares
     WHERE document_id=$1 AND invitee_email=$2 AND invite_status='accepted'`,
    [docId, userEmail]
  );
  return shareCheck.length > 0 && shareCheck[0].signing_status === 'completed';
}

/**
 * 문서 정보와 사용자별 서명 상태 조회
 */
export async function getDocumentWithSigningStatus(docId, userEmail) {
  const { rows } = await query(
    `SELECT d.id, d.name, d.size_bytes, d.page_count, d.created_at, d.merge_mode,
            u.name AS owner_name, u.email AS owner_email,
            (u.email = $2) AS is_owner,
            COALESCE(ds.signing_status, 'not_started') AS my_signing_status
     FROM documents d
     JOIN users u ON d.owner_id = u.id
     LEFT JOIN document_shares ds ON ds.document_id = d.id AND ds.invitee_email = $2
     WHERE d.id = $1`,
    [docId, userEmail]
  );
  return rows[0] || null;
}

/**
 * 문서의 필드 목록 조회
 */
export async function getDocumentFields(docId) {
  const { rows } = await query(
    `SELECT * FROM form_fields WHERE document_id=$1 ORDER BY page_number, id`,
    [docId]
  );
  return rows;
}

/**
 * 사용자의 필드 값 조회
 */
export async function getUserFieldValues(docId, userId) {
  const { rows } = await query(
    `SELECT fv.field_id, fv.value, fv.updated_at
     FROM field_values fv
     JOIN form_fields ff ON ff.id = fv.field_id
     WHERE ff.document_id=$1 AND fv.user_id=$2`,
    [docId, userId]
  );
  return rows;
}

/**
 * 사용자의 서명 배치 조회
 */
export async function getUserSignaturePlacements(docId, userId) {
  const { rows } = await query(
    `SELECT * FROM signature_placements
     WHERE document_id=$1 AND user_id=$2`,
    [docId, userId]
  );
  return rows;
}

