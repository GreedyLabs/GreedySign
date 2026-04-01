// SSE 클라이언트 관리: docId → Set of { res, userId }
const rooms = new Map();

export function addClient(docId, userId, res) {
  if (!rooms.has(docId)) rooms.set(docId, new Set());
  const client = { userId, res };
  rooms.get(docId).add(client);
  return () => {
    rooms.get(docId)?.delete(client);
    if (rooms.get(docId)?.size === 0) rooms.delete(docId);
  };
}

export function broadcast(docId, data) {
  const clients = rooms.get(docId);
  if (!clients) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const { res } of clients) {
    res.write(msg);
  }
}
