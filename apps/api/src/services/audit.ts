import { db } from '../db/pool.js';
import { auditLogs } from '../db/schema.js';
import type { AuditLogParams } from '../types.js';

export async function logAudit({
  docId,
  userId,
  participantId,
  action,
  meta = null,
  req = null,
}: AuditLogParams): Promise<void> {
  // ── 클라이언트 IP 추출
  // 1) Express 가 trust proxy 설정 후 X-Forwarded-For 를 파싱해 채워준 req.ip
  //    (가장 신뢰할 만한 경로).
  // 2) nginx 일부 설정은 X-Forwarded-For 대신 X-Real-IP 만 보낸다.
  // 3) 위 둘 다 없으면 원시 소켓 주소(= 프록시 IP) 로 폴백.
  // IPv4-mapped IPv6 ("::ffff:1.2.3.4") 는 IPv4 표기로 정규화한다.
  const normalize = (ip?: string | null): string | null => {
    if (!ip) return null;
    const trimmed = ip.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
    return trimmed;
  };
  const xri = req?.headers?.['x-real-ip'];
  const ip = req
    ? (normalize(req.ip) ??
       normalize(typeof xri === 'string' ? xri : Array.isArray(xri) ? xri[0] : undefined) ??
       normalize((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]) ??
       normalize(req.socket?.remoteAddress) ??
       null)
    : null;
  const uaRaw = req?.headers?.['user-agent'];
  const user_agent =
    typeof uaRaw === 'string'
      ? uaRaw
      : Array.isArray(uaRaw)
        ? (uaRaw[0] ?? null)
        : null;

  try {
    await db.insert(auditLogs).values({
      document_id: docId ?? null,
      user_id: userId ?? null,
      participant_id: participantId ?? null,
      action,
      meta: meta ?? null,
      ip,
      user_agent,
    });
  } catch (err) {
    console.error('Audit log error:', (err as Error).message);
  }
}
