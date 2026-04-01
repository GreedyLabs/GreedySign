import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { query } from '../db/pool.js';
import { readPdf } from './storage.js';

async function svgToPngBytes(svgData, width, height) {
  return sharp(Buffer.from(svgData))
    .resize(Math.round(width * 2), Math.round(height * 2))
    .png()
    .toBuffer();
}

export async function applyUserToPdf(pdfDoc, pages, userEmail, docId) {
  const { rows: values } = await query(
    `SELECT fv.value, ff.x, ff.y, ff.width, ff.height, ff.page_number, ff.field_type
     FROM field_values fv
     JOIN form_fields ff ON ff.id = fv.field_id
     JOIN users u ON u.id = fv.user_id
     WHERE ff.document_id = $1 AND u.email = $2`,
    [docId, userEmail]
  );

  const { rows: sigPlacements } = await query(
    `SELECT sp.* FROM signature_placements sp
     JOIN users u ON u.id = sp.user_id
     WHERE sp.document_id = $1 AND u.email = $2`,
    [docId, userEmail]
  );

  for (const val of values) {
    const pageIndex = (val.page_number || 1) - 1;
    if (pageIndex >= pages.length) continue;
    const page = pages[pageIndex];

    if (val.field_type === 'text' && val.value) {
      page.drawText(val.value, {
        x: val.x, y: val.y + 2,
        size: Math.max(8, val.height * 0.6),
        color: rgb(0, 0, 0),
      });
    } else if (val.field_type === 'checkbox' && val.value === 'true') {
      const cx = val.x + val.width * 0.2;
      const cy = val.y + val.height * 0.45;
      const mx = val.x + val.width * 0.45;
      const my = val.y + val.height * 0.2;
      const ex = val.x + val.width * 0.85;
      const ey = val.y + val.height * 0.75;
      page.drawLine({ start: { x: cx, y: cy }, end: { x: mx, y: my }, thickness: 1.5, color: rgb(0, 0, 0.8) });
      page.drawLine({ start: { x: mx, y: my }, end: { x: ex, y: ey }, thickness: 1.5, color: rgb(0, 0, 0.8) });
    }
  }

  for (const sig of sigPlacements) {
    const pageIndex = (sig.page_number || 1) - 1;
    if (pageIndex >= pages.length) continue;
    const page = pages[pageIndex];

    try {
      const base64Match = sig.svg_data.match(/xlink:href="data:image\/png;base64,([^"]+)"/);
      const pngBytes = base64Match
        ? Buffer.from(base64Match[1], 'base64')
        : await svgToPngBytes(sig.svg_data, sig.width, sig.height);

      const embeddedImage = await pdfDoc.embedPng(pngBytes);
      page.drawImage(embeddedImage, {
        x: sig.x, y: sig.y, width: sig.width, height: sig.height,
      });
    } catch (err) {
      console.error('Signature embed error:', err.message);
    }
  }
}

export async function buildCombinedPdf(pdfPath, emails, docId) {
  const pdfBytes = await readPdf(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  for (const email of emails) {
    await applyUserToPdf(pdfDoc, pages, email, docId);
  }
  return pdfDoc.save();
}

export async function buildIndividualPdf(pdfPath, userEmail, docId) {
  const pdfBytes = await readPdf(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  await applyUserToPdf(pdfDoc, pages, userEmail, docId);
  return pdfDoc.save();
}
