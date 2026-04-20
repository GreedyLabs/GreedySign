/**
 * TemplateEditorPage — 템플릿의 필드(앵커) 배치 화면.
 *
 * 레이아웃은 문서 에디터(`EditorPage`)와 동일한 `.gs-editor` 그리드를 공유:
 *   - 헤더(.gs-ed-head) · 필드 도구 바(.gs-ed-tool) · 좌(페이지)/중(PDF)/우(정보) 3패널
 *
 * 문서 에디터와의 차이점:
 *   - 참여자(수신자) 개념 없음 — 모든 필드는 캠페인 발송 시 각 수신자에게 복제됨
 *   - 우측 패널은 수신자 역할 안내(1) · 현재 페이지 필드 리스트(2) · 선택된
 *     필드 속성/삭제(3) 세 섹션으로 구성 — EditorPage 의 FieldInspector
 *     ↔ ParticipantList swap 패턴과 달리 여기선 세 섹션이 스택된다.
 *   - 색상 팔레트 단일 컬러, 발송 대신 draft → ready 상태 전환
 *
 * 좌표계: EditorPage와 동일(DB=PDF pt, 화면=px).
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
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api, { ApiError } from '../services/api';
import { API_ENDPOINTS } from '../services/endpoints';
import { useAuthStore } from '../stores/authStore';
import { useNavigate, useParams } from '../lib/router';
import PdfViewer, { type PageRenderedInfo } from '../components/PdfViewer';
import InstantiateTemplateDialog, {
  type TemplateSummary,
} from '../components/templates/InstantiateTemplateDialog';
import type { FieldItem, FieldType, CanvasSize } from '../components/EditLayer';

const MIN_PT = 10;
const TEMPLATE_COLOR = '#3b82f6';

type TemplateStatus = 'draft' | 'ready' | 'archived' | string;

// 템플릿 상세 — 필드 리스트를 포함한다.
interface TemplateDetail extends TemplateSummary {
  status: TemplateStatus;
  page_count?: number;
  fields?: FieldItem[];
  [key: string]: unknown;
}

type ToolId = 'text' | 'checkbox' | 'signature' | 'date';

interface SetupTool {
  id: ToolId;
  label: string;
  icon: string;
}

// ─── Setup tools (EditorPage와 동일한 path 아이콘) ─────────
const SETUP_TOOLS: SetupTool[] = [
  { id: 'text', label: '텍스트', icon: 'M4 4h8M4 8h6M4 12h4' },
  { id: 'checkbox', label: '체크박스', icon: 'M2 3h12v10H2zM5 8l2 2 4-4' },
  { id: 'signature', label: '서명', icon: 'M2 13c2-4 4-7 6-7s2 3 3 5 3 3 5 3' },
  { id: 'date', label: '날짜', icon: 'M2 5h12v9H2zM2 8h12M5 2v3M11 2v3' },
];

const TYPE_LABELS: Record<string, string> = {
  text: '텍스트',
  signature: '서명',
  date: '날짜',
  checkbox: '체크박스',
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.response.data as { error?: string } | undefined;
    return body?.error ?? err.message ?? fallback;
  }
  return fallback;
}

// ─── Field placement SVG overlay ──────────────────────────
// selectedId 는 부모(TemplateEditorPage)에서 주입되어 우측 패널의
// "추가한 필드" 인스펙터와 공유된다. 이전에는 FieldOverlay 내부 로컬
// state 였으나, EditorPage 의 FieldInspector 패턴을 맞추기 위해 끌어올렸다.

type InteractMode = 'drag' | 'resize';

interface InteractInfo {
  mode: InteractMode;
  id: FieldItem['id'];
  startSX: number;
  startSY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
}

interface FieldOverlayProps {
  templateId: string;
  fields: FieldItem[];
  setFields: Dispatch<SetStateAction<FieldItem[]>>;
  canvasSize: CanvasSize;
  currentPage: number;
  activeTool: ToolId | null;
  onToolUsed?: () => void;
  readOnly: boolean;
  selectedId: FieldItem['id'] | null;
  setSelectedId: Dispatch<SetStateAction<FieldItem['id'] | null>>;
}

function FieldOverlay({
  templateId,
  fields,
  setFields,
  canvasSize,
  currentPage,
  activeTool,
  onToolUsed,
  readOnly,
  selectedId,
  setSelectedId,
}: FieldOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const interactRef = useRef<InteractInfo | null>(null);
  const fieldsRef = useRef<FieldItem[]>(fields);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const sc = canvasSize.scale || 1;
  const pdfH = canvasSize.pdfHeight || canvasSize.height / sc;

  const toScreenX = (pdfX: number): number => pdfX * sc;
  const toScreenY = (pdfY: number, objHpt: number): number => (pdfH - pdfY - objHpt) * sc;
  const toPdfX = (sx: number): number => sx / sc;
  const toPdfY = (sy: number, objHpt: number): number => pdfH - sy / sc - objHpt;

  const getCanvasPos = (e: ReactMouseEvent | MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasSize.width / rect.width),
      y: (e.clientY - rect.top) * (canvasSize.height / rect.height),
    };
  };

  const deleteField = useCallback(
    async (id: FieldItem['id']) => {
      try {
        await api.delete(API_ENDPOINTS.templates.fieldRemove(templateId, id as string | number));
        setFields((prev) => prev.filter((f) => f.id !== id));
        setSelectedId(null);
      } catch (err) {
        console.error('Template field delete error:', err);
      }
    },
    [templateId, setFields, setSelectedId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId || readOnly) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      deleteField(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, readOnly, deleteField]);

  const handleSvgClick = async (e: ReactMouseEvent<SVGSVGElement>) => {
    if (e.target !== svgRef.current) return;
    setSelectedId(null);
    if (!activeTool || readOnly) return;

    const cp = getCanvasPos(e);
    const sizeMap: Record<ToolId, { w: number; h: number }> = {
      text: { w: 120, h: 22 },
      checkbox: { w: 16, h: 16 },
      signature: { w: 120, h: 45 },
      date: { w: 90, h: 22 },
    };
    const { w: wPt, h: hPt } = sizeMap[activeTool] || { w: 100, h: 24 };
    const xPt = toPdfX(cp.x) - wPt / 2;
    const yPt = toPdfY(cp.y, 0) - hPt / 2;

    try {
      const { data } = await api.post<FieldItem>(
        API_ENDPOINTS.templates.fields(templateId),
        {
          field_type: activeTool,
          label:
            activeTool === 'text'
              ? '텍스트'
              : activeTool === 'checkbox'
                ? '체크'
                : activeTool === 'date'
                  ? '날짜'
                  : '서명',
          x: xPt,
          y: yPt,
          width: wPt,
          height: hPt,
          page_number: currentPage,
        },
      );
      setFields((prev) => [...prev, data]);
      setSelectedId(data.id);
      onToolUsed?.();
    } catch (err) {
      console.error('Template field create error:', err);
      alert(errorMessage(err, '필드 생성 실패'));
    }
  };

  const onMouseMove = (e: MouseEvent) => {
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
      }),
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
        .put(
          API_ENDPOINTS.templates.fieldUpdate(templateId, field.id as string | number),
          {
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
          },
        )
        .catch((err) => console.error('Template field update error:', err));
    }
  };

  const startInteract = (
    e: ReactMouseEvent,
    id: FieldItem['id'],
    mode: InteractMode,
  ) => {
    e.stopPropagation();
    setSelectedId(id);
    if (readOnly) return;
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
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const pageFields = fields.filter((f) => (f.page_number || 1) === currentPage);

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
        cursor: activeTool && !readOnly ? 'crosshair' : 'default',
      }}
      onClick={handleSvgClick}
    >
      {pageFields.map((field) => {
        const sx = toScreenX(field.x);
        const sy = toScreenY(field.y, field.height);
        const sw = toScreenX(field.width);
        const sh = toScreenX(field.height);
        const isSelected = selectedId === field.id;
        const color = TEMPLATE_COLOR;

        return (
          <g key={field.id}>
            <rect
              x={sx}
              y={sy}
              width={sw}
              height={sh}
              fill={`${color}18`}
              stroke={color}
              strokeWidth={isSelected ? 2 : 1}
              strokeDasharray={!isSelected ? '4 2' : 'none'}
              rx={4}
              style={{ cursor: readOnly ? 'default' : 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(field.id);
              }}
              onMouseDown={(e) => {
                if (!readOnly) startInteract(e, field.id, 'drag');
              }}
            />
            {/* 필드 타입 힌트: OS 이모지 폰트 의존을 피해 타입별 SVG 프리미티브로. */}
            <g
              opacity={0.8}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {field.field_type === 'text' && (
                <text
                  x={sx + sw / 2}
                  y={sy + sh / 2 + 4}
                  textAnchor="middle"
                  fontSize={Math.min(11, sh * 0.45)}
                  fill={color}
                >
                  Aa
                </text>
              )}
              {field.field_type === 'checkbox' && (
                <rect
                  x={sx + sw / 2 - Math.min(7, sh * 0.25)}
                  y={sy + sh / 2 - Math.min(7, sh * 0.25)}
                  width={Math.min(14, sh * 0.5)}
                  height={Math.min(14, sh * 0.5)}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.2}
                  rx={2}
                />
              )}
              {field.field_type === 'signature' && (
                <path
                  // 흘려 쓴 서명 느낌의 짧은 곡선
                  d={`M ${sx + sw * 0.3} ${sy + sh * 0.65}
                      q ${sw * 0.1} ${-sh * 0.4} ${sw * 0.2} 0
                      t ${sw * 0.2} 0`}
                  stroke={color}
                  strokeWidth={1.4}
                  fill="none"
                  strokeLinecap="round"
                />
              )}
              {field.field_type === 'date' && (
                <g
                  stroke={color}
                  strokeWidth={1.2}
                  fill="none"
                  strokeLinecap="round"
                >
                  {/* 달력 아이콘 — 상단 스파이럴 + 본체 + 헤더 라인 */}
                  <rect
                    x={sx + sw / 2 - Math.min(8, sh * 0.3)}
                    y={sy + sh / 2 - Math.min(7, sh * 0.25)}
                    width={Math.min(16, sh * 0.6)}
                    height={Math.min(14, sh * 0.5)}
                    rx={1.5}
                  />
                  <line
                    x1={sx + sw / 2 - Math.min(8, sh * 0.3)}
                    y1={sy + sh / 2 - Math.min(2, sh * 0.08)}
                    x2={sx + sw / 2 + Math.min(8, sh * 0.3)}
                    y2={sy + sh / 2 - Math.min(2, sh * 0.08)}
                  />
                </g>
              )}
            </g>
            {isSelected && !readOnly && (
              <>
                {/* Drag handle */}
                <rect
                  x={sx}
                  y={sy - 20}
                  width={sw}
                  height={20}
                  fill={color}
                  opacity={0.9}
                  rx={4}
                  style={{ cursor: 'grab' }}
                  onMouseDown={(e) => startInteract(e, field.id, 'drag')}
                />
                {/* Delete button */}
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
                {/* Resize handle */}
                <rect
                  x={sx + sw - 5}
                  y={sy + sh - 5}
                  width={10}
                  height={10}
                  rx={2}
                  fill="white"
                  stroke="#6b7280"
                  strokeWidth={1.5}
                  style={{ cursor: 'nwse-resize' }}
                  onMouseDown={(e) => startInteract(e, field.id, 'resize')}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main page ────────────────────────────────────────────
export default function TemplateEditorPage() {
  const params = useParams<{ templateId: string }>();
  const templateId = params.templateId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0, scale: 1.4 });
  const [fields, setFields] = useState<FieldItem[]>([]);
  const [leftOpen, setLeftOpen] = useState<boolean>(true);
  const [rightOpen, setRightOpen] = useState<boolean>(true);
  // 선택된 필드 — FieldOverlay 내부 state 였으나 우측 패널 인스펙터와 공유하기
  // 위해 부모로 끌어올렸다(EditorPage 의 selectedFieldId 와 동일한 패턴).
  const [selectedFieldId, setSelectedFieldId] = useState<FieldItem['id'] | null>(null);
  const [instantiateOpen, setInstantiateOpen] = useState<boolean>(false);

  const { data: template, isLoading } = useQuery<TemplateDetail>({
    queryKey: ['template', templateId],
    queryFn: async () => {
      const { data } = await api.get<TemplateDetail>(API_ENDPOINTS.templates.get(templateId));
      return data;
    },
    enabled: !!templateId,
  });

  useEffect(() => {
    if (template?.fields) setFields(template.fields);
  }, [template]);

  const isDraft = template?.status === 'draft';
  const readOnly = !isDraft;
  const totalPages = template?.page_count || 1;

  const updateMut = useMutation({
    mutationFn: async (patch: Partial<TemplateDetail>) => {
      const { data } = await api.patch<TemplateDetail>(
        API_ENDPOINTS.templates.update(templateId),
        patch,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template', templateId] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const handlePublish = () => {
    if (fields.length === 0) {
      alert('필드를 1개 이상 배치해야 합니다.');
      return;
    }
    if (!template) return;
    if (
      !confirm(
        `"${template.name}"을(를) 배포 가능(ready)으로 전환합니다.\n이후 편집이 제한됩니다.`,
      )
    )
      return;
    updateMut.mutate(
      { status: 'ready' },
      {
        onSuccess: () => navigate(`/campaigns/new?template=${templateId}`),
        onError: (err) => alert(errorMessage(err, '전환 실패')),
      },
    );
  };

  const handleRename = () => {
    const next = prompt('템플릿 이름', template?.name ?? '');
    if (!next || !template || next === template.name) return;
    updateMut.mutate({ name: next });
  };

  const handleRevertToDraft = () => {
    if (!confirm('다시 편집 가능 상태로 되돌리시겠습니까?')) return;
    updateMut.mutate({ status: 'draft' });
  };

  if (isLoading || !template) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className="gs-spinner" />
      </div>
    );
  }

  const editorClass = ['gs-editor', !leftOpen && 'left-closed', !rightOpen && 'right-closed']
    .filter(Boolean)
    .join(' ');

  // 우측 패널용 파생값 — 현재 페이지 필드 리스트/선택된 필드/삭제 핸들러.
  const pageFieldList = fields.filter((f) => (f.page_number || 1) === currentPage);
  const selectedField = selectedFieldId
    ? fields.find((f) => f.id === selectedFieldId)
    : null;
  const handleDeleteSelectedField = async (id: FieldItem['id']) => {
    try {
      await api.delete(API_ENDPOINTS.templates.fieldRemove(templateId, id as string | number));
      setFields((prev) => prev.filter((f) => f.id !== id));
      setSelectedFieldId(null);
    } catch (err) {
      console.error('Template field delete error:', err);
      alert(errorMessage(err, '필드 삭제 실패'));
    }
  };

  return (
    <div className={editorClass}>
      {/* ── Header ── */}
      <div className="gs-ed-head">
        <button
          className="icon-btn"
          onClick={() => navigate('/templates')}
          title="템플릿 목록으로"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="m10 3-5 5 5 5" />
          </svg>
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

        <div className="col flex-1" style={{ minWidth: 0 }}>
          <div className="row gap-2">
            <span
              onClick={isDraft ? handleRename : undefined}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 600,
                cursor: isDraft ? 'pointer' : 'default',
              }}
              className="truncate"
              title={isDraft ? '클릭하여 이름 변경' : template.name}
            >
              {template.name}
            </span>
            {template.status === 'draft' && (
              <span className="badge badge-neutral">초안</span>
            )}
            {template.status === 'ready' && (
              <span className="badge badge-primary">배포 가능</span>
            )}
            {template.status === 'archived' && (
              <span className="badge badge-neutral">보관됨</span>
            )}
            {isDraft && activeTool && (
              <span className="badge badge-primary">
                {SETUP_TOOLS.find((t) => t.id === activeTool)?.label} — PDF 클릭으로 배치
              </span>
            )}
          </div>
          <div className="t-caption" style={{ marginTop: 1 }}>
            {totalPages}페이지 · 필드 {fields.length}개
          </div>
        </div>

        {/* Action buttons */}
        <div className="row gap-2">
          {template.status === 'ready' && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleRevertToDraft}
                disabled={updateMut.isPending}
              >
                편집으로 돌아가기
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setInstantiateOpen(true)}
                title="이 템플릿으로 한 명에게 바로 보내기"
              >
                1:1 발송
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate(`/campaigns/new?template=${templateId}`)}
              >
                캠페인 시작
              </button>
            </>
          )}

          {isDraft && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handlePublish}
              disabled={updateMut.isPending || fields.length === 0}
              title={fields.length === 0 ? '필드를 먼저 배치하세요' : ''}
            >
              {updateMut.isPending ? '처리 중…' : '배포 준비 완료'}
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="gs-ed-tool">
        {isDraft ? (
          <div className="gs-tool-group">
            <button
              className={`gs-tool-btn${activeTool === null ? ' is-active' : ''}`}
              onClick={() => setActiveTool(null)}
              title="선택"
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
                <path d="M3 2v10l4-3 2 5 1.5-.5-2-5 4.5-.5L3 2Z" />
              </svg>
              선택
            </button>
            {SETUP_TOOLS.map((t) => (
              <button
                key={t.id}
                className={`gs-tool-btn${activeTool === t.id ? ' is-active' : ''}`}
                onClick={() => setActiveTool(activeTool === t.id ? null : t.id)}
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
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="t-caption">
            {template.status === 'ready'
              ? '배포 가능 상태에서는 필드를 편집할 수 없습니다. "편집으로 돌아가기"를 누르세요.'
              : '이 템플릿은 편집할 수 없습니다.'}
          </span>
        )}
      </div>

      {/* ── Left: Page thumbnails ── */}
      <div className={`gs-ed-left${leftOpen ? '' : ' is-closed'}`}>
        {leftOpen ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div className="t-eyebrow">페이지</div>
              <button
                className="icon-btn"
                style={{ width: 22, height: 22 }}
                onClick={() => setLeftOpen(false)}
                title="패널 접기"
              >
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="m7.5 2.5-4 3.5 4 3.5" />
                </svg>
              </button>
            </div>
            <div className="gs-thumbs">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const fieldCount = fields.filter((f) => (f.page_number || 1) === p).length;
                return (
                  <div
                    key={p}
                    className={`gs-thumb${currentPage === p ? ' is-active' : ''}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    <div className="gs-thumb-page">
                      {[8, 14, 22, 28, 36, 42, 50, 56].map((top) => (
                        <div key={top} className="gs-thumb-page-line" style={{ top }} />
                      ))}
                    </div>
                    <div className="col gap-1">
                      <div style={{ fontSize: 12, fontWeight: 500 }} className="t-num">
                        p.{p}
                      </div>
                      {fieldCount > 0 && <div className="t-caption">{fieldCount}개 필드</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <button
            onClick={() => setLeftOpen(true)}
            title="페이지 패널 열기"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              gap: 6,
              color: 'var(--color-text-muted)',
            }}
          >
            <svg
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="m4.5 2.5 4 3.5-4 3.5" />
            </svg>
            <span
              style={{
                fontSize: 10,
                writingMode: 'vertical-rl',
                letterSpacing: 1,
                fontWeight: 500,
              }}
            >
              페이지
            </span>
          </button>
        )}
      </div>

      {/* ── Canvas ── */}
      <div className="gs-ed-canvas">
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <PdfViewer
            pdfUrl={`/api${API_ENDPOINTS.templates.pdf(templateId)}`}
            currentPage={currentPage}
            scale={1.4}
            token={token}
            onPageRendered={(info: PageRenderedInfo) => setCanvasSize(info)}
          />
          {canvasSize.width > 0 && (
            <FieldOverlay
              templateId={templateId}
              fields={fields}
              setFields={setFields}
              canvasSize={canvasSize}
              currentPage={currentPage}
              activeTool={activeTool}
              onToolUsed={() => setActiveTool(null)}
              readOnly={readOnly}
              selectedId={selectedFieldId}
              setSelectedId={setSelectedFieldId}
            />
          )}
        </div>
      </div>

      {/* ── Right: Recipient role / page fields / selected field inspector ──
         문서 에디터(EditorPage)의 우측 패널 구조를 미러링한다:
           (1) 수신자 역할 안내(고정 · 템플릿은 단일 역할이므로 타이틀 생략)
           (2) 현재 페이지 필드 리스트(클릭 = 해당 필드 선택)
           (3) 선택된 필드 속성 + 삭제 버튼(FieldInspector 와 동일 톤). */}
      <div
        className={`gs-ed-right${rightOpen ? '' : ' is-closed'}`}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {rightOpen ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px 0',
                flexShrink: 0,
              }}
            >
              <span className="t-eyebrow">
                {selectedField ? '필드 속성' : '템플릿 정보'}
              </span>
              <button
                className="icon-btn"
                style={{ width: 22, height: 22 }}
                onClick={() => setRightOpen(false)}
                title="패널 접기"
              >
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="m4.5 2.5 4 3.5-4 3.5" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
              {/* 1. 수신자 역할 안내 — 타이틀 없이 인포 박스만 */}
              <div
                style={{
                  padding: '12px',
                  background: 'var(--color-primary-subtle, var(--color-bg-subtle))',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.6,
                  marginBottom: 18,
                }}
              >
                템플릿은 단일 역할(수신자 본인)만 지원합니다. 여기서 배치한 필드는 캠페인 발송
                시 수신자 각자의 문서로 복제되며, 수신자 본인이 직접 입력·서명합니다.
              </div>

              {/* 2. 현재 페이지 필드 리스트 */}
              <div style={{ marginBottom: 18 }}>
                <div className="t-eyebrow" style={{ marginBottom: 8 }}>
                  현재 페이지 필드 ({pageFieldList.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pageFieldList.map((f) => {
                    const isActive = selectedFieldId === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedFieldId(f.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: isActive
                            ? 'var(--color-primary-subtle, var(--color-bg-subtle))'
                            : 'var(--color-bg-subtle)',
                          border: `1px solid ${
                            isActive ? TEMPLATE_COLOR : 'transparent'
                          }`,
                          fontSize: 12,
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: TEMPLATE_COLOR,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--color-text)',
                          }}
                        >
                          {f.label || TYPE_LABELS[f.field_type as string]}
                        </span>
                        <span className="t-caption" style={{ fontSize: 10 }}>
                          {TYPE_LABELS[f.field_type as string]}
                        </span>
                      </button>
                    );
                  })}
                  {pageFieldList.length === 0 && (
                    <div
                      className="t-caption"
                      style={{ fontSize: 12, padding: '6px 2px' }}
                    >
                      이 페이지에는 필드가 없습니다.
                    </div>
                  )}
                </div>
              </div>

              {/* 3. 추가한 필드 상세 — 선택 시에만 노출 */}
              {selectedField ? (
                <div
                  style={{
                    paddingTop: 14,
                    borderTop: '1px solid var(--color-border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div className="t-eyebrow">추가한 필드</div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--color-text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      필드 타입
                    </label>
                    <div
                      style={{
                        padding: '8px 10px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-control)',
                        background: 'var(--color-bg-subtle)',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: TEMPLATE_COLOR,
                          flexShrink: 0,
                        }}
                      />
                      {TYPE_LABELS[selectedField.field_type as string] || selectedField.field_type}
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--color-text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      라벨
                    </label>
                    <div
                      style={{
                        padding: '8px 10px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-control)',
                        background: 'var(--color-bg-subtle)',
                        fontSize: 13,
                      }}
                    >
                      {selectedField.label || TYPE_LABELS[selectedField.field_type as string]}
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--color-text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      페이지
                    </label>
                    <div
                      style={{
                        padding: '8px 10px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-control)',
                        background: 'var(--color-bg-subtle)',
                        fontSize: 13,
                      }}
                    >
                      p.{selectedField.page_number || 1}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([
                      ['X', selectedField.x],
                      ['Y', selectedField.y],
                      ['너비', selectedField.width],
                      ['높이', selectedField.height],
                    ] as const).map(([lbl, val]) => (
                      <div key={lbl}>
                        <label
                          style={{
                            display: 'block',
                            fontSize: 11,
                            fontWeight: 500,
                            color: 'var(--color-text-muted)',
                            marginBottom: 4,
                          }}
                        >
                          {lbl}
                        </label>
                        <input
                          className="input"
                          value={Math.round(val * 10) / 10}
                          readOnly
                          style={{
                            width: '100%',
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  {!readOnly && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteSelectedField(selectedField.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      <svg
                        width={13}
                        height={13}
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10" />
                      </svg>
                      필드 삭제
                    </button>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    paddingTop: 14,
                    borderTop: '1px solid var(--color-border-subtle)',
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    lineHeight: 1.55,
                  }}
                >
                  필드를 선택하거나, 상단 도구로 새 필드를 배치하세요.
                </div>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={() => setRightOpen(true)}
            title="정보 패널 열기"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              gap: 6,
              color: 'var(--color-text-muted)',
            }}
          >
            <svg
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="m7.5 2.5-4 3.5 4 3.5" />
            </svg>
            <span
              style={{
                fontSize: 10,
                writingMode: 'vertical-rl',
                letterSpacing: 1,
                fontWeight: 500,
              }}
            >
              정보
            </span>
          </button>
        )}
      </div>

      <InstantiateTemplateDialog
        template={template}
        open={instantiateOpen}
        onClose={() => setInstantiateOpen(false)}
      />
    </div>
  );
}

// Keep types referenced for consumers (avoid unused import warnings on transitive re-exports)
export type { FieldType };
