import { useEffect, useRef, useState } from 'react';

import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// pdfjs-dist 는 런타임 import 이므로 타입만 느슨히 잡아둔다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJsLib = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDocument = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RenderTask = any;

let pdfjsLib: PdfJsLib | null = null;

async function getPdfjs(): Promise<PdfJsLib> {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  return pdfjsLib;
}

export interface PageRenderedInfo {
  width: number;
  height: number;
  pdfWidth: number;
  pdfHeight: number;
  scale: number;
}

interface PdfViewerProps {
  pdfUrl: string;
  currentPage: number;
  scale?: number;
  onPageRendered?: (info: PageRenderedInfo) => void;
  token?: string | null;
}

export default function PdfViewer({
  pdfUrl,
  currentPage,
  scale = 1.4,
  onPageRendered,
  token,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

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
    return () => {
      cancelled = true;
    };
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
        if (!canvas) return;

        // 물리 픽셀 크기 (고DPI 대응)
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        // CSS 크기는 논리 픽셀 기준 유지
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
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
        const e = err as { name?: string } | undefined;
        if (e?.name !== 'RenderingCancelledException') {
          console.error('Render error:', err);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage, scale]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
    />
  );
}
