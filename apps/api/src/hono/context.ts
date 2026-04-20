/**
 * Hono 컨텍스트 타입 — Express `Request.user` 확장과 1:1 대응.
 * 인증 미들웨어가 `c.set('user', payload)` 로 넣어주고, 라우트는
 * `c.get('user')` 로 꺼낸다. Hono 의 제네릭 AppEnv 를 라우트마다
 * 주입해서 타입 유실이 없도록 한다.
 */
import type { JwtUser } from '../types.js';

export type AppEnv = {
  Variables: {
    user: JwtUser;
  };
};
