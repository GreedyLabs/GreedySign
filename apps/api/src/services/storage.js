import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'uploads');

async function ensureDir() {
  await mkdir(ROOT, { recursive: true });
}

/**
 * PDF 파일을 저장하고 경로(key)를 반환합니다.
 * Object Storage로 전환 시 이 함수만 교체하면 됩니다.
 * @param {Buffer} buffer
 * @returns {Promise<string>} key (상대 경로)
 */
export async function storePdf(buffer) {
  await ensureDir();
  const key = `${randomUUID()}.pdf`;
  await writeFile(join(ROOT, key), buffer);
  return key;
}

/**
 * key로 PDF 버퍼를 읽어 반환합니다.
 * @param {string} key
 * @returns {Promise<Buffer>}
 */
export async function readPdf(key) {
  return readFile(join(ROOT, key));
}

/**
 * key에 해당하는 PDF 파일을 삭제합니다.
 * @param {string} key
 */
export async function deletePdf(key) {
  try {
    await unlink(join(ROOT, key));
  } catch {
    // 파일이 없어도 무시
  }
}
