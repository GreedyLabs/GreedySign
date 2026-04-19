import type { Response } from 'express';

interface SseClient {
  userId: string;
  res: Response;
}

// SSE 클라이언트 관리: docId → Set of SseClient
const rooms = new Map<string, Set<SseClient>>();
// 사용자별 SSE 클라이언트: userId → Set<Response>
const userConnections = new Map<string, Set<Response>>();

export function addClient(docId: string, userId: string, res: Response): () => void {
  if (!rooms.has(docId)) rooms.set(docId, new Set());
  const client: SseClient = { userId, res };
  rooms.get(docId)!.add(client);
  return () => {
    rooms.get(docId)?.delete(client);
    if (rooms.get(docId)?.size === 0) rooms.delete(docId);
  };
}

export function addUserClient(userId: string, res: Response): () => void {
  if (!userConnections.has(userId)) userConnections.set(userId, new Set());
  userConnections.get(userId)!.add(res);
  return () => {
    userConnections.get(userId)?.delete(res);
    if (userConnections.get(userId)?.size === 0) userConnections.delete(userId);
  };
}

export function broadcast(docId: string, data: unknown, excludeUserId?: string | null): void {
  const clients = rooms.get(docId);
  if (!clients) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const { res, userId } of clients) {
    if (excludeUserId && userId === excludeUserId) continue;
    res.write(msg);
  }
}

export function notifyUser(userId: string, data: unknown): void {
  const clients = userConnections.get(userId);
  if (!clients) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(msg);
  }
}
