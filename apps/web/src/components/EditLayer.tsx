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
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from 'react';
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

export function getParticipantColor(index: number): string {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}

export type FieldType =
  | 'text'
  | 'checkbox'
  | 'signature'
  | 'initial'
  | 'date'
  | string;

export interface FieldItem {
  id: number | string;
  participant_id: number | string;
  field_type: FieldType;
  label?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  page_number?: number;
  participant_email?: string | null;
  participant_name?: string | null;
  participant_role?: string | null;
  participant_is_owner?: boolean;
  [key: string]: unknown;
}

export interface EditLayerParticipant {
  id: number | string;
  email?: string | null;
  name?: string | null;
  display_name?: string | null;
  role?: string | null;
  is_owner?: boolean;
  [key: string]: unknown;
}

export interface FieldResponse {
  field_id: number | string;
  text_value?: string | null;
  checked?: boolean | null;
  svg_data?: string | null;
  date_value?: string | null;
  source_sig_id?: number | string | null;
  [key: string]: unknown;
}

export interface ActiveSignature {
  id: number | string;
  svg_data: string;
  [key: string]: unknown;
}

export interface CanvasSize {
  width: number;
  height: number;
  scale?: number;
  pdfHeight?: number;
}

export interface EditLayerProps {
  docId: number | string;
  fields: FieldItem[];
  setFields: Dispatch<SetStateAction<FieldItem[]>>;
  participants?: EditLayerParticipant[];
  myParticipantId?: number | string | null;
  myResponses?: FieldResponse[];
  setMyResponses?: Dispatch<SetStateAction<FieldResponse[]>>;
  allResponses?: FieldResponse[];
  canvasSize: CanvasSize;
  currentPage: number;
  isSetupMode?: boolean;
  activeTool?: FieldType | null;
  activeParticipantId?: number | string | null;
  onToolUsed?: () => void;
  activeSignature?: ActiveSignature | null;
  readOnly?: boolean;
  selectedFieldId?: FieldItem['id'] | null;
  setSelectedFieldId?: Dispatch<SetStateAction<FieldItem['id'] | null>>;
}

interface InteractState {
  mode: 'drag' | 'resize';
  id: FieldItem['id'];
  startSX: number;
  startSY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  aspect: number;
}

