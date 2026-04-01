import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireOwner } from '../middleware/docAccess.js';
import { logAudit } from '../services/audit.js';
import { sendInviteEmail } from '../services/email.js';
import { notifyUser } from '../services/sse.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// GET / — 공유 목록 + 서명 현황 (소유자만)
router.get('/', requireOwner, async (req, res) => {
  const { docId } = req.params;
  try {
    const { rows } = await query(
      `SELECT
        ds.id AS share_id,
        ds.invitee_id,
        COALESCE(u.name, ds.invitee_email) AS invitee_name,
        COALESCE(u.email, ds.invitee_email) AS invitee_email,
        ds.invite_status,
        ds.signing_status,
        ds.invited_at,
        ds.completed_at,
        COUNT(sp.id)::int AS placement_count
       FROM document_shares ds
       LEFT JOIN users u ON u.id = ds.invitee_id
       LEFT JOIN signature_placements sp ON sp.document_id = ds.document_id AND sp.user_id = ds.invitee_id
       WHERE ds.document_id = $1
       GROUP BY ds.id, u.name, u.email
       ORDER BY ds.invited_at`,
      [req.params.docId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — 서명자 초대 (미가입자도 가능)
router.post('/', requireOwner, async (req, res) => {
  const { docId } = req.params;
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: '이메일을 입력하세요' });
  if (email === req.user.email) return res.status(400).json({ error: '자신을 초대할 수 없습니다' });

  try {
    // 문서 정보 조회 (이메일 본문용)
    const { rows: docs } = await query('SELECT name FROM documents WHERE id=$1', [docId]);
    if (!docs.length) return res.status(404).json({ error: '문서를 찾을 수 없습니다' });

    // 가입 여부 확인 (있으면 invitee_id 연결, 없으면 null)
    const { rows: existing } = await query('SELECT id FROM users WHERE email=$1', [email]);
    const inviteeId = existing.length ? existing[0].id : null;

    const token = randomUUID();

    const { rows } = await query(
      `INSERT INTO document_shares (document_id, owner_id, invitee_id, invitee_email, invite_token)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (document_id, invitee_email) DO UPDATE
         SET invite_status='pending', signing_status='not_started', responded_at=NULL,
             invited_at=NOW(), invite_token=$5,
             invitee_id=COALESCE(EXCLUDED.invitee_id, document_shares.invitee_id)
       RETURNING *`,
      [docId, req.user.id, inviteeId, email, token]
    );

    // 이메일 발송 (실패해도 초대 자체는 성공 처리)
    sendInviteEmail({
      toEmail: email,
      inviterName: req.user.name,
      docName: docs[0].name,
      token: rows[0].invite_token,
    }).catch(err => console.error('SES send error:', err.message));

    await logAudit({ docId, userId: req.user.id, action: 'share_invited', meta: { invitee_email: email }, req });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:shareId — 초대 취소
router.delete('/:shareId', requireOwner, async (req, res) => {
  const { docId } = req.params;
  try {
    // 삭제 전에 초대받은 사용자 정보 조회
    const { rows: shareInfo } = await query(
      'SELECT invitee_id, document_id FROM document_shares WHERE id=$1 AND document_id=$2',
      [req.params.shareId, req.params.docId]
    );

    const { rowCount } = await query(
      'DELETE FROM document_shares WHERE id=$1 AND document_id=$2',
      [req.params.shareId, req.params.docId]
    );
    if (!rowCount) return res.status(404).json({ error: '초대를 찾을 수 없습니다' });

    // 피초대자에게 실시간 알림 전송 (가입된 사용자인 경우에만)
    if (shareInfo.length && shareInfo[0].invitee_id) {
      notifyUser(shareInfo[0].invitee_id, {
        type: 'share_revoked',
        document_id: shareInfo[0].document_id,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /accept — 초대 수락
router.patch('/accept', async (req, res) => {
  const { docId } = req.params;
  try {
    const { rows } = await query(
      `UPDATE document_shares
       SET invite_status='accepted', responded_at=NOW(),
           invitee_id=COALESCE(invitee_id, $3)
       WHERE document_id=$1 AND invitee_email=$2
       RETURNING *`,
      [req.params.docId, req.user.email, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: '초대를 찾을 수 없습니다' });
    await logAudit({ docId: req.params.docId, userId: req.user.id, action: 'share_accepted', req });

    // 사용자에게 실시간 알림 전송 (문서 목록 갱신용)
    notifyUser(req.user.id, {
      type: 'document_shared',
      document_id: req.params.docId,
    });

    // 문서 소유자에게 실시간 알림 전송 (ShareModal 갱신용)
    notifyUser(rows[0].owner_id, {
      type: 'share_status_changed',
      document_id: req.params.docId,
    });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /decline — 초대 거절
router.patch('/decline', async (req, res) => {
  const { docId } = req.params;
  try {
    const { rows } = await query(
      `UPDATE document_shares SET invite_status='declined', responded_at=NOW()
       WHERE document_id=$1 AND invitee_email=$2
       RETURNING *`,
      [req.params.docId, req.user.email]
    );
    if (!rows.length) return res.status(404).json({ error: '초대를 찾을 수 없습니다' });

    // 문서 소유자에게 실시간 알림 전송 (ShareModal 갱신용)
    notifyUser(rows[0].owner_id, {
      type: 'share_status_changed',
      document_id: req.params.docId,
    });
    await logAudit({ docId: req.params.docId, userId: req.user.id, action: 'share_declined', req });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
