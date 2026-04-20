/**
 * /api/search — 통합 검색 (Hono 포팅본)
 * 응답 JSON 스키마는 Express 버전과 완전 동일 — 프론트 무수정 보장.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { SearchQuery } from '@greedylabs/greedysign-shared';
import { db } from '../../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../validator.js';
import type { AppEnv } from '../context.js';

const search = new Hono<AppEnv>();

search.use('*', authMiddleware);

search.get('/', validate('query', SearchQuery), async (c) => {
  const q = c.req.valid('query').q ?? '';
  if (!q) {
    return c.json({ documents: [], participants: [] });
  }

  const userId = c.get('user').id;
  const pattern = `%${q}%`;

  try {
    const [docResult, partResult] = await Promise.all([
      db.execute(sql`
        SELECT DISTINCT
          d.id, d.name, d.status, d.signing_mode,
          d.created_at, d.updated_at, d.completed_at,
          (d.owner_id = ${userId}::uuid) AS is_owner,
          p.role, p.signing_status AS my_signing_status,
          p.invite_status,
          u.name AS owner_name
        FROM documents d
        JOIN users u ON u.id = d.owner_id
        LEFT JOIN document_participants p ON p.document_id = d.id AND p.user_id = ${userId}::uuid
        WHERE (d.owner_id = ${userId}::uuid OR p.invite_status IN ('pending','accepted','declined'))
          AND d.name ILIKE ${pattern}
        ORDER BY d.updated_at DESC
        LIMIT 20
      `),
      db.execute(sql`
        SELECT DISTINCT
          dp.id AS participant_id,
          COALESCE(u2.name, dp.name, dp.email) AS participant_name,
          dp.email AS participant_email,
          dp.role, dp.signing_status, dp.invite_status,
          d.id AS document_id, d.name AS document_name, d.status AS document_status,
          (d.owner_id = ${userId}::uuid) AS is_owner
        FROM document_participants dp
        JOIN documents d ON d.id = dp.document_id
        LEFT JOIN users u2 ON u2.id = dp.user_id
        LEFT JOIN document_participants my_part ON my_part.document_id = d.id AND my_part.user_id = ${userId}::uuid
        WHERE (d.owner_id = ${userId}::uuid OR my_part.invite_status IN ('pending','accepted','declined'))
          AND (dp.email ILIKE ${pattern} OR dp.name ILIKE ${pattern} OR u2.name ILIKE ${pattern})
          AND dp.user_id IS DISTINCT FROM ${userId}::uuid
        ORDER BY d.updated_at DESC
        LIMIT 20
      `),
    ]);

    return c.json({
      documents: docResult.rows,
      participants: partResult.rows,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default search;
