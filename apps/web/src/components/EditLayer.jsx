import { useState, useRef, useEffect } from 'react';
import api from '../services/api';

const FIELD_COLORS = { text: '#3b82f6', checkbox: '#10b981', signature: '#8b5cf6' };
const MIN_PT = 10;

/*
 * 좌표계 규칙
 * ─────────────────────────────────────────────────────────────
 * DB/state : PDF 포인트 단위, PDF 좌표계 (좌하단 원점, Y↑)
 * SVG      : 화면 픽셀 단위, 브라우저 좌표계 (좌상단 원점, Y↓)
 *
 * PDF → 화면
 *   screenX = pdfX * sc
 *   screenY = (pdfH - pdfY - objH) * sc
 *
 * 화면 → PDF
 *   pdfX = screenX / sc
 *   pdfY = pdfH - (screenY / sc) - objH
 *
 * 드래그 delta
 *   X: pdfX += dScreenX / sc
 *   Y: pdfY -= dScreenY / sc   ← Y축 반전
 * ─────────────────────────────────────────────────────────────
 */

export default function EditLayer({
  docId, fields, setFields, myValues, setMyValues,
  sigPlacements, setSigPlacements,
  canvasSize, currentPage, activeTool, activeSignature, onToolUsed,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const svgRef = useRef(null);
  const interactRef = useRef(null);
  const fieldsRef = useRef(fields);
  const sigPlacementsRef = useRef(sigPlacements);

  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { sigPlacementsRef.current = sigPlacements; }, [sigPlacements]);

  const sc = canvasSize.scale || 1;
  const pdfH = canvasSize.pdfHeight || (canvasSize.height / sc);

  const toScreenX = (pdfX) => pdfX * sc;
  const toScreenY = (pdfY, objHpt) => (pdfH - pdfY - objHpt) * sc;
  const toPdfX = (sx) => sx / sc;
  const toPdfY = (sy, objHpt) => pdfH - (sy / sc) - objHpt;

  const getCanvasPos = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasSize.width / rect.width),
      y: (e.clientY - rect.top) * (canvasSize.height / rect.height),
    };
  };

  // ── 클릭으로 필드/서명 배치 ────────────────────────────────
  const handleSvgClick = async (e) => {
    if (e.target !== svgRef.current) return;
    setSelectedId(null);
    if (!activeTool) return;
    const cp = getCanvasPos(e);

    if (activeTool === 'text' || activeTool === 'checkbox') {
      const wPt = activeTool === 'checkbox' ? 16 : 120;
      const hPt = activeTool === 'checkbox' ? 16 : 22;
      const xPt = toPdfX(cp.x) - wPt / 2;
      const yPt = toPdfY(cp.y, 0) - hPt / 2;
      try {
        const { data } = await api.post(`/documents/${docId}/fields`, {
          field_type: activeTool,
          field_name: activeTool === 'text' ? '텍스트 필드' : '체크박스',
          x: xPt, y: yPt, width: wPt, height: hPt,
          page_number: currentPage,
        });
        setFields(prev => [...prev, data]);
        onToolUsed();
      } catch {}

    } else if (activeTool === 'signature' && activeSignature) {
      const wPt = 120, hPt = 45;
      const xPt = toPdfX(cp.x) - wPt / 2;
      const yPt = toPdfY(cp.y, 0) - hPt / 2;
      try {
        const { data } = await api.post(`/signatures/documents/${docId}/placements`, {
          signature_id: activeSignature.id,
          svg_data: activeSignature.svg_data,
          page_number: currentPage,
          x: xPt, y: yPt, width: wPt, height: hPt, rotation: 0,
        });
        setSigPlacements(prev => [...prev, data]);
        onToolUsed();
      } catch {}
    }
  };

  // ── 드래그/리사이즈 시작 ───────────────────────────────────
  const startInteract = (e, id, type, mode) => {
    e.stopPropagation();
    setSelectedId(id);
    const cp = getCanvasPos(e);
    const obj = type === 'field'
      ? fields.find(f => f.id === id)
      : sigPlacements.find(s => s.id === id);
    if (!obj) return;

    interactRef.current = {
      mode, type, id,
      startSX: cp.x, startSY: cp.y,
      origX: obj.x, origY: obj.y,
      origW: obj.width, origH: obj.height,
      aspect: obj.width / obj.height,
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    const info = interactRef.current;
    if (!info) return;
    const cp = getCanvasPos(e);

    const dxPt = (cp.x - info.startSX) / sc;
    const dyPt = (cp.y - info.startSY) / sc;

    const update = (obj) => {
      if (info.mode === 'drag') {
        return { ...obj, x: info.origX + dxPt, y: info.origY - dyPt };
      }
      if (info.type === 'sig') {
        const newW = Math.max(MIN_PT, info.origW + dxPt);
        return { ...obj, width: newW, height: newW / info.aspect };
      }
      return {
        ...obj,
        width: Math.max(MIN_PT, info.origW + dxPt),
        height: Math.max(MIN_PT, info.origH + dyPt),
      };
    };

    if (info.type === 'field') {
      setFields(prev => prev.map(f => f.id === info.id ? update(f) : f));
    } else {
      setSigPlacements(prev => prev.map(s => s.id === info.id ? update(s) : s));
    }
  };

  const onMouseUp = async () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    const info = interactRef.current;
    interactRef.current = null;
    if (!info) return;

    if (info.type === 'field') {
      const field = fieldsRef.current.find(f => f.id === info.id);
      if (field) {
        api.put(`/fields/${field.id}`, {
          x: field.x, y: field.y, width: field.width, height: field.height,
          field_name: field.field_name,
        }).catch(() => {});
      }
    } else {
      const sig = sigPlacementsRef.current.find(s => s.id === info.id);
      if (sig) {
        api.put(`/signatures/placements/${sig.id}`, {
          x: sig.x, y: sig.y, width: sig.width, height: sig.height, rotation: sig.rotation,
        }).catch(() => {});
      }
    }
  };

  // ── 필드 값 변경 ───────────────────────────────────────────
  const handleFieldValue = async (fieldId, value) => {
    setMyValues(prev => {
      const idx = prev.findIndex(v => v.field_id === fieldId);
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], value }; return n; }
      return [...prev, { field_id: fieldId, value }];
    });
    try {
      await api.put(`/fields/${fieldId}/value`, { value });
    } catch {}
  };

  const deleteField = async (id) => {
    await api.delete(`/fields/${id}`);
    setFields(prev => prev.filter(f => f.id !== id));
    setSelectedId(null);
  };

  const deleteSigPlacement = async (id) => {
    await api.delete(`/signatures/placements/${id}`);
    setSigPlacements(prev => prev.filter(s => s.id !== id));
    setSelectedId(null);
  };

  const getMyValue = (fieldId) => myValues.find(v => v.field_id === fieldId)?.value || '';
  const pageFields = fields.filter(f => (f.page_number || 1) === currentPage);
  const pageSigs   = sigPlacements.filter(s => (s.page_number || 1) === currentPage);

  const ResizeHandle = ({ sx, sy, id, type }) => (
    <rect x={sx - 5} y={sy - 5} width={10} height={10} rx={2}
      fill="white" stroke="#6b7280" strokeWidth={1.5}
      style={{ cursor: 'nwse-resize' }}
      onMouseDown={e => startInteract(e, id, type, 'resize')} />
  );

  return (
    <svg ref={svgRef} width={canvasSize.width} height={canvasSize.height}
      style={{ position: 'absolute', top: 0, left: 0, cursor: activeTool ? 'crosshair' : 'default', overflow: 'visible' }}
      onClick={handleSvgClick}>

      {pageFields.map(field => {
        const val = getMyValue(field.id);
        const isSelected = selectedId === field.id;
        const color = FIELD_COLORS[field.field_type] || '#3b82f6';
        const sx = toScreenX(field.x);
        const sy = toScreenY(field.y, field.height);
        const sw = toScreenX(field.width);
        const sh = toScreenX(field.height);
        return (
          <g key={field.id}>
            <rect x={sx} y={sy} width={sw} height={sh}
              fill={`${color}18`} stroke={color} strokeWidth={isSelected ? 2 : 1}
              strokeDasharray={isSelected ? 'none' : '4 2'} rx={4}
              style={{ cursor: 'move' }}
              onMouseDown={e => startInteract(e, field.id, 'field', 'drag')} />

            {field.field_type === 'text' && (
              <foreignObject x={sx + 4} y={sy + 2} width={sw - 8} height={sh - 4}>
                <input xmlns="http://www.w3.org/1999/xhtml"
                  style={{ width: '100%', height: '100%', border: 'none', background: 'transparent',
                    fontSize: Math.min(14, sh * 0.55), outline: 'none', cursor: 'text' }}
                  value={val}
                  onClick={e => { e.stopPropagation(); setSelectedId(field.id); }}
                  onMouseDown={e => e.stopPropagation()}
                  onChange={e => handleFieldValue(field.id, e.target.value)}
                  placeholder={field.field_name}
                />
              </foreignObject>
            )}

            {field.field_type === 'checkbox' && (
              <g onClick={e => { e.stopPropagation(); handleFieldValue(field.id, val === 'true' ? 'false' : 'true'); }} style={{ cursor: 'pointer' }}>
                <rect x={sx + 2} y={sy + 2} width={sw - 4} height={sh - 4} fill="white" stroke={color} strokeWidth={1} rx={3} />
                {val === 'true' && (
                  <text x={sx + sw / 2} y={sy + sh * 0.75} textAnchor="middle" fontSize={sh * 0.7} fill={color}>✓</text>
                )}
              </g>
            )}

            {isSelected && <>
              <g onClick={e => { e.stopPropagation(); deleteField(field.id); }} style={{ cursor: 'pointer' }}>
                <circle cx={sx + sw} cy={sy} r={9} fill="#ef4444" />
                <text x={sx + sw} y={sy + 4} textAnchor="middle" fontSize={12} fill="white" style={{ pointerEvents: 'none' }}>×</text>
              </g>
              <ResizeHandle sx={sx + sw} sy={sy + sh} id={field.id} type="field" />
            </>}
          </g>
        );
      })}

      {pageSigs.map(sig => {
        const isSelected = selectedId === sig.id;
        const sx = toScreenX(sig.x);
        const sy = toScreenY(sig.y, sig.height);
        const sw = toScreenX(sig.width);
        const sh = toScreenX(sig.height);
        return (
          <g key={sig.id}>
            <image href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sig.svg_data)}`}
              x={sx} y={sy} width={sw} height={sh}
              style={{ opacity: 0.92, cursor: 'move', pointerEvents: 'all' }}
              onMouseDown={e => startInteract(e, sig.id, 'sig', 'drag')} />
            <rect x={sx} y={sy} width={sw} height={sh}
              fill="none" stroke={isSelected ? '#8b5cf6' : 'transparent'} strokeWidth={2} rx={2}
              style={{ cursor: 'move', pointerEvents: 'all' }}
              onMouseDown={e => startInteract(e, sig.id, 'sig', 'drag')} />
            {isSelected && <>
              <g onClick={e => { e.stopPropagation(); deleteSigPlacement(sig.id); }} style={{ cursor: 'pointer' }}>
                <circle cx={sx + sw} cy={sy} r={9} fill="#ef4444" />
                <text x={sx + sw} y={sy + 4} textAnchor="middle" fontSize={12} fill="white" style={{ pointerEvents: 'none' }}>×</text>
              </g>
              <ResizeHandle sx={sx + sw} sy={sy + sh} id={sig.id} type="sig" />
            </>}
          </g>
        );
      })}
    </svg>
  );
}
