/**
 * Hono 인증 미들웨어 — Bearer JWT 를 검증하고 `c.set('user', ...)` 로
 * 다운스트림 라우트에 유저를 전달한다.
 *
 * `verifyToken` 은 SSE 핸들러처럼 쿼리스트링 토큰(EventSource 는 헤더를
 * 못 보내므로 `?token=...` 으로 전달) 을 검증하는 경로에서 재사용된다.
 */
import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';
import type { AppEnv } from '../context.js';
import type { JwtUser } from '../../types.js';

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as JwtUser;
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

export function verifyToken(token: string | undefined | null): JwtUser | null {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as JwtUser;
  } catch {
    return null;
  }
}
