/**
 * /api/signatures — 사용자 서명 라이브러리 (Hono 포팅본)
 * Express 와 동일한 엔드포인트: GET / · POST / · PUT /:id · DELETE /:id
 * body 는 JSON (svg_data, method, thumbnail) 로 이미 base64/text 화 되어 있어
 * multipart 없이 Hono 기본 파서로 처리한다.
 */
import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import {
  CreateSignatureBody,
  UpdateSignatureBody,
} from '@greedylabs/greedysign-shared';
import { db } from '../../db/pool.js';
import { userSignatures } from '../../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../validator.js';
import type { AppEnv } from '../context.js';

const signatures = new Hono<AppEnv>();

signatures.use('*', authMiddleware);

signatures.get('/', async (c) => {
  try {
    const userId = c.get('user').id;
    const rows = await db
      .select()
      .from(userSignatures)
      .where(eq(userSignatures.user_id, userId))
      .orderBy(desc(userSignatures.is_default), desc(userSignatures.created_at));
    return c.json(rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

signatures.post('/', validate('json', CreateSignatureBody), async (c) => {
  try {
    const userId = c.get('user').id;
    const { name, method, svg_data, thumbnail, is_default = false } = c.req.valid('json');

    if (is_default) {
      await db
        .update(userSignatures)
        .set({ is_default: false })
        .where(eq(userSignatures.user_id, userId));
    }
    const [inserted] = await db
      .insert(userSignatures)
      .values({
        user_id: userId,
        name: name ?? '서명',
        method,
        svg_data,
        thumbnail: thumbnail ?? undefined,
        is_default,
      })
      .returning();
    return c.json(inserted);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

signatures.put('/:id', validate('json', UpdateSignatureBody), async (c) => {
  try {
    const userId = c.get('user').id;
    const id = c.req.param('id');
    const { name, method, svg_data, thumbnail } = c.req.valid('json');
    const [updated] = await db
      .update(userSignatures)
      .set({ name: name ?? '서명', method, svg_data, thumbnail: thumbnail ?? undefined })
      .where(and(eq(userSignatures.id, id), eq(userSignatures.user_id, userId)))
      .returning();
    if (!updated) {
      return c.json({ error: '서명을 찾을 수 없습니다' }, 404);
    }
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

signatures.patch('/:id/default', async (c) => {
  try {
    const userId = c.get('user').id;
    const id = c.req.param('id');
    // 1) 같은 유저의 다른 서명들 default 해제
    await db
      .update(userSignatures)
      .set({ is_default: false })
      .where(eq(userSignatures.user_id, userId));
    // 2) 본 서명만 default true. 본인 소유 + 존재 확인.
    const [updated] = await db
      .update(userSignatures)
      .set({ is_default: true })
      .where(and(eq(userSignatures.id, id), eq(userSignatures.user_id, userId)))
      .returning();
    if (!updated) {
      return c.json({ error: '서명을 찾을 수 없습니다' }, 404);
    }
    return c.json(updated);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

signatures.delete('/:id', async (c) => {
  try {
    const userId = c.get('user').id;
    const id = c.req.param('id');
    await db
      .delete(userSignatures)
      .where(and(eq(userSignatures.id, id), eq(userSignatures.user_id, userId)));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default signatures;
