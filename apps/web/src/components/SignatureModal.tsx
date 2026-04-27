import {
  useRef,
  useState,
  useEffect,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { ApiError } from '../services/api';

// ─── 배경 자동 제거 ─────────────────────────────────────────
// 업로드 PNG/JPG 의 흰 배경을 알파 0 으로 변환한다.
// 휘도(luminance) 기반 소프트 알파로 안티앨리어싱된 가장자리도 자연스럽게
// 살리고, 잉크 픽셀은 검정으로 정규화한다. 이미 투명한 픽셀은 그대로 둔다.
async function removeWhiteBackground(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다'));
    el.src = dataUrl;
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 컨텍스트를 만들 수 없습니다');

  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const WHITE = 240; // 이 이상이면 완전 투명
  const BLACK = 80; // 이 이하면 완전 잉크(검정)
  const RANGE = WHITE - BLACK;
  for (let i = 0; i < data.length; i += 4) {
    const srcAlpha = data[i + 3];
    if (srcAlpha === 0) continue; // 이미 투명 → 보존

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (lum >= WHITE) {
      data[i + 3] = 0;
    } else if (lum <= BLACK) {
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = srcAlpha;
    } else {
      const t = (WHITE - lum) / RANGE; // 0(밝음) → 1(어두움)
      data[i] = Math.round(r * (1 - t));
      data[i + 1] = Math.round(g * (1 - t));
      data[i + 2] = Math.round(b * (1 - t));
      // 입력 알파를 한도로, 휘도 기반 소프트 알파를 적용
      data[i + 3] = Math.min(srcAlpha, Math.round(255 * t));
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export interface SignatureRecord {
  id: number | string;
  name: string;
  method?: 'draw' | 'image' | string;
  svg_data?: string;
  thumbnail?: string;
}

type SignatureTab = 'draw' | 'image';

interface SignatureModalProps {
  onClose: () => void;
  onSaved: (record: SignatureRecord) => void;
  editing?: SignatureRecord | null;
}

interface Point {
  x: number;
  y: number;
}

type PointerEventLike = ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>;

export default function SignatureModal({
  onClose,
  onSaved,
  editing = null,
}: SignatureModalProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SignatureTab>(
    (editing?.method as SignatureTab | undefined) || 'draw',
  );
  const [sigName, setSigName] = useState<string>(editing?.name || '서명');
  const [saving, setSaving] = useState(false);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgSvg, setImgSvg] = useState<string | null>(null);
  const [imgProcessing, setImgProcessing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);

  const { data: savedSignatures = [] } = useQuery<SignatureRecord[]>({
    queryKey: ['signatures'],
    queryFn: async () => {
      const { data } = await api.get<SignatureRecord[]>('/signatures');
      return data;
    },
  });

  const handleDelete = async (sig: SignatureRecord) => {
    if (!confirm(`"${sig.name}" 서명을 삭제하시겠습니까?`)) return;
    setDeletingId(sig.id);
    try {
      await api.delete(`/signatures/${sig.id}`);
      queryClient.invalidateQueries({ queryKey: ['signatures'] });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.response.data as { error?: string } | undefined)?.error ?? '삭제 실패')
          : '삭제 실패';
      alert(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const points = useRef<Point[]>([]);
  const strokes = useRef<Point[][]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const logicalW = 466;
    const logicalH = 180;
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }, [tab]);

  const getPos = (e: PointerEventLike, canvas: HTMLCanvasElement): Point => {
    const rect = canvas.getBoundingClientRect();
    const src =
      'touches' in e && e.touches.length > 0
        ? e.touches[0]
        : (e as ReactMouseEvent<HTMLCanvasElement>);
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDraw = (e: PointerEventLike) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    points.current = [getPos(e, canvas)];
  };

  const redraw = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const allStrokes: Point[][] = [...strokes.current, points.current];
    for (const pts of allStrokes) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mid = {
          x: (pts[i].x + pts[i + 1].x) / 2,
          y: (pts[i].y + pts[i + 1].y) / 2,
        };
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  };

  const draw = (e: PointerEventLike) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    points.current.push(getPos(e, canvas));
    const ctx = canvas.getContext('2d');
    if (ctx) redraw(ctx, canvas);
  };

  const endDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (points.current.length > 1) strokes.current.push([...points.current]);
    points.current = [];
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    strokes.current = [];
  };

  const strokesToSvgPath = (strokeList: Point[][], w: number, h: number): string => {
    const paths = strokeList.map((pts) => {
      if (pts.length < 2) return '';
      let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const prev = pts[i - 1];
        const mx = ((prev.x + p.x) / 2).toFixed(1);
        const my = ((prev.y + p.y) / 2).toFixed(1);
        d += ` Q${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${mx},${my}`;
      }
      return `<path d="${d}" fill="none" stroke="#0A0A0A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    // width/height 속성을 생략하고 viewBox + preserveAspectRatio 만 지정해
    // 외부 <image> 의 width/height 에 맞춰 자연스럽게 스케일되도록 한다.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${paths.join('')}</svg>`;
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl !== 'string') return;
      setImgProcessing(true);
      let processed = dataUrl;
      try {
        processed = await removeWhiteBackground(dataUrl);
      } catch (err) {
        // 처리에 실패해도 원본으로 폴백 — 업로드 자체가 막히지 않도록.
        console.error('[signature bg-remove]', err);
      }
      setImgPreview(processed);
      const base64 = processed.split(',')[1];
      // 이미지 서명도 동일하게 고정 width/height 제거, viewBox 만으로 스케일 계산.
      setImgSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 80" preserveAspectRatio="xMidYMid meet"><image xlink:href="data:image/png;base64,${base64}" x="0" y="0" width="200" height="80" preserveAspectRatio="xMidYMid meet"/></svg>`,
      );
      setImgProcessing(false);
      // 동일 파일 재선택 가능하도록 input value 리셋
      if (e.target) e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    let svgData = '';
    let method: SignatureTab = 'draw';
    if (tab === 'draw') {
      if (!strokes.current.length) {
        alert('서명을 그려주세요');
        return;
      }
      svgData = strokesToSvgPath(strokes.current, 466, 180);
      method = 'draw';
    } else {
      if (!imgSvg) {
        alert('이미지를 업로드해주세요');
        return;
      }
      svgData = imgSvg;
      method = 'image';
    }

    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = async () => {
      ctx.drawImage(img, 0, 0, 200, 80);
      const thumbnail = canvas.toDataURL('image/png');
      URL.revokeObjectURL(url);
      setSaving(true);
      try {
        let data: SignatureRecord;
        if (editing) {
          ({ data } = await api.put<SignatureRecord>(`/signatures/${editing.id}`, {
            name: sigName,
            method,
            svg_data: svgData,
            thumbnail,
          }));
        } else {
          ({ data } = await api.post<SignatureRecord>('/signatures', {
            name: sigName,
            method,
            svg_data: svgData,
            thumbnail,
          }));
        }
        onSaved(data);
        onClose();
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? ((err.response.data as { error?: string } | undefined)?.error ?? '저장 실패')
            : '저장 실패';
        alert(msg);
      } finally {
        setSaving(false);
      }
    };
    img.src = url;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-head">
          <div className="modal-head-title">{editing ? '서명 수정' : '새 서명 만들기'}</div>
          <button className="icon-btn" onClick={onClose}>
            <svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="m4 4 8 8M12 4 4 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body col gap-4">
          {/* 저장된 서명 라이브러리 (편집 모드일 때는 자기 자신을 제외) */}
          {savedSignatures.length > 0 && (
            <div>
              <div className="t-eyebrow" style={{ marginBottom: 8 }}>
                내 서명 ({savedSignatures.length}개)
              </div>
              <div className="col gap-2">
                {savedSignatures
                  .filter((sig) => !editing || sig.id !== editing.id)
                  .map((sig) => (
                    <div
                      key={sig.id}
                      style={{
                        padding: 8,
                        borderRadius: 'var(--radius-control)',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 80,
                          height: 32,
                          background:
                            'repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 12px 12px',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={
                            sig.thumbnail ||
                            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sig.svg_data || '')}`
                          }
                          alt={sig.name}
                          style={{ maxHeight: 28, maxWidth: '100%', objectFit: 'contain' }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="truncate"
                          style={{ fontSize: 13, fontWeight: 500 }}
                        >
                          {sig.name}
                        </div>
                        <div className="t-caption">
                          {sig.method === 'image' ? '업로드' : '직접 그림'}
                        </div>
                      </div>
                      <button
                        className="icon-btn"
                        onClick={() => handleDelete(sig)}
                        disabled={deletingId === sig.id}
                        title="삭제"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        <svg
                          width={14}
                          height={14}
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        >
                          <path d="M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10" />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Tab selector */}
          <div className="gs-segment" style={{ width: 'fit-content' }}>
            <button
              className={tab === 'draw' ? 'is-on' : ''}
              onClick={() => setTab('draw')}
              style={{ padding: '0 18px' }}
            >
              직접 그리기
            </button>
            <button
              className={tab === 'image' ? 'is-on' : ''}
              onClick={() => setTab('image')}
              style={{ padding: '0 18px' }}
            >
              이미지 업로드
            </button>
          </div>

          {/* Canvas / Image area */}
          {tab === 'draw' ? (
            <div>
              <div
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-card)',
                  background: '#FAFAF9',
                  cursor: 'crosshair',
                  touchAction: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
                {/* Baseline */}
                <div
                  style={{
                    position: 'absolute',
                    left: 24,
                    right: 24,
                    bottom: 36,
                    height: 1,
                    background: 'var(--color-border-strong)',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 24,
                    bottom: 14,
                    fontSize: 10.5,
                    color: 'var(--color-text-muted)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-mono)',
                    pointerEvents: 'none',
                  }}
                >
                  여기에 서명
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={clearCanvas}
                style={{ marginTop: 6 }}
              >
                <svg
                  width={13}
                  height={13}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                >
                  <path d="M2 13h12M5 13 3 5l5 2 4-6 1 8 3 4" />
                </svg>
                지우기
              </button>
            </div>
          ) : (
            <div
              style={{
                border: '1.5px dashed var(--color-border-strong)',
                borderRadius: 'var(--radius-card)',
                background: imgPreview
                  ? 'repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 16px 16px'
                  : 'var(--color-bg-subtle)',
                height: 180,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {imgPreview ? (
                <img
                  src={imgPreview}
                  alt="서명"
                  style={{
                    maxHeight: 160,
                    maxWidth: '100%',
                    objectFit: 'contain',
                    padding: 12,
                  }}
                />
              ) : imgProcessing ? (
                <div className="col gap-2" style={{ alignItems: 'center' }}>
                  <div className="gs-spinner" />
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    배경 제거 중…
                  </div>
                </div>
              ) : (
                <div className="col gap-3" style={{ alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    PNG, JPG 이미지를 업로드하세요
                  </div>
                  <div className="t-caption">흰 배경은 자동으로 제거됩니다</div>
                  <label className="btn btn-secondary">
                    파일 선택
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              )}
              {imgPreview && (
                <label
                  className="btn btn-ghost btn-sm"
                  style={{ position: 'absolute', bottom: 6, right: 6 }}
                >
                  다시 선택
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setImgPreview(null);
                      setImgSvg(null);
                      handleImageUpload(e);
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          )}

          {/* Signature name */}
          <div>
            <label className="label">서명 이름</label>
            <input
              className="input"
              value={sigName}
              onChange={(e) => setSigName(e.target.value)}
            />
            <div className="help">나만 볼 수 있는 이름입니다.</div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중…' : editing ? '수정 완료' : '서명 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
