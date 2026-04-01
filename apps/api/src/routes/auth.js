import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

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

// GET /auth/me — 토큰으로 현재 사용자 조회
router.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    const { rows } = await query(
      'SELECT id, email, name, avatar_url, created_at FROM users WHERE id=$1',
      [payload.id]
    );
    if (!rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
    res.json(rows[0]);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
