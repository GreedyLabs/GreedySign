/**
 * Hono 앱 — 모든 API 라우트를 등록한다. Express 는 완전히 제거됐다.
 *
 * 라우트
 *   /search, /notifications, /activity, /signatures, /auth, /invite
 *   /documents (+ /:docId/participants, /fields, /signing, /export, /certificate)
 *   /templates, /campaigns
 *   /events (SSE — streamSSE 기반)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import search from './routes/search.js';
import notifications from './routes/notifications.js';
import activity from './routes/activity.js';
import signatures from './routes/signatures.js';
import auth from './routes/auth.js';
import invite from './routes/invite.js';
import documents from './routes/documents.js';
import participants from './routes/participants.js';
import fields from './routes/fields.js';
import signing from './routes/signing.js';
import exportRoute from './routes/export.js';
import certificate from './routes/certificate.js';
import templates from './routes/templates.js';
import campaigns from './routes/campaigns.js';
import events from './routes/events.js';
import type { AppEnv } from './context.js';

const app = new Hono<AppEnv>();

// ── 전역 미들웨어 ──────────────────────────────────────────────────────────
// 요청 로깅: 메서드/경로/상태/지속시간을 한 줄로 기록. 프로덕션도 그대로 둬
// 컨테이너 stdout → LB 로그로 흘려 넣는다. 필요 시 ENV 로 끌 수 있다.
if (process.env.DISABLE_REQUEST_LOG !== '1') {
  app.use('*', logger());
}

// 보안 헤더: X-Content-Type-Options/X-Frame-Options/Referrer-Policy 등 기본값.
// CSP 는 프론트 인라인 스타일·스크립트 감사 전까지는 끈다 — 한 번에 하나씩
// 원칙.
app.use(
  '*',
  secureHeaders({
    // CSP 는 프론트 인라인 스타일·스크립트 감사 전까지 의도적으로 미설정.
    // 기본 보안 헤더(X-Content-Type-Options/X-Frame-Options/Referrer-Policy 등)만 추가.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: 'same-site',
    // Google OAuth (GIS) 팝업은 accounts.google.com → 우리 창으로 window.postMessage
    // 를 던져 credential 을 전달한다. 기본값 `same-origin` 은 이 postMessage 를
    // 차단해 로그인이 실패하고 `Cross-Origin-Opener-Policy policy would block
    // the window.postMessage call.` 경고를 남긴다. 팝업-오프너 통신을 허용하는
    // `same-origin-allow-popups` 로 완화해 OAuth 플로우를 되돌린다.
    crossOriginOpenerPolicy: 'same-origin-allow-popups',
  })
);

// 전역 CORS — Express 시절 `cors({ origin: process.env.APP_URL || '*' })` 와 동일 정책.
app.use(
  '*',
  cors({
    origin: process.env.APP_URL || '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition'],
  })
);

// /health — LB/헬스체크. `/api` 밖이어야 하므로 basePath 전에 장착.
app.get('/health', (c) => c.json({ ok: true }));

const api = new Hono<AppEnv>();

api.route('/search', search);
api.route('/notifications', notifications);
api.route('/activity', activity);
api.route('/signatures', signatures);
api.route('/auth', auth);
api.route('/invite', invite);

// 문서 하위 라우트(세부 경로) 를 먼저 등록 — Hono 가 더 구체적인 매치부터
// 탐색하지만 안전하게 순서를 고정한다.
api.route('/documents/:docId/participants', participants);
api.route('/documents/:docId/fields', fields);
api.route('/documents/:docId/signing', signing);
api.route('/documents/:docId/export', exportRoute);
api.route('/documents/:docId/certificate', certificate);

// 문서 루트 CRUD + 업로드 + 발송/무효화/삭제
api.route('/documents', documents);

// 템플릿 + 캠페인
api.route('/templates', templates);
api.route('/campaigns', campaigns);

// SSE 이벤트 스트림
api.route('/events', events);

app.route('/api', api);

// ── 전역 에러/404 핸들러 ───────────────────────────────────────────────────
// 기존 라우트의 `c.json({ error: ... }, 4XX)` 형식을 그대로 유지한다 — URL
// contract (status + JSON shape) 불변.
app.onError((err, c) => {
  // HTTPException 은 라이브러리가 만든 응답을 그대로 사용한다 (상태 + body).
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  // 예기치 못한 에러는 500. 운영 스택 추적은 stderr 로, 클라이언트에는
  // 메시지만 노출한다(민감 정보 가리기).
  console.error('[api:onError]', err);
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : (err as Error).message || 'Internal Server Error';
  return c.json({ error: message }, 500);
});

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

/**
 * Hono RPC 타입 export (F-5).
 *
 * `hono/client` 의 `hc<AppType>('/api')` 가 이 타입을 consume 해 엔드포인트
 * 트리를 정적 타입으로 노출한다. 현재 프론트(apps/web)는 JSX 라 `hc` 를 쓰면
 * autocomplete 이득이 없어 도입하지 않았지만, TypeScript 전환 시점에
 * `services/api.js` 를 `rpc = hc<AppType>(...)` 로 단 한 번에 교체할 수 있도록
 * 서버 쪽 타입 경로만 먼저 열어 둔다.
 */
export type AppType = typeof app;
export default app;
