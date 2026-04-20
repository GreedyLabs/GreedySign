/**
 * Hono 용 문서 접근 미들웨어 — Express `requireDocAccess`/`requireOwner` 와
 * 응답/상태코드 정책 동일. 라우트 파라미터는 `:docId` 로 통일
 * (Express 는 `:id | :docId` 두 곳을 커버했지만, Hono 쪽 라우트는 전부
 * `/documents/:docId/...` 로만 마운트하므로 단일 키로 충분).
 */
import { createMiddleware } from 'hono/factory';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '../../db/pool.js';
import { documents } from '../../db/schema.js';
import type { AppEnv } from '../context.js';

function getDocId(c: { req: { param: (k: string) => string | undefined } }): string | undefined {
  return c.req.param('docId') ?? c.req.param('id');
}

export const requireDocAccess = createMiddleware<AppEnv>(async (c, next) => {
  const docId = getDocId(c);
  if (!docId) return c.json({ error: 'docId가 필요합니다' }, 400);
  const userId = c.get('user').id;
  try {
    const result = await db.execute(sql`
      SELECT 1 FROM documents WHERE id = ${docId}::uuid AND owner_id = ${userId}::uuid
      UNION ALL
      SELECT 1 FROM document_participants
      WHERE document_id = ${docId}::uuid AND user_id = ${userId}::uuid AND invite_status = 'accepted'
      LIMIT 1
    `);
    if (!result.rows.length) {
      return c.json({ error: '접근 권한이 없습니다' }, 403);
    }
    await next();
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  const docId = getDocId(c);
  if (!docId) return c.json({ error: 'docId가 필요합니다' }, 400);
  const userId = c.get('user').id;
  try {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, docId), eq(documents.owner_id, userId)));
    if (!doc) {
      return c.json({ error: '문서 소유자만 가능합니다' }, 403);
    }
    await next();
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});
