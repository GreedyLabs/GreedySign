import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /auth/google — Google id_token 검증 후 JWT 발급
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'credential이 필요합니다' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { sub: googleId, email, name, picture } = ticket.getPayload();

    // 이미 가입된 사용자면 조회, 없으면 자동 가입
    const { rows } = await query(
      `INSERT INTO users (email, name, google_id, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET google_id = EXCLUDED.google_id,
             avatar_url = EXCLUDED.avatar_url,
             name = EXCLUDED.name
       RETURNING id, email, name, avatar_url`,
      [email, name, googleId, picture]
    );
    const user = rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: '구글 인증에 실패했습니다' });
  }
});

// GET /auth/users/search?q=xxx — 같은 도메인 사용자 검색
router.get('/users/search', authMiddleware, async (req, res) => {
  const domain = req.user.email.split('@')[1];
  if (domain === 'localhost') return res.json([]);
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json([]);
  try {
    const { rows } = await query(
      `SELECT email, name FROM users
       WHERE email LIKE $1 AND email != $2
         AND (LOWER(email) LIKE $3 OR LOWER(name) LIKE $3)
       ORDER BY name LIMIT 8`,
      [`%@${domain}`, req.user.email, `%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/me — 토큰으로 현재 사용자 조회
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, avatar_url, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
