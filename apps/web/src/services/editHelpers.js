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

export class CoordinateConverter {
  constructor(pdfWidth, pdfHeight, scale) {
    this.pdfWidth = pdfWidth;
    this.pdfHeight = pdfHeight;
    this.scale = scale;
  }

  /**
   * PDF X 좌표를 화면 X 좌표로 변환
   */
  toScreenX(pdfX) {
    return pdfX * this.scale;
  }

  /**
   * PDF Y 좌표를 화면 Y 좌표로 변환
   * @param {number} pdfY - PDF Y 좌표
   * @param {number} objHeight - 객체 높이 (PDF 단위)
   */
  toScreenY(pdfY, objHeight) {
    return (this.pdfHeight - pdfY - objHeight) * this.scale;
  }

  /**
   * 화면 X 좌표를 PDF X 좌표로 변환
   */
  toPdfX(screenX) {
    return screenX / this.scale;
  }

  /**
   * 화면 Y 좌표를 PDF Y 좌표로 변환
   * @param {number} screenY - 화면 Y 좌표
   * @param {number} objHeight - 객체 높이 (PDF 단위)
   */
  toPdfY(screenY, objHeight) {
    return this.pdfHeight - (screenY / this.scale) - objHeight;
  }

  /**
   * 화면 delta를 PDF delta로 변환 (드래그 이동용)
   * @returns {{ dxPt: number, dyPt: number }}
   */
  screenDeltaToPdfDelta(screenDx, screenDy) {
    return {
      dxPt: screenDx / this.scale,
      dyPt: -screenDy / this.scale, // Y축 반전
    };
  }
}

/**
 * 캔버스 이벤트에서 캔버스 내부 좌표 추출
 */
export function getCanvasPosition(e, canvasElement, canvasSize) {
  const rect = canvasElement.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvasSize.width / rect.width),
    y: (e.clientY - rect.top) * (canvasSize.height / rect.height),
  };
}

/**
 * 최소 크기 제한 적용
 */
export const MIN_FIELD_SIZE = 10; // 최소 10pt

/**
 * 리사이즈 업데이트 로직
 * @param {object} originalObj - 원본 객체 {x, y, width, height}
 * @param {number} dxPt - PDF 단위 X 이동량
 * @param {number} dyPt - PDF 단위 Y 이동량
 * @param {boolean} maintainAspect - 가로세로 비율 유지 여부
 * @param {number} aspectRatio - 가로세로 비율 (width/height)
 * @returns {object} 업데이트된 객체 {x, y, width, height}
 */
export function calculateResize(originalObj, dxPt, dyPt, maintainAspect = false, aspectRatio = 1) {
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
  } else {
    // 자유 리사이즈 (텍스트, 체크박스 등)
    const newHeight = Math.max(MIN_FIELD_SIZE, originalObj.height + dyPt);
    const deltaHeight = newHeight - originalObj.height;

    return {
      ...originalObj,
      width: Math.max(MIN_FIELD_SIZE, originalObj.width + dxPt),
      height: newHeight,
      y: originalObj.y - deltaHeight, // 높이 증가만큼 Y 위치 조정
    };
  }
}

/**
 * 드래그 업데이트 로직
 * @param {object} originalObj - 원본 객체 {x, y, width, height}
 * @param {number} dxPt - PDF 단위 X 이동량
 * @param {number} dyPt - PDF 단위 Y 이동량 (이미 Y축 반전 적용됨)
 * @returns {object} 업데이트된 객체 {x, y, width, height}
 */
export function calculateDrag(originalObj, dxPt, dyPt) {
  return {
    ...originalObj,
    x: originalObj.x + dxPt,
    y: originalObj.y + dyPt,
  };
}
