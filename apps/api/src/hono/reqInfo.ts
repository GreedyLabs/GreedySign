/**
 * Hono Context → ReqInfo 어댑터.
 * `services/audit.ts` 의 `logAudit({ req })` 가 기대하는 최소 필드
 * (`ip`/`headers`/`socket`) 만 채워 넘긴다. Express 가 제거된 뒤에도 같은
 * 서비스를 그대로 쓸 수 있게 하는 얇은 구조적 호환 래퍼.
 *
 * 뽑아내는 필드
 *  - ip:   X-Forwarded-For 의 첫 토큰 → X-Real-IP (직접 파싱)
 *  - headers: Fetch Headers → 소문자 key 객체
 *  - socket: undefined (Hono 는 연결 소켓을 노출하지 않음. 값이 없으면
 *    `services/audit.ts` 가 XFF/XRI 헤더 폴백으로 IP 를 뽑는다.)
 *
 * 함수 이름은 이관 이력을 보존하기 위해 유지 — 내부적으로 Express 타입은
 * 더 이상 관여하지 않는다.
 */
import type { Context } from 'hono';
import type { ReqInfo } from '../types.js';

export function expressReqLike(c: Context): ReqInfo {
  const headersObj: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headersObj[key] = value;
  });

  const xff = headersObj['x-forwarded-for'];
  const firstXff = typeof xff === 'string' ? xff.split(',')[0]?.trim() : undefined;
  const ip = firstXff || headersObj['x-real-ip'] || '';

  return {
    ip,
    headers: headersObj,
    socket: undefined,
  };
}
