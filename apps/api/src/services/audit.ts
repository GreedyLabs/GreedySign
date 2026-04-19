import { db } from '../db/pool.js';
import { auditLogs } from '../db/schema.js';
import type { AuditLogParams } from '../types.js';

export async function logAudit({
  docId,
  userId,
  participantId,
  action,
  meta = null,
  req = null,
}: AuditLogParams): Promise<void> {
  const ip = req
    ? ((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      null)
    : null;
  const user_agent = req?.headers?.['user-agent'] ?? null;

  try {
    await db.insert(auditLogs).values({
      document_id: docId ?? null,
      user_id: userId ?? null,
      participant_id: participantId ?? null,
      action,
      meta: meta ?? null,
      ip,
      user_agent,
    });
  } catch (err) {
    console.error('Audit log error:', (err as Error).message);
  }
}
