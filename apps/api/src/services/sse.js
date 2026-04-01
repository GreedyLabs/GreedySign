// SSE 클라이언트 관리: docId → Set of { res, userId }
const rooms = new Map();
// 사용자별 SSE 클라이언트: userId → Set of res
const userConnections = new Map();

export function addClient(docId, userId, res) {
  if (!rooms.has(docId)) rooms.set(docId, new Set());
  const client = { userId, res };
  rooms.get(docId).add(client);
  return () => {
    rooms.get(docId)?.delete(client);
    if (rooms.get(docId)?.size === 0) rooms.delete(docId);
  };
}

export function addUserClient(userId, res) {
  if (!userConnections.has(userId)) userConnections.set(userId, new Set());
  userConnections.get(userId).add(res);
  return () => {
    userConnections.get(userId)?.delete(res);
    if (userConnections.get(userId)?.size === 0) userConnections.delete(userId);
  };
}

export function broadcast(docId, data, excludeUserId = null) {
  const clients = rooms.get(docId);
  if (!clients) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const { res, userId } of clients) {
    if (excludeUserId && userId === excludeUserId) continue;
    res.write(msg);
  }
}

export function notifyUser(userId, data) {
  const clients = userConnections.get(userId);
  if (!clients) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(msg);
  }
}
