/**
 * /api/events — SSE 이벤트 스트림 (Hono 포팅본)
 *
 * Express 는 `res.write('data: ...\n\n')` 로 수동으로 SSE 프레임을 내보냈다.
 * Hono 는 `streamSSE` 헬퍼로 고수준 스트림 핸들러를 제공한다.
 *
 * EventSource 브라우저 API 는 커스텀 Authorization 헤더를 못 넣으므로
 * 토큰은 `?token=...` 쿼리스트링으로 받는다 — Express 구현과 동일.
 *
 * ─ 내부 구조 ─
 *  1. 요청이 들어오면 JWT 검증 → `services/sse.ts` 에 "sink" 콜백 등록
 *  2. sink 는 로컬 큐에 이벤트를 push 하고 대기 중인 Promise 를 깨운다
 *  3. streamSSE 콜백은 루프 돌며 큐를 drain → `writeSSE({data})` 로 송신
 *  4. 연결 종료 시 remove() 로 허브에서 sink 를 제거
 */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sql } from 'drizzle-orm';
import { db } from '../../db/pool.js';
import { addUserClient, addClient, type SseSink } from '../../services/sse.js';
import { verifyToken } from '../middleware/auth.js';
import type { AppEnv } from '../context.js';

const events = new Hono<AppEnv>();

// 스트림 헬퍼 — 큐/대기 Promise 결합.
function createQueue(): {
  sink: SseSink;
  take: () => Promise<unknown>;
  drain: () => unknown[];
  wake: () => void;
} {
  const queue: unknown[] = [];
  let resolver: (() => void) | null = null;

  const sink: SseSink = (data) => {
    queue.push(data);
    if (resolver) {
      const r = resolver;
      resolver = null;
      r();
    }
  };

  const wake = () => {
    if (resolver) {
      const r = resolver;
      resolver = null;
      r();
    }
  };

  const take = () =>
    new Promise<unknown>((res) => {
      if (queue.length) {
        res(queue.shift());
        return;
      }
      resolver = () => {
        if (queue.length) res(queue.shift());
        else res(undefined);
      };
    });

  const drain = () => {
    const items = queue.splice(0);
    return items;
  };

  return { sink, take, drain, wake };
}

events.get('/user', async (c) => {
  const token = c.req.query('token');
  const user = verifyToken(token);
  if (!user) return c.body(null, 401);

  return streamSSE(c, async (stream) => {
    const { sink, take, wake } = createQueue();
    const remove = addUserClient(user.id, sink);

    stream.onAbort(() => {
      remove();
      wake();
    });

    try {
      while (!stream.aborted) {
        const data = await take();
        if (stream.aborted) break;
        if (data === undefined) continue;
        await stream.writeSSE({ data: JSON.stringify(data) });
      }
    } finally {
      remove();
    }
  });
});

events.get('/documents/:docId', async (c) => {
  const token = c.req.query('token');
  const user = verifyToken(token);
  if (!user) return c.body(null, 401);

  const docId = c.req.param('docId');

  // EventSource 는 헤더 기반 미들웨어(`authMiddleware`/`requireDocAccess`)를
  // 재사용하기가 까다로우므로 여기서 접근권을 직접 확인한다.
  // 정책은 `middleware/docAccess.ts` 의 `requireDocAccess` 와 동일.
  try {
    const check = await db.execute(sql`
      SELECT 1 FROM documents WHERE id = ${docId}::uuid AND owner_id = ${user.id}::uuid
      UNION ALL
      SELECT 1 FROM document_participants
      WHERE document_id = ${docId}::uuid AND user_id = ${user.id}::uuid AND invite_status = 'accepted'
      LIMIT 1
    `);
    if (!check.rows.length) return c.body(null, 403);
  } catch {
    return c.body(null, 500);
  }

  return streamSSE(c, async (stream) => {
    const { sink, take, wake } = createQueue();
    const remove = addClient(docId, user.id, sink);

    stream.onAbort(() => {
      remove();
      wake();
    });

    try {
      while (!stream.aborted) {
        const data = await take();
        if (stream.aborted) break;
        if (data === undefined) continue;
        await stream.writeSSE({ data: JSON.stringify(data) });
      }
    } finally {
      remove();
    }
  });
});

export default events;
