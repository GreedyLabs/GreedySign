import { useRef, useState, useEffect } from 'react';
import api from '../services/api';

export default function SignatureModal({ onClose, onSaved, editing = null }) {
  const [tab, setTab] = useState(editing?.method || 'draw');
  const [sigName, setSigName] = useState(editing?.name || '서명');
  const [saving, setSaving] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgSvg, setImgSvg] = useState(null);

  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const points = useRef([]);
  const strokes = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const logicalW = 466,
      logicalH = 180;
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }, [tab]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawing.current = true;
    points.current = [getPos(e, canvasRef.current)];
  };

  const redraw = (ctx, canvas) => {
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const allStrokes = [...strokes.current, points.current];
    for (const pts of allStrokes) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    points.current.push(getPos(e, canvas));
    redraw(canvas.getContext('2d'), canvas);
  };

  const endDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (points.current.length > 1) strokes.current.push([...points.current]);
    points.current = [];
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.getContext('2d').clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    strokes.current = [];
  };

  const strokesToSvgPath = (strokeList, w, h) => {
    const paths = strokeList.map((pts) => {
      if (pts.length < 2) return '';
      let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i],
          prev = pts[i - 1];
        const mx = ((prev.x + p.x) / 2).toFixed(1),
          my = ((prev.y + p.y) / 2).toFixed(1);
        d += ` Q${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${mx},${my}`;
      }
      return `<path d="${d}" fill="none" stroke="#0A0A0A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paths.join('')}</svg>`;
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setImgPreview(dataUrl);
      const base64 = dataUrl.split(',')[1];
      setImgSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 80" width="200" height="80"><image xlink:href="data:image/png;base64,${base64}" x="0" y="0" width="200" height="80" preserveAspectRatio="xMidYMid meet"/></svg>`
      );
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    let svgData = '',
      method = '';
    if (tab === 'draw') {
      if (!strokes.current.length) return alert('서명을 그려주세요');
      svgData = strokesToSvgPath(strokes.current, 466, 180);
      method = 'draw';
    } else {
      if (!imgSvg) return alert('이미지를 업로드해주세요');
      svgData = imgSvg;
      method = 'image';
    }

    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = async () => {
      ctx.drawImage(img, 0, 0, 200, 80);
      const thumbnail = canvas.toDataURL('image/png');
      URL.revokeObjectURL(url);
      setSaving(true);
      try {
        let data;
        if (editing)
          ({ data } = await api.put(`/signatures/${editing.id}`, {
            name: sigName,
            method,
            svg_data: svgData,
            thumbnail,
          }));
        else
          ({ data } = await api.post('/signatures', {
            name: sigName,
            method,
            svg_data: svgData,
            thumbnail,
          }));
        onSaved(data);
        onClose();
      } catch (err) {
        alert(err.response?.data?.error || '저장 실패');
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
                background: 'var(--color-bg-subtle)',
                height: 180,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {imgPreview ? (
                <img
                  src={imgPreview}
                  alt="서명"
                  style={{ maxHeight: 160, maxWidth: '100%', objectFit: 'contain', padding: 12 }}
                />
              ) : (
                <div className="col gap-3" style={{ alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    PNG, JPG 이미지를 업로드하세요
                  </div>
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
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setImgPreview(null);
                    setImgSvg(null);
                  }}
                >
                  다시 선택
                </button>
              )}
            </div>
          )}

          {/* Signature name */}
          <div>
            <label className="label">서명 이름</label>
            <input className="input" value={sigName} onChange={(e) => setSigName(e.target.value)} />
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
