/**
 * /api/auth — 인증 (Hono 포팅본)
 *  - POST /google        : 비인증 — Google ID 토큰 검증 + JWT 발급
 *  - GET  /users/search  : 인증 — 같은 도메인 사용자 자동완성
 *  - GET  /me            : 인증 — 내 정보
 *  - PUT  /profile       : 인증 — 이름 변경
 *
 * authMiddleware 는 엔드포인트별로 명시 적용 (Google 로그인은 비인증이어야 함).
 */
import { Hono } from 'hono';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { sql, eq, and, ilike, or, ne } from 'drizzle-orm';
import {
  GoogleLoginBody,
  UpdateProfileBody,
  UsersSearchQuery,
} from '@greedylabs/greedysign-shared';
import { db } from '../../db/pool.js';
import { users } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../validator.js';
import type { AppEnv } from '../context.js';

const auth = new Hono<AppEnv>();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

auth.post('/google', validate('json', GoogleLoginBody), async (c) => {
  const { credential } = c.req.valid('json');
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      return c.json({ error: '구글 인증에 실패했습니다' }, 401);
    }
    const { sub: googleId, email, name, picture } = payload;

    const [user] = await db
      .insert(users)
      .values({ email: email!, name: name!, google_id: googleId, avatar_url: picture })
      .onConflictDoUpdate({
        target: users.email,
        set: { google_id: googleId, avatar_url: picture, name: name! },
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        avatar_url: users.avatar_url,
      });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
    return c.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', (err as Error).message);
    return c.json({ error: '구글 인증에 실패했습니다' }, 401);
  }
});

auth.get('/users/search', authMiddleware, validate('query', UsersSearchQuery), async (c) => {
  const me = c.get('user');
  const domain = me.email.split('@')[1];
  if (!domain || domain === 'localhost') return c.json([]);
  const { q: rawQ } = c.req.valid('query');
  const q = (rawQ ?? '').toLowerCase();
  if (!q) return c.json([]);
  try {
    const pattern = `%${q}%`;
    const rows = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(
        and(
          sql`${users.email} LIKE ${'%@' + domain}`,
          ne(users.email, me.email),
          or(ilike(users.email, pattern), ilike(users.name, pattern))
        )
      )
      .limit(8);
    return c.json(rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

auth.get('/me', authMiddleware, async (c) => {
  try {
    const me = c.get('user');
    const [user] = await db.select().from(users).where(eq(users.id, me.id));
    if (!user) return c.json({ error: '사용자를 찾을 수 없습니다' }, 404);
    return c.json(user);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

auth.put('/profile', authMiddleware, validate('json', UpdateProfileBody), async (c) => {
  try {
    const me = c.get('user');
    const { name } = c.req.valid('json');
    const [updated] = await db
      .update(users)
      .set({ name })
      .where(eq(users.id, me.id))
      .returning();
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default auth;
