/**
 * API 엔트리 — Hono + @hono/node-server 단독 실행.
 *
 * Express 는 Phase 6 에서 제거됐다. 모든 라우트가 Hono 이며, CORS 는
 * Hono 미들웨어(`hono/cors`), SSE 는 `hono/streaming` 의 `streamSSE` 를 쓴다.
 *
 * 리버스 프록시(nginx 등) 뒤에서 실제 클라이언트 IP 를 얻으려면 프록시
 * 레벨에서 `X-Forwarded-For` 를 설정하고, 애플리케이션은 `services/audit.ts`
 * 의 `reqInfo` 에서 해당 헤더를 읽는다. Node 런타임에 `trust proxy` 개념이
 * 없으므로 Express 시절의 `app.set('trust proxy')` 는 불필요하다.
 */
import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './hono/app.js';

const PORT = Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api:ready] Server running on http://localhost:${info.port}`);
});
