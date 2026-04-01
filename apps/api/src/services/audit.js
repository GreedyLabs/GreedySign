import { query } from '../db/pool.js';

/**
 * 감사 로그 기록
 * @param {object} params
 * @param {string} params.docId
 * @param {string} params.userId
 * @param {string} params.action  - 'document_uploaded' | 'document_viewed' | 'document_exported' |
 *                                   'signing_started' | 'signing_completed' | 'field_placed' |
 *                                   'signature_placed' | 'share_invited' | 'share_accepted' | 'share_declined'
 * @param {object} [params.meta]  - 추가 컨텍스트 (파일명, 모드 등)
 * @param {import('express').Request} [params.req] - Express request (IP, User-Agent 추출용)
 */
export async function logAudit({ docId, userId, action, meta = null, req = null }) {
  const ip = req
    ? (req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? null)
    : null;
  const userAgent = req?.headers?.['user-agent'] ?? null;

  try {
    await query(
      `INSERT INTO audit_logs (document_id, user_id, action, meta, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [docId ?? null, userId ?? null, action, meta ? JSON.stringify(meta) : null, ip, userAgent]
    );
  } catch (err) {
    // 로깅 실패가 본 요청을 막으면 안 됨
    console.error('Audit log error:', err.message);
  }
}
