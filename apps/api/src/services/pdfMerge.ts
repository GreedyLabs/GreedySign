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

async function svgToPngBytes(svgData: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svgData))
    .resize(Math.round(width * 2), Math.round(height * 2))
    .png()
    .toBuffer();
}

async function extractPngBytes(svgData: string, width: number, height: number): Promise<Buffer> {
  const base64Match = svgData.match(/xlink:href="data:image\/png;base64,([^"]+)"/);
  if (base64Match?.[1]) return Buffer.from(base64Match[1], 'base64');

  const dataUriMatch = svgData.match(/^data:image\/png;base64,(.+)$/);
  if (dataUriMatch?.[1]) return Buffer.from(dataUriMatch[1], 'base64');

  return svgToPngBytes(svgData, width, height);
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
      const pngBytes = await extractPngBytes(svg_data, width, height);
      const embeddedImage = await pdfDoc.embedPng(pngBytes);
      page.drawImage(embeddedImage, { x, y, width, height });
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

  const result =
    participantIds && participantIds.length > 0
      ? await db.execute(sql`
        SELECT
          fr.text_value, fr.checked, fr.svg_data, fr.date_value,
          ff.field_type, ff.x, ff.y, ff.width, ff.height, ff.page_number
        FROM field_responses fr
        JOIN form_fields ff ON ff.id = fr.field_id
        WHERE ff.document_id = ${docId}::uuid
          AND fr.participant_id = ANY(${participantIds}::uuid[])
      `)
      : await db.execute(sql`
        SELECT
          fr.text_value, fr.checked, fr.svg_data, fr.date_value,
          ff.field_type, ff.x, ff.y, ff.width, ff.height, ff.page_number
        FROM field_responses fr
        JOIN form_fields ff ON ff.id = fr.field_id
        WHERE ff.document_id = ${docId}::uuid
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
