import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and, ilike, or, ne } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /auth/google
router.post('/google', async (req, res) => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: 'credential이 필요합니다' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      res.status(401).json({ error: '구글 인증에 실패했습니다' });
      return;
    }
    const { sub: googleId, email, name, picture } = payload;

    const [user] = await db
      .insert(users)
      .values({ email: email!, name: name!, google_id: googleId, avatar_url: picture })
      .onConflictDoUpdate({
        target: users.email,
        set: { google_id: googleId, avatar_url: picture, name: name! },
      })
      .returning({ id: users.id, email: users.email, name: users.name, avatar_url: users.avatar_url });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
    res.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', (err as Error).message);
    res.status(401).json({ error: '구글 인증에 실패했습니다' });
  }
});

// GET /auth/users/search?q=xxx — 같은 도메인 사용자 자동완성
router.get('/users/search', authMiddleware, async (req, res) => {
  const domain = req.user.email.split('@')[1];
  if (!domain || domain === 'localhost') {
    res.json([]);
    return;
  }
  const q = ((req.query.q as string) || '').toLowerCase();
  if (!q) {
    res.json([]);
    return;
  }
  try {
    const pattern = `%${q}%`;
    const rows = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(
        and(
          sql`${users.email} LIKE ${'%@' + domain}`,
          ne(users.email, req.user.email),
          or(ilike(users.email, pattern), ilike(users.name, pattern))
        )
      )
      .limit(8);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id));

    if (!user) {
      res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
      return;
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: '이름을 입력하세요' });
    return;
  }
  try {
    const [updated] = await db
      .update(users)
      .set({ name: name.trim() })
      .where(eq(users.id, req.user.id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
