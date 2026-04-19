/**
 * EditLayer — SVG overlay for PDF viewer.
 *
 * 두 가지 모드:
 *   setup   — 소유자가 draft 상태에서 필드 배치. fields를 참여자별 색상으로 표시.
 *   signing — 참여자가 in_progress 상태에서 응답 입력. 내 필드는 활성, 타인 필드는 dim.
 *
 * 좌표계 규칙
 * ─────────────────────────────────────────────────────────────
 * DB/state : PDF 포인트 단위, PDF 좌표계 (좌하단 원점, Y↑)
 * SVG      : 화면 픽셀 단위, 브라우저 좌표계 (좌상단 원점, Y↓)
 *
 * PDF → 화면:  screenX = pdfX * sc  |  screenY = (pdfH - pdfY - objH) * sc
 * 화면 → PDF:  pdfX = screenX / sc   |  pdfY = pdfH - (screenY / sc) - objH
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';

const MIN_PT = 10;

// 참여자 인덱스 → 색상
export const PARTICIPANT_COLORS = [
  '#3b82f6', // 0 blue   (소유자 기본)
  '#10b981', // 1 green
  '#f59e0b', // 2 amber
  '#ef4444', // 3 red
  '#8b5cf6', // 4 purple
  '#06b6d4', // 5 cyan
  '#f97316', // 6 orange
  '#84cc16', // 7 lime
];

export function getParticipantColor(index) {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}


export default function EditLayer({
  docId,
  fields,
  setFields,
  participants = [], // [{id, email, name, display_name, is_owner}]
  myParticipantId = null, // signing mode: current user's participant_id
  myResponses = [], // [{field_id, text_value, checked, svg_data, date_value}]
  setMyResponses,
  canvasSize,
  currentPage,
  // setup mode
  isSetupMode = false,
  activeTool = null,
  activeParticipantId = null,
  onToolUsed,
  // signing mode
  activeSignature = null,
  readOnly = false,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const svgRef = useRef(null);
  const interactRef = useRef(null);
  const fieldsRef = useRef(fields);
  const debounceRef = useRef({});
  const autoFocusIdRef = useRef(null);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  // 참여자 ID → 인덱스 매핑 (색상용)
  const participantColorMap = {};
  participants.forEach((p, i) => {
    participantColorMap[p.id] = getParticipantColor(i);
  });

  const getFieldColor = (field) => participantColorMap[field.participant_id] || '#6b7280';

  // ── 좌표 변환 ─────────────────────────────────────────────
  const sc = canvasSize.scale || 1;
  const pdfH = canvasSize.pdfHeight || canvasSize.height / sc;

  const toScreenX = (pdfX) => pdfX * sc;
  const toScreenY = (pdfY, objHpt) => (pdfH - pdfY - objHpt) * sc;
  const toPdfX = (sx) => sx / sc;
  const toPdfY = (sy, objHpt) => pdfH - sy / sc - objHpt;

  const getCanvasPos = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasSize.width / rect.width),
      y: (e.clientY - rect.top) * (canvasSize.height / rect.height),
    };
  };

  // ── Delete key ────────────────────────────────────────────
  const deleteField = useCallback(
    async (id) => {
      try {
        await api.delete(`/documents/${docId}/fields/${id}`);
        setFields((prev) => prev.filter((f) => f.id !== id));
        setSelectedId(null);
      } catch (err) {
        console.error('Field delete error:', err);
      }
    },
    [docId, setFields]
  );

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!selectedId || !isSetupMode) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      deleteField(selectedId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, isSetupMode, deleteField]);

  // ── 클릭으로 필드 배치 (setup mode) ──────────────────────
  const handleSvgClick = async (e) => {
    if (e.target !== svgRef.current) return;
    setSelectedId(null);
    if (!activeTool || !isSetupMode) return;
    if (!activeParticipantId) return;

    const cp = getCanvasPos(e);
    const sizeMap = {
      text: { w: 120, h: 22 },
      checkbox: { w: 16, h: 16 },
      signature: { w: 120, h: 45 },
      date: { w: 90, h: 22 },
    };
    const { w: wPt, h: hPt } = sizeMap[activeTool] || { w: 100, h: 24 };
    const xPt = toPdfX(cp.x) - wPt / 2;
    const yPt = toPdfY(cp.y, 0) - hPt / 2;

    try {
      const { data } = await api.post(`/documents/${docId}/fields`, {
        participant_id: activeParticipantId,
        field_type: activeTool,
        label:
          activeTool === 'text'
            ? '텍스트 입력'
            : activeTool === 'checkbox'
              ? '체크박스'
              : activeTool === 'date'
                ? '날짜'
                : '서명',
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
        page_number: currentPage,
      });
      // 참여자 정보 보강 (백엔드 JOIN 없이도 레이블/색상 즉시 표시)
      const pInfo = participants.find((p) => p.id === activeParticipantId);
      const enriched = {
        ...data,
        participant_email: pInfo?.email ?? null,
        participant_name: pInfo?.display_name || pInfo?.name || null,
        participant_role: pInfo?.role ?? null,
        participant_is_owner: pInfo?.is_owner ?? false,
      };
      if (activeTool === 'text') autoFocusIdRef.current = data.id;
      setFields((prev) => [...prev, enriched]);
      setSelectedId(data.id);
      onToolUsed?.();
    } catch (err) {
      console.error('Field create error:', err);
    }
  };

  // ── 드래그/리사이즈 ───────────────────────────────────────
  const startInteract = (e, id, mode) => {
    e.stopPropagation();
    setSelectedId(id);
    if (!isSetupMode || readOnly) return;
    const cp = getCanvasPos(e);
    const obj = fieldsRef.current.find((f) => f.id === id);
    if (!obj) return;

    interactRef.current = {
      mode,
      id,
      startSX: cp.x,
      startSY: cp.y,
      origX: obj.x,
      origY: obj.y,
      origW: obj.width,
      origH: obj.height,
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

    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== info.id) return f;
        if (info.mode === 'drag') return { ...f, x: info.origX + dxPt, y: info.origY - dyPt };
        const newW = Math.max(MIN_PT, info.origW + dxPt);
        const newH = Math.max(MIN_PT, info.origH + dyPt);
        const deltaH = newH - info.origH;
        return { ...f, width: newW, height: newH, y: info.origY - deltaH };
      })
    );
  };

  const onMouseUp = async () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    const info = interactRef.current;
    interactRef.current = null;
    if (!info) return;
    const field = fieldsRef.current.find((f) => f.id === info.id);
    if (field) {
      api
        .put(`/documents/${docId}/fields/${field.id}`, {
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
        })
        .catch((err) => console.error('Field update error:', err));
    }
  };

  // ── 응답 저장 (signing mode, 디바운스 300ms) ──────────────
  const saveResponse = (fieldId, participantId, payload) => {
    clearTimeout(debounceRef.current[fieldId]);
    debounceRef.current[fieldId] = setTimeout(() => {
      api.put(`/documents/${docId}/fields/${fieldId}/response`, payload).catch((err) => {
        console.error('Response save error:', err);
      });
    }, 300);
  };

  const getResponse = (fieldId) => myResponses.find((r) => r.field_id === fieldId);

  const updateResponse = (fieldId, updates) => {
    setMyResponses((prev) => {
      const idx = prev.findIndex((r) => r.field_id === fieldId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updates };
        return next;
      }
      return [...prev, { field_id: fieldId, ...updates }];
    });
  };

  const handleTextChange = (field, value) => {
    updateResponse(field.id, { text_value: value });
    saveResponse(field.id, myParticipantId, { text_value: value });
  };

  const handleCheckboxToggle = (field) => {
    const current = getResponse(field.id)?.checked ?? false;
    const next = !current;
    updateResponse(field.id, { checked: next });
    saveResponse(field.id, myParticipantId, { checked: next });
  };

  const handleSignaturePlace = (field, sig) => {
    updateResponse(field.id, { svg_data: sig.svg_data, source_sig_id: sig.id });
    api
      .put(`/documents/${docId}/fields/${field.id}/response`, {
        svg_data: sig.svg_data,
        source_sig_id: sig.id,
      })
      .catch((err) => console.error('Sig response error:', err));
  };

  const handleDateChange = (field, value) => {
    updateResponse(field.id, { date_value: value });
    saveResponse(field.id, myParticipantId, { date_value: value });
  };

  // ── Render helpers ────────────────────────────────────────
  const pageFields = fields.filter((f) => (f.page_number || 1) === currentPage);

  const ResizeHandle = ({ sx, sy, id }) => (
    <rect
      x={sx - 5}
      y={sy - 5}
      width={10}
      height={10}
      rx={2}
      fill="white"
      stroke="#6b7280"
      strokeWidth={1.5}
      style={{ cursor: 'nwse-resize' }}
      onMouseDown={(e) => startInteract(e, id, 'resize')}
    />
  );

  const DragHandle = ({ sx, sy, sw, id, color }) => (
    <rect
      x={sx}
      y={sy - 20}
      width={sw}
      height={20}
      fill={color}
      opacity={0.9}
      rx={4}
      style={{ cursor: 'grab' }}
      onMouseDown={(e) => startInteract(e, id, 'drag')}
    />
  );

  return (
    <svg
      ref={svgRef}
      width={canvasSize.width}
      height={canvasSize.height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'visible',
        cursor: activeTool && isSetupMode ? 'crosshair' : 'default',
      }}
      onClick={handleSvgClick}
    >
      {pageFields.map((field) => {
        const isMyField = !isSetupMode && field.participant_id === myParticipantId;
        const isOwnerField = isSetupMode && field.participant_id === activeParticipantId;
        const color = getFieldColor(field);
        const response = getResponse(field.id);

        const sx = toScreenX(field.x);
        const sy = toScreenY(field.y, field.height);
        const sw = toScreenX(field.width);
        const sh = toScreenX(field.height);
        const isSelected = selectedId === field.id;

        // In signing mode: others' fields are shown dimmed
        const isMine = isSetupMode || isMyField;
        const opacity = !isSetupMode && !isMyField ? 0.35 : 1;

        return (
          <g key={field.id} style={{ opacity }}>
            {/* Field background */}
            <rect
              x={sx}
              y={sy}
              width={sw}
              height={sh}
              fill={`${color}18`}
              stroke={color}
              strokeWidth={isSelected ? 2 : 1}
              strokeDasharray={isSetupMode && !isSelected ? '4 2' : 'none'}
              rx={4}
              style={{ cursor: isMine && !readOnly ? 'pointer' : 'default' }}
              onClick={(e) => {
                e.stopPropagation();
                if (isMine) setSelectedId(field.id);
              }}
              onMouseDown={(e) => {
                if (isSetupMode) startInteract(e, field.id, 'drag');
              }}
            />

            {/* Participant label (setup mode, non-selected) */}
            {isSetupMode && !isSelected && (
              <text
                x={sx + 4}
                y={sy + sh - 4}
                fontSize={Math.min(9, sh * 0.45)}
                fill={color}
                opacity={0.8}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {field.participant_name?.split(' ')[0] || field.participant_email?.split('@')[0]}
              </text>
            )}

            {/* Field type icon label (setup mode) */}
            {isSetupMode && (
              <text
                x={sx + sw / 2}
                y={sy + sh / 2 + 4}
                textAnchor="middle"
                fontSize={Math.min(11, sh * 0.45)}
                fill={color}
                opacity={0.75}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {field.field_type === 'text'
                  ? 'Aa'
                  : field.field_type === 'checkbox'
                    ? '☐'
                    : field.field_type === 'signature'
                      ? '✍'
                      : field.field_type === 'date'
                        ? '📅'
                        : ''}
              </text>
            )}

            {/* ── Signing mode: interactive fields ── */}
            {!isSetupMode && isMyField && !readOnly && (
              <>
                {field.field_type === 'text' && (
                  <foreignObject x={sx + 4} y={sy + 2} width={sw - 8} height={sh - 4}>
                    <input
                      xmlns="http://www.w3.org/1999/xhtml"
                      ref={(el) => {
                        if (el && autoFocusIdRef.current === field.id) {
                          el.focus();
                          autoFocusIdRef.current = null;
                        }
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: 'transparent',
                        fontSize: Math.min(14, sh * 0.55),
                        outline: 'none',
                        cursor: 'text',
                      }}
                      value={response?.text_value || ''}
                      placeholder={field.label || '입력'}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(field.id);
                      }}
                      onChange={(e) => handleTextChange(field, e.target.value)}
                    />
                  </foreignObject>
                )}

                {field.field_type === 'date' && (
                  <foreignObject x={sx + 4} y={sy + 2} width={sw - 8} height={sh - 4}>
                    <input
                      xmlns="http://www.w3.org/1999/xhtml"
                      type="date"
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: 'transparent',
                        fontSize: Math.min(11, sh * 0.5),
                        outline: 'none',
                        cursor: 'text',
                      }}
                      value={response?.date_value || ''}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(field.id);
                      }}
                      onChange={(e) => handleDateChange(field, e.target.value)}
                    />
                  </foreignObject>
                )}

                {field.field_type === 'checkbox' && (
                  <g
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckboxToggle(field);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={sx + 2}
                      y={sy + 2}
                      width={sw - 4}
                      height={sh - 4}
                      fill="white"
                      stroke={color}
                      strokeWidth={1.5}
                      rx={3}
                    />
                    {response?.checked && (
                      <text
                        x={sx + sw / 2}
                        y={sy + sh * 0.75}
                        textAnchor="middle"
                        fontSize={sh * 0.65}
                        fill={color}
                      >
                        ✓
                      </text>
                    )}
                  </g>
                )}

                {(field.field_type === 'signature' || field.field_type === 'initial') && (
                  <>
                    {response?.svg_data ? (
                      <image
                        href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(response.svg_data)}`}
                        x={sx}
                        y={sy}
                        width={sw}
                        height={sh}
                        style={{ opacity: 0.92 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(field.id);
                        }}
                      />
                    ) : (
                      <g
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(field.id);
                        }}
                      >
                        <text
                          x={sx + sw / 2}
                          y={sy + sh / 2 + 4}
                          textAnchor="middle"
                          fontSize={Math.min(11, sh * 0.4)}
                          fill={color}
                          opacity={0.7}
                          fontStyle="italic"
                        >
                          서명을 선택하세요
                        </text>
                      </g>
                    )}
                    {/* Sign with active signature */}
                    {isSelected && activeSignature && !response?.svg_data && (
                      <g>
                        <rect
                          x={sx}
                          y={sy + sh + 4}
                          width={sw}
                          height={22}
                          rx={4}
                          fill="var(--color-primary)"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSignaturePlace(field, activeSignature);
                          }}
                        />
                        <text
                          x={sx + sw / 2}
                          y={sy + sh + 18}
                          textAnchor="middle"
                          fontSize={10}
                          fill="white"
                          style={{ pointerEvents: 'none' }}
                        >
                          선택된 서명 적용
                        </text>
                      </g>
                    )}
                    {/* Clear signature */}
                    {isSelected && response?.svg_data && (
                      <g>
                        <rect
                          x={sx}
                          y={sy + sh + 4}
                          width={sw}
                          height={22}
                          rx={4}
                          fill="#ef4444"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateResponse(field.id, { svg_data: null });
                            api.put(`/documents/${docId}/fields/${field.id}/response`, {
                              svg_data: null,
                            });
                          }}
                        />
                        <text
                          x={sx + sw / 2}
                          y={sy + sh + 18}
                          textAnchor="middle"
                          fontSize={10}
                          fill="white"
                          style={{ pointerEvents: 'none' }}
                        >
                          서명 지우기
                        </text>
                      </g>
                    )}
                  </>
                )}
              </>
            )}

            {/* Signing mode read-only: show filled responses */}
            {!isSetupMode && !isMyField && (
              <>
                {field.field_type === 'text' && (
                  <text
                    x={sx + 4}
                    y={sy + sh * 0.72}
                    fontSize={Math.min(12, sh * 0.5)}
                    fill="#333"
                    style={{ pointerEvents: 'none' }}
                  >
                    {/* filled values are embedded in signed PDF; no live preview here */}
                  </text>
                )}
              </>
            )}

            {/* Setup mode: drag handle + delete + resize */}
            {isSetupMode && isSelected && !readOnly && (
              <>
                <DragHandle sx={sx} sy={sy} sw={sw} id={field.id} color={color} />
                <g
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteField(field.id);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={sx + sw} cy={sy} r={9} fill="#ef4444" />
                  <text
                    x={sx + sw}
                    y={sy + 4}
                    textAnchor="middle"
                    fontSize={12}
                    fill="white"
                    style={{ pointerEvents: 'none' }}
                  >
                    ×
                  </text>
                </g>
                <ResizeHandle sx={sx + sw} sy={sy + sh} id={field.id} />
              </>
            )}

            {/* Signing mode: show my completed signature */}
            {!isSetupMode &&
              isMyField &&
              (field.field_type === 'signature' || field.field_type === 'initial') &&
              response?.svg_data && (
                <image
                  href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(response.svg_data)}`}
                  x={sx}
                  y={sy}
                  width={sw}
                  height={sh}
                  style={{ opacity: 0.92 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(field.id);
                  }}
                />
              )}
          </g>
        );
      })}
    </svg>
  );
}
