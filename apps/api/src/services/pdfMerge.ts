import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { db } from '../db/pool.js';
import { sql } from 'drizzle-orm';
import { readPdf } from './storage.js';

interface FieldResponse {
  field_type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page_number: number;
  text_value?: string | null;
  checked?: boolean | null;
  svg_data?: string | null;
  date_value?: Date | string | null;
}

/**
 * 서명 SVG (래퍼 viewBox 200x80 또는 466x180) 를 통째로 래스터화한다.
 *
 * 화면 일치를 위해 래퍼의 letterboxing 을 픽셀에 굳히는 게 핵심. 안쪽
 * PNG 만 꺼내 쓰면 — PNG 종횡비와 래퍼 종횡비가 다를 때 — 에디터
 * 화면에서 보이는 letterbox 가 PDF 에서는 사라져 어긋난다.
 *
 *  - density: 300  → SVG 래스터화 DPI (default 72) 를 끌어올려 선명도 확보
 *  - fit: 'inside' → 래퍼 종횡비 보존, 박스 안에 맞춤 (잘림 방지)
 *  - 4x 슈퍼샘플링 → PDF 임베드 후 확대·인쇄 시에도 또렷
 */
async function rasterizeSignature(
  svgData: string,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(Buffer.from(svgData), { density: 300 })
    .resize(Math.round(width * 4), Math.round(height * 4), { fit: 'inside' })
    .png()
    .toBuffer();
}

async function applyResponse(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument['getPages']>[number],
  response: FieldResponse
): Promise<void> {
  const { field_type, x, y, width, height, text_value, checked, svg_data } = response;

  if (field_type === 'text' && text_value) {
    page.drawText(text_value, {
      x,
      y: y + 2,
      size: Math.max(8, height * 0.6),
      color: rgb(0, 0, 0),
    });
  } else if (field_type === 'checkbox' && checked) {
    const cx = x + width * 0.2,
      cy = y + height * 0.45;
    const mx = x + width * 0.45,
      my = y + height * 0.2;
    const ex = x + width * 0.85,
      ey = y + height * 0.75;
    page.drawLine({
      start: { x: cx, y: cy },
      end: { x: mx, y: my },
      thickness: 1.5,
      color: rgb(0, 0, 0.8),
    });
    page.drawLine({
      start: { x: mx, y: my },
      end: { x: ex, y: ey },
      thickness: 1.5,
      color: rgb(0, 0, 0.8),
    });
  } else if ((field_type === 'signature' || field_type === 'initial') && svg_data) {
    try {
      const pngBytes = await rasterizeSignature(svg_data, width, height);
      const embeddedImage = await pdfDoc.embedPng(pngBytes);
      // pdf-lib `drawImage` 는 width/height 를 받으면 비율 무시하고 늘려 채운다.
      // 브라우저의 SVG `preserveAspectRatio="xMidYMid meet"` 와 맞추기 위해
      // 이미지 본래 비율을 유지하면서 필드 박스 안 가운데 정렬로 그린다.
      const imgRatio = embeddedImage.width / embeddedImage.height;
      const fieldRatio = width / height;
      let drawW = width;
      let drawH = height;
      let drawX = x;
      let drawY = y;
      if (imgRatio > fieldRatio) {
        // 이미지가 더 넓다 → 가로를 박스에 맞추고 세로 가운데 정렬
        drawH = width / imgRatio;
        drawY = y + (height - drawH) / 2;
      } else if (imgRatio < fieldRatio) {
        // 이미지가 더 좁다 → 세로를 박스에 맞추고 가로 가운데 정렬
        drawW = height * imgRatio;
        drawX = x + (width - drawW) / 2;
      }
      page.drawImage(embeddedImage, { x: drawX, y: drawY, width: drawW, height: drawH });
    } catch (err) {
      console.error(`Signature embed error (${field_type}):`, (err as Error).message);
    }
  } else if (field_type === 'date' && response.date_value) {
    // YYYY-MM-DD 텍스트를 한국어 날짜로 포맷. T12:00:00으로 고정해 타임존 변환에 의한 날짜 변동 방지
    const raw = String(response.date_value);
    const dateStr = raw.match(/^\d{4}-\d{2}-\d{2}$/)
      ? new Date(`${raw}T12:00:00`).toLocaleDateString('ko-KR')
      : new Date(raw).toLocaleDateString('ko-KR');
    page.drawText(dateStr, {
      x,
      y: y + 2,
      size: Math.max(8, height * 0.6),
      color: rgb(0, 0, 0),
    });
  }
}

export async function buildCombinedPdf(
  pdfPath: string,
  docId: string,
  participantIds: string[] | null = null
): Promise<Uint8Array> {
  const pdfBytes = await readPdf(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // 주의: drizzle 의 sql`` 안에서 JS 배열은 "$1, $2, ... 의 튜플"로 펼쳐지므로
  // `ANY(${ids}::uuid[])` 가 `ANY(($2,$3,...)::uuid[])` 가 돼 PG 가 record →
  // uuid[] 로 캐스팅하다 실패한다(`certificate.ts` 와 같은 함정).
  // → IN + sql.join 으로 명시적인 파라미터 리스트를 만들어 우회한다.
  // 이 버그는 freezeDocument 의 catch 에 가려서 "status=completed 인데
  // signed_pdf_path/hash 만 null" 인 좀비 상태를 만들었다.
  const participantFilter =
    participantIds && participantIds.length > 0
      ? sql`AND fr.participant_id IN (${sql.join(
          participantIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )})`
      : sql``;

  const result = await db.execute(sql`
    SELECT
      fr.text_value, fr.checked, fr.svg_data, fr.date_value,
      ff.field_type, ff.x, ff.y, ff.width, ff.height, ff.page_number
    FROM field_responses fr
    JOIN form_fields ff ON ff.id = fr.field_id
    WHERE ff.document_id = ${docId}::uuid
      ${participantFilter}
  `);

  for (const response of result.rows as unknown as FieldResponse[]) {
    const pageIndex = (response.page_number || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    await applyResponse(pdfDoc, pages[pageIndex]!, response);
  }

  return pdfDoc.save();
}

export async function buildIndividualPdf(
  pdfPath: string,
  docId: string,
  participantId: string
): Promise<Uint8Array> {
  return buildCombinedPdf(pdfPath, docId, [participantId]);
}
