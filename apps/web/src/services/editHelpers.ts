/**
 * PDF 좌표계 ↔ 화면 좌표계 변환 헬퍼
 *
 * 좌표계 규칙:
 * ─────────────────────────────────────────────────────────────
 * DB/state : PDF 포인트 단위, PDF 좌표계 (좌하단 원점, Y↑)
 * SVG      : 화면 픽셀 단위, 브라우저 좌표계 (좌상단 원점, Y↓)
 *
 * PDF → 화면
 *   screenX = pdfX * scale
 *   screenY = (pdfH - pdfY - objH) * scale
 *
 * 화면 → PDF
 *   pdfX = screenX / scale
 *   pdfY = pdfH - (screenY / scale) - objH
 *
 * 드래그 delta
 *   X: pdfX += dScreenX / scale
 *   Y: pdfY -= dScreenY / scale   ← Y축 반전
 * ─────────────────────────────────────────────────────────────
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface PdfDelta {
  dxPt: number;
  dyPt: number;
}

export class CoordinateConverter {
  pdfWidth: number;
  pdfHeight: number;
  scale: number;

  constructor(pdfWidth: number, pdfHeight: number, scale: number) {
    this.pdfWidth = pdfWidth;
    this.pdfHeight = pdfHeight;
    this.scale = scale;
  }

  /** PDF X 좌표를 화면 X 좌표로 변환 */
  toScreenX(pdfX: number): number {
    return pdfX * this.scale;
  }

  /** PDF Y 좌표를 화면 Y 좌표로 변환 */
  toScreenY(pdfY: number, objHeight: number): number {
    return (this.pdfHeight - pdfY - objHeight) * this.scale;
  }

  /** 화면 X 좌표를 PDF X 좌표로 변환 */
  toPdfX(screenX: number): number {
    return screenX / this.scale;
  }

  /** 화면 Y 좌표를 PDF Y 좌표로 변환 */
  toPdfY(screenY: number, objHeight: number): number {
    return this.pdfHeight - screenY / this.scale - objHeight;
  }

  /** 화면 delta를 PDF delta로 변환 (드래그 이동용) */
  screenDeltaToPdfDelta(screenDx: number, screenDy: number): PdfDelta {
    return {
      dxPt: screenDx / this.scale,
      dyPt: -screenDy / this.scale, // Y축 반전
    };
  }
}

/** 캔버스 이벤트에서 캔버스 내부 좌표 추출 */
export function getCanvasPosition(
  e: MouseEvent | React.MouseEvent,
  canvasElement: HTMLElement,
  canvasSize: CanvasSize,
): Position {
  const rect = canvasElement.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvasSize.width / rect.width),
    y: (e.clientY - rect.top) * (canvasSize.height / rect.height),
  };
}

/** 최소 크기 제한 */
export const MIN_FIELD_SIZE = 10; // 최소 10pt

/**
 * 리사이즈 업데이트 로직
 * @param maintainAspect - 가로세로 비율 유지 여부
 * @param aspectRatio - 가로세로 비율 (width/height)
 */
export function calculateResize<T extends Rect>(
  originalObj: T,
  dxPt: number,
  dyPt: number,
  maintainAspect: boolean = false,
  aspectRatio: number = 1,
): T {
  if (maintainAspect) {
    // 비율 유지 리사이즈 (서명 등)
    const newWidth = Math.max(MIN_FIELD_SIZE, originalObj.width + dxPt);
    const newHeight = newWidth / aspectRatio;
    const deltaHeight = newHeight - originalObj.height;

    return {
      ...originalObj,
      width: newWidth,
      height: newHeight,
      y: originalObj.y - deltaHeight, // 높이 증가만큼 Y 위치 조정
    };
  }

  // 자유 리사이즈 (텍스트, 체크박스 등)
  const newHeight = Math.max(MIN_FIELD_SIZE, originalObj.height + dyPt);
  const deltaHeight = newHeight - originalObj.height;

  return {
    ...originalObj,
    width: Math.max(MIN_FIELD_SIZE, originalObj.width + dxPt),
    height: newHeight,
    y: originalObj.y - deltaHeight,
  };
}

/** 드래그 업데이트 로직 (dyPt 는 이미 Y 반전 적용된 값) */
export function calculateDrag<T extends Rect>(
  originalObj: T,
  dxPt: number,
  dyPt: number,
): T {
  return {
    ...originalObj,
    x: originalObj.x + dxPt,
    y: originalObj.y + dyPt,
  };
}
