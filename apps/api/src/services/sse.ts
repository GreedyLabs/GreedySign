/**
 * SSE (Server-Sent Events) 허브 — 인메모리 pub/sub.
 *
 * 이 모듈은 전송 계층(Express `res.write` / Hono `streamSSE`) 에 중립이어야
 * 한다. 라우트 핸들러가 실제 소켓에 data 를 내보낼 수 있는 "sink" 콜백을
 * 등록하면, 이 모듈이 가진 Map 이 해당 sink 를 pub 시점에 호출한다.
 *
 * ─ Express 에서는 sink 가 `(data) => res.write(\`data: ${...}\n\n\`)` 였고
 * ─ Hono 에서는 sink 가 큐에 push → streamSSE 콜백이 drain 하며 writeSSE 로
 *   밀어낸다. 이 파일은 어느 쪽이든 모른다.
 */

export type SseSink = (data: unknown) => void;

interface SseClient {
  userId: string;
  sink: SseSink;
}

// 문서별 구독: docId → Set<SseClient>
const rooms = new Map<string, Set<SseClient>>();
// 사용자 전역 구독: userId → Set<SseSink>
const userConnections = new Map<string, Set<SseSink>>();

export function addClient(docId: string, userId: string, sink: SseSink): () => void {
  if (!rooms.has(docId)) rooms.set(docId, new Set());
  const client: SseClient = { userId, sink };
  rooms.get(docId)!.add(client);
  return () => {
    rooms.get(docId)?.delete(client);
    if (rooms.get(docId)?.size === 0) rooms.delete(docId);
  };
}

export function addUserClient(userId: string, sink: SseSink): () => void {
  if (!userConnections.has(userId)) userConnections.set(userId, new Set());
  userConnections.get(userId)!.add(sink);
  return () => {
    userConnections.get(userId)?.delete(sink);
    if (userConnections.get(userId)?.size === 0) userConnections.delete(userId);
  };
}

export function broadcast(docId: string, data: unknown, excludeUserId?: string | null): void {
  const clients = rooms.get(docId);
  if (!clients) return;
  for (const { sink, userId } of clients) {
    if (excludeUserId && userId === excludeUserId) continue;
    try {
      sink(data);
    } catch (err) {
      console.error('[sse broadcast]', (err as Error).message);
    }
  }
}

export function notifyUser(userId: string, data: unknown): void {
  const sinks = userConnections.get(userId);
  if (!sinks) return;
  for (const sink of sinks) {
    try {
      sink(data);
    } catch (err) {
      console.error('[sse notifyUser]', (err as Error).message);
    }
  }
}
