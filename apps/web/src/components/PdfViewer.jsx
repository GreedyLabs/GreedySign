import { useEffect, useRef, useState } from 'react';

import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsLib = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  return pdfjsLib;
}

export default function PdfViewer({ pdfUrl, currentPage, scale = 1.4, onPageRendered, token }) {
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const renderTaskRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const lib = await getPdfjs();
        const doc = await lib.getDocument({
          url: pdfUrl,
          httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
        }).promise;
        if (!cancelled) setPdfDoc(doc);
      } catch (err) {
        console.error('PDF load error:', err);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [pdfUrl, token]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    async function render() {
      if (renderTaskRef.current) renderTaskRef.current.cancel();
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;

        // 물리 픽셀 크기 (고DPI 대응)
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        // CSS 크기는 논리 픽셀 기준 유지
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;

        if (!cancelled && onPageRendered) {
          onPageRendered({
            width: viewport.width,
            height: viewport.height,
            pdfWidth: page.view[2],
            pdfHeight: page.view[3],
            scale,
          });
        }
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') console.error('Render error:', err);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, scale]);

  return <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }} />;
}
