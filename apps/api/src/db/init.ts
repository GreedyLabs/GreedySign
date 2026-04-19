/**
 * DB 초기화 / 마이그레이션 실행 스크립트
 *
 * 사용법:
 *   pnpm db:init        → 마이그레이션 적용 (초기 배포 / 스키마 변경 시)
 *   pnpm db:generate    → schema.ts 변경 후 SQL 마이그레이션 파일 생성
 *   pnpm db:push        → 개발 중 마이그레이션 파일 없이 직접 반영 (dev only)
 */
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log('🔄 Applying database migrations...');
  await migrate(db, {
    migrationsFolder: join(__dirname, '../../drizzle'),
  });
  console.log('✅ Database ready');

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Migration failed:', (err as Error).message);
  process.exit(1);
});