export default function EditLayer({
  docId,
  fields,
  setFields,
  participants = [],
  myParticipantId = null,
  myResponses = [],
  setMyResponses,
  allResponses = [],
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
  // 외부에서 선택 상태를 끌어올려 관리(우측 사이드바 필드 속성 패널용).
  // 미지정 시 내부 state로 폴백 — signing/viewer 모드 하위호환.
  selectedFieldId = undefined,
  setSelectedFieldId = undefined,
}: EditLayerProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<FieldItem['id'] | null>(
    null,
  );
  const selectedId =
    selectedFieldId !== undefined ? selectedFieldId : internalSelectedId;
  const setSelectedId: Dispatch<SetStateAction<FieldItem['id'] | null>> =
    setSelectedFieldId ?? setInternalSelectedId;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const interactRef = useRef<InteractState | null>(null);
  const fieldsRef = useRef<FieldItem[]>(fields);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const autoFocusIdRef = useRef<FieldItem['id'] | null>(null);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  // 참여자 ID → 인덱스 매핑 (색상용)
  const participantColorMap: Record<string, string> = {};
  participants.forEach((p, i) => {
    participantColorMap[String(p.id)] = getParticipantColor(i);
  });

  const getFieldColor = (field: FieldItem): string =>
    participantColorMap[String(field.participant_id)] || '#6b7280';

  // ── 좌표 변환 ─────────────────────────────────────────────
  const sc = canvasSize.scale || 1;
  const pdfH = canvasSize.pdfHeight || canvasSize.height / sc;

  const toScreenX = (pdfX: number) => pdfX * sc;
  const toScreenY = (pdfY: number, objHpt: number) => (pdfH - pdfY - objHpt) * sc;
  const toPdfX = (sx: number) => sx / sc;
  const toPdfY = (sy: number, objHpt: number) => pdfH - sy / sc - objHpt;

  const getCanvasPos = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) * (canvasSize.width / rect.width),
      y: (e.clientY - rect.top) * (canvasSize.height / rect.height),
    };
  };

  // ── Delete key ────────────────────────────────────────────
  const deleteField = useCallback(
    async (id: FieldItem['id']) => {
      try {
        await api.delete(`/documents/${docId}/fields/${id}`);
        setFields((prev) => prev.filter((f) => f.id !== id));
        setSelectedId(null);
      } catch (err) {
        console.error('Field delete error:', err);
      }
    },
    [docId, setFields, setSelectedId],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedId || !isSetupMode) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      deleteField(selectedId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, isSetupMode, deleteField]);

  // ── 클릭으로 필드 배치 (setup mode) ──────────────────────
  const handleSvgClick = async (e: ReactMouseEvent<SVGSVGElement>) => {
    if (e.target !== svgRef.current) return;
    setSelectedId(null);
    if (!activeTool || !isSetupMode) return;
    if (!activeParticipantId) return;

    const cp = getCanvasPos(e);
    const sizeMap: Record<string, { w: number; h: number }> = {
      text: { w: 120, h: 22 },
      checkbox: { w: 16, h: 16 },
      signature: { w: 120, h: 45 },
      date: { w: 90, h: 22 },
    };
    const { w: wPt, h: hPt } = sizeMap[activeTool] || { w: 100, h: 24 };
    const xPt = toPdfX(cp.x) - wPt / 2;
    const yPt = toPdfY(cp.y, 0) - hPt / 2;

    try {
      const { data } = await api.post<FieldItem>(`/documents/${docId}/fields`, {
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
      const enriched: FieldItem = {
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
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const info = interactRef.current;
      if (!info) return;
      const cp = getCanvasPos(e);
      const dxPt = (cp.x - info.startSX) / sc;
      const dyPt = (cp.y - info.startSY) / sc;

      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== info.id) return f;
          if (info.mode === 'drag')
            return { ...f, x: info.origX + dxPt, y: info.origY - dyPt };
          const newW = Math.max(MIN_PT, info.origW + dxPt);
          const newH = Math.max(MIN_PT, info.origH + dyPt);
          const deltaH = newH - info.origH;
          return { ...f, width: newW, height: newH, y: info.origY - deltaH };
        }),
      );
    },
    // getCanvasPos depends on canvasSize/svgRef; sc depends on canvasSize.
    // Intentionally omit canvasSize to keep the listener stable while dragging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setFields, sc],
  );

  const onMouseUp = useCallback(async () => {
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
  }, [docId, onMouseMove]);

  const startInteract = (
    e: ReactMouseEvent<SVGElement>,
    id: FieldItem['id'],
    mode: 'drag' | 'resize',
  ) => {
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

  // ── 응답 저장 (signing mode, 디바운스 300ms) ──────────────
  const saveResponse = (
    fieldId: FieldItem['id'],
    _participantId: number | string | null,
    payload: Partial<FieldResponse>,
  ) => {
    const key = String(fieldId);
    const existing = debounceRef.current[key];
    if (existing) clearTimeout(existing);
    debounceRef.current[key] = setTimeout(() => {
      api
        .put(`/documents/${docId}/fields/${fieldId}/response`, payload)
        .catch((err) => {
          console.error('Response save error:', err);
        });
    }, 300);
  };

  // 응답 조회: 내 응답(편집 중인 로컬 상태)이 우선이고, 없으면 다른 참여자의
  // 응답을 allResponses 에서 찾아 돌려준다. 이렇게 해야 "내 서명은 방금 내가
  // 그린 것"이 보이고, "다른 서명자가 이미 그려 둔 서명/체크/텍스트/날짜" 도
  // 같이 보인다 (특히 소유자 선-서명 시나리오 커버).
  const getResponse = (fieldId: FieldItem['id']): FieldResponse | undefined => {
    const mine = myResponses.find((r) => r.field_id === fieldId);
    if (mine) return mine;
    return allResponses.find((r) => r.field_id === fieldId);
  };

  const updateResponse = (
    fieldId: FieldItem['id'],
    updates: Partial<FieldResponse>,
  ) => {
    if (!setMyResponses) return;
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

  const handleTextChange = (field: FieldItem, value: string) => {
    updateResponse(field.id, { text_value: value });
    saveResponse(field.id, myParticipantId, { text_value: value });
  };

  const handleCheckboxToggle = (field: FieldItem) => {
    const current = getResponse(field.id)?.checked ?? false;
    const next = !current;
    updateResponse(field.id, { checked: next });
    saveResponse(field.id, myParticipantId, { checked: next });
  };

  const handleSignaturePlace = (field: FieldItem, sig: ActiveSignature) => {
    updateResponse(field.id, { svg_data: sig.svg_data, source_sig_id: sig.id });
    api
      .put(`/documents/${docId}/fields/${field.id}/response`, {
        svg_data: sig.svg_data,
        source_sig_id: sig.id,
      })
      .catch((err) => console.error('Sig response error:', err));
  };

  const handleDateChange = (field: FieldItem, value: string) => {
    updateResponse(field.id, { date_value: value });
    saveResponse(field.id, myParticipantId, { date_value: value });
  };

  // ── Render helpers ────────────────────────────────────────
  const pageFields = fields.filter((f) => (f.page_number || 1) === currentPage);

  // ── Design-package 필드 스타일 ────────────────────────────
  //   - 참여자 색상 기반 "배정 칩" (좌상단, 14px 높이, 색상 bg + 흰 텍스트)
  //   - 우하단 정사각 리사이즈 핸들 (color-filled 8×8, rx 1)
  //   - 드래그는 필드 본체 전체에서 (별도 핸들 없음 — 디자인 참조)
  const ResizeHandle = ({
    sx,
    sy,
    id,
    color,
  }: {
    sx: number;
    sy: number;
    id: FieldItem['id'];
    color: string;
  }) => (
    <rect
      x={sx - 4}
      y={sy - 4}
      width={8}
      height={8}
      rx={1}
      fill={color}
      style={{ cursor: 'nwse-resize' }}
      onMouseDown={(e) => startInteract(e, id, 'resize')}
    />
  );

  // 필드 타입 라벨 (배정 칩에 "이름 · 타입" 로 표기)
  const fieldTypeLabel = (t: FieldType): string =>
    t === 'signature'
      ? '서명'
      : t === 'initial'
        ? '이니셜'
        : t === 'text'
          ? '텍스트'
          : t === 'checkbox'
            ? '체크박스'
            : t === 'date'
              ? '날짜'
              : String(t);

  const AssigneeChip = ({
    sx,
    sy,
    field,
    color,
  }: {
    sx: number;
    sy: number;
    field: FieldItem;
    color: string;
  }) => {
    const displayName =
      field.participant_name?.split(' ')[0] ||
      field.participant_email?.split('@')[0] ||
      '할당';
    const label = `${displayName} · ${fieldTypeLabel(field.field_type)}`;
    // foreignObject 로 HTML chip 사용 — padding/letterspacing 이 SVG text 보다 표현력 높음
    return (
      <foreignObject
        x={sx - 1}
        y={sy - 20}
        width={Math.max(120, label.length * 9)}
        height={20}
        style={{ overflow: 'visible' }}
      >
        <div
          {...({ xmlns: "http://www.w3.org/1999/xhtml" } as unknown as Record<string, unknown>)}
          style={{
            display: 'inline-block',
            background: color,
            color: '#fff',
            fontSize: 10,
            fontWeight: 500,
            padding: '1px 6px',
            borderRadius: 2,
            lineHeight: 1.4,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {label}
        </div>
      </foreignObject>
    );
  };

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
        const color = getFieldColor(field);
        const response = getResponse(field.id);

        const sx = toScreenX(field.x);
        const sy = toScreenY(field.y, field.height);
        const sw = toScreenX(field.width);
        const sh = toScreenX(field.height);
        const isSelected = selectedId === field.id;

        // In signing mode: others' fields are shown dimmed, my fields stay vivid.
        // 단, 다른 참여자가 이미 응답(서명/체크/텍스트/날짜)을 남겨둔 경우엔
        // 그 결과가 뚜렷이 보이도록 dim 을 적용하지 않는다.
        const hasForeignResponse =
          !isSetupMode &&
          !isMyField &&
          response &&
          (response.svg_data ||
            response.text_value ||
            response.checked ||
            response.date_value);
        const isMine = isSetupMode || isMyField;
        const opacity = !isSetupMode && !isMyField && !hasForeignResponse ? 0.35 : 1;

        // 배경/테두리 스타일 분기
        //   - 선택:          bg 14% (24hex), 2px ring
        //   - setup 비선택:  bg  8% (14hex), dashed
        //   - signing 내 필드 비선택: bg 16% (28hex) + 실선 2px — 강조
        //   - signing 타인 비선택:    bg  8% (14hex) + 실선 1.5px
        let bgAlphaHex: string;
        let strokeWidth: number;
        if (isSelected) {
          bgAlphaHex = '24';
          strokeWidth = 1.5;
        } else if (!isSetupMode && isMyField) {
          bgAlphaHex = '28';
          strokeWidth = 2;
        } else {
          bgAlphaHex = '14';
          strokeWidth = 1.5;
        }

        return (
          <g key={field.id} style={{ opacity }}>
            {/* Selection ring (outside) */}
            {isSelected && (
              <rect
                x={sx - 2}
                y={sy - 2}
                width={sw + 4}
                height={sh + 4}
                rx={5}
                fill="none"
                stroke={color}
                strokeWidth={2}
                opacity={0.18}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Field background */}
            <rect
              x={sx}
              y={sy}
              width={sw}
              height={sh}
              fill={`${color}${bgAlphaHex}`}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={isSetupMode && !isSelected ? '4 2' : 'none'}
              rx={3}
              style={{ cursor: isMine && !readOnly ? 'pointer' : 'default' }}
              onClick={(e) => {
                e.stopPropagation();
                if (isMine) setSelectedId(field.id);
              }}
              onMouseDown={(e) => {
                if (isSetupMode) startInteract(e, field.id, 'drag');
              }}
            />

            {/* 필드 본체 안의 타입 힌트 (setup 모드, 비어있을 때) */}
            {isSetupMode && (
              <text
                x={sx + sw / 2}
                y={sy + sh / 2 + 4}
                textAnchor="middle"
                fontSize={Math.min(11, sh * 0.45)}
                fill={color}
                opacity={0.8}
                style={{
                  pointerEvents: 'none',
                  userSelect: 'none',
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                }}
              >
                {fieldTypeLabel(field.field_type)}
              </text>
            )}

            {/* ── Signing mode: interactive fields ── */}
            {!isSetupMode && isMyField && !readOnly && (
              <>
                {field.field_type === 'text' && (
                  <foreignObject x={sx + 4} y={sy + 2} width={sw - 8} height={sh - 4}>
                    <input
                      {...({ xmlns: "http://www.w3.org/1999/xhtml" } as unknown as Record<string, unknown>)}
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
                      {...({ xmlns: "http://www.w3.org/1999/xhtml" } as unknown as Record<string, unknown>)}
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
                      // 체크마크: OS 폰트 편차를 피해 SVG path 로 직접 그린다.
                      <path
                        d={`M ${sx + sw * 0.28} ${sy + sh * 0.55}
                            l ${sw * 0.14} ${sh * 0.18}
                            l ${sw * 0.3} ${-sh * 0.32}`}
                        stroke={color}
                        strokeWidth={Math.max(1.4, sh * 0.12)}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </g>
                )}

                {(field.field_type === 'signature' ||
                  field.field_type === 'initial') && (
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

            {/* 다른 참여자의 응답, 또는 내가 이미 서명을 끝낸 뒤(readOnly)의 내 응답을 보여준다.
                인터랙티브 분기(`!readOnly && isMyField`)와 상호배타. */}
            {!isSetupMode && (!isMyField || readOnly) && (
              <>
                {field.field_type === 'text' && response?.text_value && (
                  <text
                    x={sx + 4}
                    y={sy + sh * 0.72}
                    fontSize={Math.min(12, sh * 0.5)}
                    fill="#1f2937"
                    style={{ pointerEvents: 'none' }}
                  >
                    {response.text_value}
                  </text>
                )}

                {field.field_type === 'date' && response?.date_value && (
                  <text
                    x={sx + 4}
                    y={sy + sh * 0.72}
                    fontSize={Math.min(11, sh * 0.5)}
                    fill="#1f2937"
                    style={{ pointerEvents: 'none' }}
                  >
                    {response.date_value}
                  </text>
                )}

                {field.field_type === 'checkbox' && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={sx + 2}
                      y={sy + 2}
                      width={sw - 4}
                      height={sh - 4}
                      fill="white"
                      stroke={color}
                      strokeWidth={1.2}
                      rx={3}
                    />
                    {response?.checked && (
                      // 체크마크: OS 폰트 편차를 피해 SVG path 로 직접 그린다.
                      <path
                        d={`M ${sx + sw * 0.28} ${sy + sh * 0.55}
                            l ${sw * 0.14} ${sh * 0.18}
                            l ${sw * 0.3} ${-sh * 0.32}`}
                        stroke={color}
                        strokeWidth={Math.max(1.4, sh * 0.12)}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </g>
                )}

                {(field.field_type === 'signature' ||
                  field.field_type === 'initial') &&
                  response?.svg_data && (
                    <image
                      href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(response.svg_data)}`}
                      x={sx}
                      y={sy}
                      width={sw}
                      height={sh}
                      style={{ opacity: 0.92, pointerEvents: 'none' }}
                    />
                  )}
              </>
            )}

            {/* Setup 모드 · 선택됨: 배정 칩(좌상단) + 리사이즈 핸들(우하단).
                삭제는 우측 사이드바 "필드 속성" 패널로 이동. */}
            {isSetupMode && isSelected && !readOnly && (
              <>
                <AssigneeChip sx={sx} sy={sy} field={field} color={color} />
                <ResizeHandle sx={sx + sw} sy={sy + sh} id={field.id} color={color} />
              </>
            )}

            {/* Signing 모드: 내 차례 필드 상단에 식별 칩 — "서명자 색상 배경 + 타입 라벨".
                응답이 아직 없는 내 필드에만 표시해 "여기 채워야 함" 을 강조. */}
            {!isSetupMode &&
              isMyField &&
              !readOnly &&
              !response?.svg_data &&
              !response?.text_value &&
              !response?.checked &&
              !response?.date_value && (
                <foreignObject
                  x={sx - 1}
                  y={sy - 20}
                  width={Math.max(110, 90)}
                  height={20}
                  style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                  <div
                    {...({ xmlns: "http://www.w3.org/1999/xhtml" } as unknown as Record<string, unknown>)}
                    style={{
                      display: 'inline-block',
                      background: color,
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 2,
                      lineHeight: 1.4,
                      letterSpacing: '0.02em',
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    내 차례 · {fieldTypeLabel(field.field_type)}
                  </div>
                </foreignObject>
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
