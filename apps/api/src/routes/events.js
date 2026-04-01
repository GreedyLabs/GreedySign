import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { addClient } from '../services/sse.js';

const router = Router();

// GET /documents/:id/events — SSE 연결 (서명 상태 변경 알림)
// authMiddleware는 여기서 쿼리스트링 토큰으로 직접 처리 (EventSource는 헤더 전송 불가)
router.get('/:id', (req, res, next) => {
  const user = verifyToken(req.query.token);
  if (!user) return res.status(401).end();
  req.user = user;
  next();
}, requireDocAccess, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const remove = addClient(req.params.id, req.user.id, res);
  req.on('close', remove);
});

export default router;
