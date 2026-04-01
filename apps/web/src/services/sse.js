let eventSource = null;

export function connectSSE(docId, onEvent) {
  disconnectSSE();
  const token = localStorage.getItem('token');
  // SSE는 헤더 전송 불가 → token을 쿼리스트링으로 전달
  eventSource = new EventSource(`/api/events/${docId}?token=${encodeURIComponent(token)}`);
  eventSource.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch {}
  };
}

export function disconnectSSE() {
  if (eventSource) { eventSource.close(); eventSource = null; }
}
