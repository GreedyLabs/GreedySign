import { useRef, useState, useEffect } from 'react';
import api from '../services/api';

// editing: 기존 서명 객체 (수정 모드), null이면 신규 생성
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
    const logicalW = 470, logicalH = 160;
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
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
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
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
    const ctx = canvas.getContext('2d');
    points.current.push(getPos(e, canvas));
    redraw(ctx, canvas);
  };

  const endDraw = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (points.current.length > 1) strokes.current.push([...points.current]);
    points.current = [];
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    strokes.current = [];
  };

  const strokesToSvgPath = (strokeList, w, h) => {
    if (!strokeList.length) return '';
    const paths = strokeList.map(pts => {
      if (pts.length < 2) return '';
      let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i], prev = pts[i - 1];
        const mx = ((prev.x + p.x) / 2).toFixed(1);
        const my = ((prev.y + p.y) / 2).toFixed(1);
        d += ` Q${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${mx},${my}`;
      }
      return `<path d="${d}" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
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
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 80" width="200" height="80"><image xlink:href="data:image/png;base64,${base64}" x="0" y="0" width="200" height="80" preserveAspectRatio="xMidYMid meet"/></svg>`;
      setImgSvg(svg);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    let svgData = '';
    let method = '';

    if (tab === 'draw') {
      if (!strokes.current.length) return alert('서명을 그려주세요');
      svgData = strokesToSvgPath(strokes.current, 470, 160);
      method = 'draw';
    } else {
      if (!imgSvg) return alert('이미지를 업로드해주세요');
      svgData = imgSvg;
      method = 'image';
    }

    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 80;
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
        if (editing) {
          ({ data } = await api.put(`/signatures/${editing.id}`, { name: sigName, method, svg_data: svgData, thumbnail }));
        } else {
          ({ data } = await api.post('/signatures', { name: sigName, method, svg_data: svgData, thumbnail }));
        }
        onSaved(data);
        onClose();
      } catch (err) {
        alert(err.response?.data?.error || '저장 실패');
      } finally { setSaving(false); }
    };
    img.src = url;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '24px', width: 520, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{editing ? '서명 수정' : '서명 만들기'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['draw', 'image'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 16px', borderRadius: 8, border: '1px solid',
              borderColor: tab === t ? '#3b82f6' : '#d1d5db',
              background: tab === t ? '#eff6ff' : '#fff',
              color: tab === t ? '#3b82f6' : '#374151',
              fontSize: 13, cursor: 'pointer', fontWeight: tab === t ? 500 : 400
            }}>
              {t === 'draw' ? '직접 그리기' : '이미지 업로드'}
            </button>
          ))}
        </div>

        {tab === 'draw' ? (
          <div>
            <div style={{ border: '1.5px solid #d1d5db', borderRadius: 8, background: '#fafafa', marginBottom: 8, cursor: 'crosshair', touchAction: 'none' }}>
              <canvas ref={canvasRef}
                style={{ display: 'block', width: '100%', height: 160 }}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              />
            </div>
            <button onClick={clearCanvas} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>지우기</button>
          </div>
        ) : (
          <div style={{ border: '1.5px dashed #d1d5db', borderRadius: 8, background: '#fafafa', height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            {imgPreview ? (
              <img src={imgPreview} alt="서명" style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain' }} />
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>PNG, JPG 이미지를 업로드하세요</p>
                <label style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                  파일 선택
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                </label>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 4 }}>서명 이름</label>
          <input value={sigName} onChange={e => setSigName(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={outlineBtn}>취소</button>
          <button onClick={handleSave} disabled={saving} style={primaryBtn}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryBtn = { padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' };
const outlineBtn = { padding: '8px 20px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer' };
