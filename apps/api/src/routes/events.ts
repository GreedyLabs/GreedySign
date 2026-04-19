import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { addUserClient, addClient } from '../services/sse.js';

const router = Router();

router.get('/user', (req, res) => {
  const user = verifyToken(req.query.token as string);
  if (!user) {
    res.status(401).end();
    return;
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const remove = addUserClient(user.id, res);
  req.on('close', remove);
});

router.get(
  '/documents/:docId',
  (req, res, next) => {
    const user = verifyToken(req.query.token as string);
    if (!user) {
      res.status(401).end();
      return;
    }
    req.user = user;
    next();
  },
  requireDocAccess,
  (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const remove = addClient(req.params.docId!, req.user.id, res);
    req.on('close', remove);
  }
);

export default router;
