/**
 * DB 초기화 / 마이그레이션 실행 스크립트
 *
 * 사용법:
 *   pnpm db:init        → 마이그레이션 적용 (초기 배포 / 스키마 변경 시)
 *   pnpm db:generate    → schema.ts 변경 후 SQL 마이그레이션 파일 생성
 *   pnpm db:push        → 개발 중 마이그레이션 파일 없이 직접 반영 (dev only)
 *
 * 마이그레이션 파일은 idempotent하게 작성되어 있어 (CREATE ... IF NOT EXISTS
 * 등) 기존 DB에 재적용해도 안전합니다.
 */
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// pg 드라이버가 감싼 원본 에러를 모두 풀어 보여준다.
function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const e = current as {
      message?: string;
      code?: string;
      detail?: string;
      hint?: string;
      where?: string;
      cause?: unknown;
    };
    const line = [
      e.code ? `[${e.code}]` : null,
      e.message ?? String(current),
      e.detail ? `detail=${e.detail}` : null,
      e.hint ? `hint=${e.hint}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    parts.push(line);
    current = e.cause;
  }
  return parts.join('\n  caused by: ');
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // 연결 가능 여부 먼저 확인 — 접속 오류를 schema 오류와 구분.
  try {
    const client = await pool.connect();
    client.release();
  } catch (err) {
    console.error('[db:err] Cannot connect to database:', describeError(err));
    await pool.end();
    process.exit(1);
  }

  const db = drizzle(pool);
  console.log('[db] Applying database migrations...');
  try {
    await migrate(db, {
      migrationsFolder: join(__dirname, '../../drizzle'),
    });
    console.log('[db:ok] Database ready');
  } catch (err) {
    console.error('[db:err] Migration failed:\n  ' + describeError(err));
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  process.exit(1);
});
