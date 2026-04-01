import { Router } from 'express';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDocAccess } from '../middleware/docAccess.js';
import { broadcast, notifyUser } from '../services/sse.js';
import { logAudit } from '../services/audit.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// PATCH /status — 내 서명 상태 업데이트
router.patch('/status', requireDocAccess, async (req, res) => {
  const { docId } = req.params;
  const { status } = req.body;
  const userId = req.user.id;
  const userEmail = req.user.email;

  const valid = ['not_started', 'in_progress', 'completed'];
  if (!valid.includes(status)) return res.status(400).json({ error: '유효하지 않은 상태값입니다' });

  try {
    const completedAt = status === 'completed' ? new Date() : null;

    // 소유자 여부를 이메일로 확인
    const { rows: ownerCheck } = await query(
      `SELECT 1 FROM documents d JOIN users u ON u.id = d.owner_id
       WHERE d.id=$1 AND u.email=$2`,
      [docId, userEmail]
    );

    if (ownerCheck.length) {
      broadcast(docId, { type: 'signing_status_changed', userId, status }, userId);
      if (status === 'completed') {
        await logAudit({ docId, userId, action: 'signing_completed', meta: { role: 'owner' }, req });
      } else if (status === 'in_progress') {
        await logAudit({ docId, userId, action: 'signing_started', meta: { role: 'owner' }, req });
      }
      return res.json({ status });
    }

    const { rows } = await query(
      `UPDATE document_shares
       SET signing_status=$1, completed_at=$2
       WHERE document_id=$3 AND invitee_email=$4 AND invite_status='accepted'
       RETURNING *`,
      [status, completedAt, docId, userEmail]
    );
    if (!rows.length) return res.status(403).json({ error: '접근 권한이 없습니다' });

    broadcast(docId, { type: 'signing_status_changed', userId, status }, userId);

    // 문서 소유자에게 실시간 알림 전송 (Dashboard 갱신용)
    notifyUser(rows[0].owner_id, {
      type: 'signing_status_changed',
      document_id: docId,
    });

    if (status === 'completed') {
      await logAudit({ docId, userId, action: 'signing_completed', meta: { role: 'invitee' }, req });
    } else if (status === 'in_progress') {
      await logAudit({ docId, userId, action: 'signing_started', meta: { role: 'invitee' }, req });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
