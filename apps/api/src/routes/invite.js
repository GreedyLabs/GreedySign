import { Router } from 'express';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';

const router = Router();

// GET /invite/:token — 토큰 정보 조회 (로그인 전 미리보기용)
router.get('/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ds.id, ds.invitee_email, ds.invite_status, d.name AS doc_name, u.name AS owner_name
       FROM document_shares ds
       JOIN documents d ON d.id = ds.document_id
       JOIN users u ON u.id = ds.owner_id
       WHERE ds.invite_token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: '유효하지 않은 초대 링크입니다' });
    if (rows[0].invite_status === 'accepted') return res.status(410).json({ error: '이미 수락된 초대입니다' });

    res.json({
      invitee_email: rows[0].invitee_email,
      doc_name: rows[0].doc_name,
      owner_name: rows[0].owner_name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /invite/:token/accept — 로그인 후 초대 수락 (이메일 엄격 검증)
router.post('/:token/accept', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ds.*, d.id AS document_id
       FROM document_shares ds
       JOIN documents d ON d.id = ds.document_id
       WHERE ds.invite_token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: '유효하지 않은 초대 링크입니다' });

    const share = rows[0];

    if (share.invite_status === 'accepted') return res.status(410).json({ error: '이미 수락된 초대입니다' });

    // 엄격한 이메일 매칭
    if (share.invitee_email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({
        error: `이 초대는 ${share.invitee_email} 계정으로만 수락할 수 있습니다`,
      });
    }

    await query(
      `UPDATE document_shares
       SET invite_status='accepted', responded_at=NOW(), invite_token=NULL
       WHERE id=$1`,
      [share.id]
    );

    await logAudit({ docId: share.document_id, userId: req.user.id, action: 'share_accepted', req });
    res.json({ document_id: share.document_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
