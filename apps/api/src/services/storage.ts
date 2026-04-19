import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'uploads');

async function ensureDir(): Promise<void> {
  await mkdir(ROOT, { recursive: true });
}

/**
 * PDF 파일을 저장하고 경로(key)를 반환합니다.
 * Object Storage로 전환 시 이 함수만 교체하면 됩니다.
 */
export async function storePdf(buffer: Buffer): Promise<string> {
  await ensureDir();
  const key = `${randomUUID()}.pdf`;
  await writeFile(join(ROOT, key), buffer);
  return key;
}

/**
 * key로 PDF 버퍼를 읽어 반환합니다.
 */
export async function readPdf(key: string): Promise<Buffer> {
  return readFile(join(ROOT, key));
}

/**
 * key에 해당하는 PDF 파일을 삭제합니다.
 */
export async function deletePdf(key: string): Promise<void> {
  try {
    await unlink(join(ROOT, key));
  } catch {
    // 파일이 없어도 무시
  }
}
