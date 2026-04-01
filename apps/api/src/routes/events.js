import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { addUserClient, addClient } from '../services/sse.js';

const router = Router();

// GET /events/user — 사용자별 전역 SSE 연결 (문서 공유 알림 등)
router.get('/user', (req, res) => {
  const user = verifyToken(req.query.token);
  if (!user) return res.status(401).end();

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const remove = addUserClient(user.id, res);
  req.on('close', remove);
});

// GET /events/documents/:docId — 문서별 SSE 연결 (서명 상태 변경 알림)
router.get('/documents/:docId', (req, res, next) => {
  console.log('[documentEvents] token:', req.query.token?.substring(0, 20) + '...');
  const user = verifyToken(req.query.token);
  console.log('[documentEvents] user:', user);
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

  const remove = addClient(req.params.docId, req.user.id, res);
  req.on('close', remove);
});

export default router;
