/**
 * regenerate-signed-pdfs — 이미 `completed` 인 문서들의 합본 PDF 재생성.
 *
 * 사용 시점: pdfMerge 의 서명 letterboxing 로직이 바뀌어, 화면과 PDF 합본의
 * 서명 위치/비율이 이전 산출물과 달라진 경우. 이 스크립트는 신규 로직으로
 * 합본을 다시 만들어 `signed_pdf_path` / `signed_pdf_hash` 를 갱신한다.
 *
 * 안전 보장
 * --------
 * - 기본은 dry-run: `--apply` 가 없으면 DB 와 파일 시스템에 아무것도 안 쓴다.
 * - 단일 문서 모드: `--doc-id <uuid>` 로 한 건만 처리.
 * - 기존 signed_pdf 파일은 삭제하지 않음 — DB 만 새 path 로 갱신해 즉시
 *   롤백 가능. (orphan 정리는 별도 작업.)
 * - 한 문서 실패해도 다음 문서로 계속.
 *
 * 사용법
 * ------
 *   tsx src/scripts/regenerate-signed-pdfs.ts                      # dry-run, 전체
 *   tsx src/scripts/regenerate-signed-pdfs.ts --apply              # 실제 적용, 전체
 *   tsx src/scripts/regenerate-signed-pdfs.ts --doc-id <uuid>      # dry-run, 단일
 *   tsx src/scripts/regenerate-signed-pdfs.ts --apply --doc-id <id> # 적용, 단일
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import { sql, eq, and } from 'drizzle-orm';
import { db, pool } from '../db/pool.js';
import { documents, documentParticipants } from '../db/schema.js';
import { buildCombinedPdf } from '../services/pdfMerge.js';
import { storePdf } from '../services/storage.js';

interface CliOpts {
  apply: boolean;
  docId: string | null;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { apply: false, docId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--doc-id') {
      opts.docId = argv[++i] ?? null;
      if (!opts.docId) {
        throw new Error('--doc-id 다음에 UUID 가 필요합니다');
      }
    } else if (a === '--help' || a === '-h') {
      console.log(
        [
          'regenerate-signed-pdfs',
          '',
          '옵션:',
          '  --apply             실제로 적용 (기본은 dry-run)',
          '  --doc-id <uuid>     특정 문서만 처리',
          '  -h, --help          도움말',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 인자: ${a}`);
    }
  }
  return opts;
}

interface DocRow {
  id: string;
  pdf_path: string;
  signed_pdf_path: string | null;
  signed_pdf_hash: string | null;
  name: string;
}

async function listTargetDocs(docId: string | null): Promise<DocRow[]> {
  if (docId) {
    const rows = await db
      .select({
        id: documents.id,
        pdf_path: documents.pdf_path,
        signed_pdf_path: documents.signed_pdf_path,
        signed_pdf_hash: documents.signed_pdf_hash,
        name: documents.name,
      })
      .from(documents)
      .where(and(eq(documents.id, docId), eq(documents.status, 'completed')));
    return rows;
  }
  return db
    .select({
      id: documents.id,
      pdf_path: documents.pdf_path,
      signed_pdf_path: documents.signed_pdf_path,
      signed_pdf_hash: documents.signed_pdf_hash,
      name: documents.name,
    })
    .from(documents)
    .where(eq(documents.status, 'completed'))
    .orderBy(documents.completed_at);
}

async function getAcceptedParticipantIds(docId: string): Promise<string[]> {
  const rows = await db
    .select({ id: documentParticipants.id })
    .from(documentParticipants)
    .where(
      and(
        eq(documentParticipants.document_id, docId),
        eq(documentParticipants.invite_status, 'accepted'),
      ),
    );
  return rows.map((r) => r.id);
}

async function regenerateOne(doc: DocRow, apply: boolean): Promise<{
  ok: boolean;
  oldHash: string | null;
  newHash: string;
  newPath?: string;
  reason?: string;
}> {
  const participantIds = await getAcceptedParticipantIds(doc.id);
  const pdfBytes = await buildCombinedPdf(doc.pdf_path, doc.id, participantIds);
  const buf = Buffer.from(pdfBytes);
  const newHash = createHash('sha256').update(buf).digest('hex');

  if (newHash === doc.signed_pdf_hash) {
    return { ok: true, oldHash: doc.signed_pdf_hash, newHash, reason: 'unchanged' };
  }

  if (!apply) {
    return { ok: true, oldHash: doc.signed_pdf_hash, newHash, reason: 'dry-run' };
  }

  const newPath = await storePdf(buf);
  await db
    .update(documents)
    .set({
      signed_pdf_path: newPath,
      signed_pdf_hash: newHash,
      updated_at: sql`NOW()`,
    })
    .where(eq(documents.id, doc.id));

  return { ok: true, oldHash: doc.signed_pdf_hash, newHash, newPath };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `[regen] mode=${opts.apply ? 'APPLY' : 'DRY-RUN'} docId=${opts.docId ?? 'ALL'}`,
  );

  const docs = await listTargetDocs(opts.docId);
  console.log(`[regen] target documents: ${docs.length}`);

  let success = 0;
  let unchanged = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      const r = await regenerateOne(doc, opts.apply);
      if (r.reason === 'unchanged') {
        unchanged++;
        console.log(
          `[regen] ${doc.id} (${doc.name}) — 해시 동일, 건너뜀 (${r.newHash.slice(0, 12)}…)`,
        );
      } else {
        success++;
        console.log(
          [
            `[regen] ${doc.id} (${doc.name})`,
            `  old: ${r.oldHash?.slice(0, 12) ?? '(없음)'}`,
            `  new: ${r.newHash.slice(0, 12)}${r.newPath ? `  → ${r.newPath}` : ''}`,
            opts.apply ? '  ✓ 적용됨' : '  · dry-run (적용하려면 --apply)',
          ].join('\n'),
        );
      }
    } catch (err) {
      failed++;
      console.error(
        `[regen:err] ${doc.id} (${doc.name}): ${(err as Error).message}`,
      );
    }
  }

  console.log(
    `\n[regen] 완료 — 처리 ${success} · 변경 없음 ${unchanged} · 실패 ${failed} / 총 ${docs.length}`,
  );
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[regen:fatal]', err);
  pool.end().finally(() => process.exit(2));
});
