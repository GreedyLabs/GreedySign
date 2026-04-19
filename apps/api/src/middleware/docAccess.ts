import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import { documents, documentParticipants } from '../db/schema.js';

/**
 * 문서 접근 권한 확인: 소유자 또는 accepted 참여자만 허용.
 */
export async function requireDocAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const docId = (req.params.id ?? req.params.docId) as string;
  const userId = req.user.id;
  try {
    const result = await db.execute(sql`
      SELECT 1 FROM documents WHERE id = ${docId}::uuid AND owner_id = ${userId}::uuid
      UNION ALL
      SELECT 1 FROM document_participants
      WHERE document_id = ${docId}::uuid AND user_id = ${userId}::uuid AND invite_status = 'accepted'
      LIMIT 1
    `);
    if (!result.rows.length) {
      res.status(403).json({ error: '접근 권한이 없습니다' });
      return;
    }
    next();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/**
 * 문서 소유자만 허용.
 */
export async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const docId = (req.params.id ?? req.params.docId) as string;
  const userId = req.user.id;
  try {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, docId), eq(documents.owner_id, userId)));
    if (!doc) {
      res.status(403).json({ error: '문서 소유자만 가능합니다' });
      return;
    }
    next();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
