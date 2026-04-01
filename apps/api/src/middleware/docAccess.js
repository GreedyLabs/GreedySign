import { query } from '../db/pool.js';

export async function requireDocAccess(req, res, next) {
  const docId = req.params.id ?? req.params.docId;
  const userEmail = req.user.email;
  try {
    const { rows } = await query(
      `SELECT 1 FROM documents d
       JOIN users u ON u.id = d.owner_id
       WHERE d.id = $1 AND u.email = $2
       UNION ALL
       SELECT 1 FROM document_shares
       WHERE document_id = $1 AND invitee_email = $2 AND invite_status = 'accepted'`,
      [docId, userEmail]
    );
    if (!rows.length) return res.status(403).json({ error: '접근 권한이 없습니다' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function requireOwner(req, res, next) {
  const docId = req.params.id ?? req.params.docId;
  const userEmail = req.user.email;
  try {
    const { rows } = await query(
      `SELECT 1 FROM documents d
       JOIN users u ON u.id = d.owner_id
       WHERE d.id = $1 AND u.email = $2`,
      [docId, userEmail]
    );
    if (!rows.length) return res.status(403).json({ error: '권한이 없습니다' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
