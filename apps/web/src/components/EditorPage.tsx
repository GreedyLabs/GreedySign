/**
 * EditorPage — PDF 문서 편집/서명 페이지.
 *
 * 두 가지 모드:
 *   setup   — 소유자가 draft 문서에서 참여자별 필드 배치 → "발송" 버튼으로 in_progress 전환
 *   signing — in_progress 문서에서 참여자가 자신에게 할당된 필드 응답 → "서명 완료" 제출
 *
 * 소유자도 signer인 경우 setup 단계에서 발송 후 signing 모드로 진입해 자신의 필드를 채움.
 */
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { ApiError } from '../services/api';
import { useDocSSE } from '../contexts/SSEContext';
import type { SseEvent } from '../contexts/SSEContext';
import { useAuthStore } from '../stores/authStore';
import { useNavigate, useParams } from '../lib/router';
import PdfViewer from './PdfViewer';
import type { PageRenderedInfo } from './PdfViewer';
import EditLayer, { getParticipantColor } from './EditLayer';
import type {
  FieldItem,
  FieldResponse,
  EditLayerParticipant,
  ActiveSignature,
  CanvasSize,
  FieldType,
} from './EditLayer';
import SignatureModal from './SignatureModal';
import type { SignatureRecord } from './SignatureModal';
import ShareModal from './ShareModal';
import { DOCS_QUERY_KEY } from '../hooks/useDocs';

// ─── Types ────────────────────────────────────────────────
type DocStatus = 'draft' | 'in_progress' | 'completed' | 'voided' | string;
type SigningStatusValue = 'not_started' | 'in_progress' | 'completed' | 'declined' | string;

interface DocResponse {
  id: number | string;
  name?: string;
  status?: DocStatus;
  is_owner?: boolean;
  page_count?: number;
  participant_id?: number | string | null;
  my_signing_status?: SigningStatusValue;
  fields?: FieldItem[];
  myResponses?: FieldResponse[];
  allResponses?: FieldResponse[];
  [key: string]: unknown;
}

interface EditorParticipant extends EditLayerParticipant {
  signing_status?: SigningStatusValue;
}

type ZoomMode = 'fit-height' | 'fit-width' | number;

interface PdfPageSize {
  pdfWidth: number;
  pdfHeight: number;
}

// ─── Icon helper ──────────────────────────────────────────
interface IconProps {
  d: string;
  size?: number;
}

function Icon({ d, size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// ─── Participant badge ────────────────────────────────────
interface ParticipantBadgeProps {
  name: string;
  color: string;
  selected?: boolean;
  onClick?: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ParticipantBadge({ name, color, selected, onClick }: ParticipantBadgeProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 20,
        border: `1.5px solid ${selected ? color : 'transparent'}`,
        background: selected ? `${color}18` : 'transparent',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: selected ? 600 : 400,
        color: selected ? color : 'var(--color-text-secondary)',
        transition: 'all 0.12s',
      }}
    >
      <span
        style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
      />
      {name}
    </button>
  );
}

// ─── Participant Panel (setup mode sidebar) ───────────────
// field_count 는 API 응답에 포함된 서버 카운트이지만 에디터에서 필드 추가/삭제 시
// 서버 재요청 없이 로컬 state(fields)에서 파생해 실시간으로 반영한다.
interface ParticipantListProps {
  participants: EditorParticipant[];
  selectedId: number | string | null;
  onSelect: (id: number | string) => void;
  fields?: FieldItem[];
}

function ParticipantList({
  participants,
  selectedId,
  onSelect,
  fields = [],
}: ParticipantListProps) {
  // participant_id → field 개수 맵
  const liveFieldCount = fields.reduce<Record<string, number>>((acc, f) => {
    if (f.participant_id) {
      const key = String(f.participant_id);
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});
  return (
    <div className="col gap-2" style={{ padding: '8px 0' }}>
      {participants.map((p, i) => {
        const color = getParticipantColor(i);
        const isSelected = p.id === selectedId;
        const count = liveFieldCount[String(p.id)] ?? 0;
        return (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 16px',
              cursor: 'pointer',
              background: isSelected ? `${color}12` : 'transparent',
              borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }}
            />
            <div className="col" style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: isSelected ? color : 'var(--color-text)',
                }}
                className="truncate"
              >
                {p.display_name || p.email}
              </div>
              <div className="t-caption">
                {p.is_owner ? '소유자' : p.role === 'cc' ? '참조' : '서명자'}
                {' · '}
                {count}개 필드
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Field Inspector (setup mode: 우측 사이드바에서 선택된 필드의
//     타입 · 할당 대상 · 좌표 · 필수 여부 · 삭제 버튼 제공) ──
interface FieldInspectorProps {
  field: FieldItem | null;
  participants: EditorParticipant[];
  onDelete?: (id: FieldItem['id']) => void;
  onChangeAssignee?: (id: FieldItem['id'], newParticipantId: number | string) => void;
  onToggleRequired?: (id: FieldItem['id'], required: boolean) => void;
}

function FieldInspector({
  field,
  participants,
  onDelete,
  onChangeAssignee,
  onToggleRequired,
}: FieldInspectorProps) {
  if (!field) {
    return (
      <div
        style={{
          padding: '16px',
          fontSize: 12,
          color: 'var(--color-text-muted)',
          lineHeight: 1.55,
        }}
      >
        필드를 선택하거나, 좌측 도구로 새 필드를 배치하세요.
      </div>
    );
  }
  const typeLabel =
    field.field_type === 'signature'
      ? '서명'
      : field.field_type === 'initial'
        ? '이니셜'
        : field.field_type === 'text'
          ? '텍스트'
          : field.field_type === 'checkbox'
            ? '체크박스'
            : field.field_type === 'date'
              ? '날짜'
              : field.field_type;
  const assigneeIdx = participants.findIndex((p) => p.id === field.participant_id);
  const assigneeColor = assigneeIdx >= 0 ? getParticipantColor(assigneeIdx) : '#6b7280';
  const coordRows: Array<[string, number]> = [
    ['X', field.x],
    ['Y', field.y],
    ['너비', field.width],
    ['높이', field.height],
  ];
  const isRequired = (field as { required?: boolean }).required !== false;
  return (
    <div className="col gap-3" style={{ padding: '12px 16px 16px' }}>
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
              background: assigneeColor,
              flexShrink: 0,
            }}
          />
          {typeLabel}
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
          할당 대상
        </label>
        <select
          className="input"
          value={field.participant_id || ''}
          onChange={(e) => onChangeAssignee?.(field.id, e.target.value)}
          style={{ width: '100%', fontSize: 13 }}
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name || p.name || p.email}
              {p.is_owner ? ' (소유자)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {coordRows.map(([lbl, val]) => (
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
              style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
            />
          </div>
        ))}
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12.5,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(e) => onToggleRequired?.(field.id, e.target.checked)}
        />
        필수 입력
      </label>
      <button
        className="btn btn-danger btn-sm"
        onClick={() => onDelete?.(field.id)}
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
    </div>
  );
}

// ─── Signing status panel (signing mode) ─────────────────
interface SigningStatusPanelProps {
  participants: EditorParticipant[];
  myParticipantId: number | string | null;
}

function SigningStatusPanel({ participants, myParticipantId }: SigningStatusPanelProps) {
  const statusMap: Record<string, { label: string; cls: string }> = {
    not_started: { label: '대기', cls: 'badge-neutral' },
    in_progress: { label: '진행중', cls: 'badge-warning' },
    completed: { label: '완료', cls: 'badge-success' },
    declined: { label: '거부', cls: 'badge-danger' },
  };
  return (
    <div className="col gap-1" style={{ padding: '12px 0' }}>
      <div className="t-eyebrow" style={{ padding: '0 16px', marginBottom: 4 }}>
        서명 현황
      </div>
      {participants.map((p, i) => {
        const color = getParticipantColor(i);
        const key = p.signing_status ? String(p.signing_status) : 'not_started';
        const st = statusMap[key] || {
          label: p.signing_status ?? '대기',
          cls: 'badge-neutral',
        };
        const isMe = p.id === myParticipantId;
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 16px',
              background: isMe ? `${color}0a` : 'transparent',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: isMe ? 600 : 400 }} className="truncate">
                {p.display_name || p.email}
                {isMe ? ' (나)' : ''}
              </div>
            </div>
            <span className={`badge ${st.cls}`} style={{ fontSize: 10, padding: '2px 6px' }}>
              {st.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.response.data as { error?: string } | undefined;
    return body?.error ?? err.message ?? fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

// ─── EditorPage ───────────────────────────────────────────
export default function EditorPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const [fields, setFields] = useState<FieldItem[]>([]);
  const [participants, setParticipants] = useState<EditorParticipant[]>([]);
  const [myResponses, setMyResponses] = useState<FieldResponse[]>([]);
  // 모든 참여자의 응답(읽기 전용). 다른 사람이 이미 채운 서명/체크박스/텍스트/날짜를
  // 현재 사용자 화면에도 반영하기 위한 출처 데이터.
  const [allResponses, setAllResponses] = useState<FieldResponse[]>([]);
  const [myParticipantId, setMyParticipantId] = useState<number | string | null>(null);

  // Viewer state
  const [currentPage, setCurrentPage] = useState(1);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 800, height: 1000 });
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-height');
  const [scale, setScale] = useState(1.4);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const pdfPageSizeRef = useRef<PdfPageSize>({ pdfWidth: 595, pdfHeight: 842 });
  const pdfFirstRenderRef = useRef(false);

  // Setup mode state
  const [activeTool, setActiveTool] = useState<FieldType | null>(null);
  const [activeParticipantId, setActiveParticipantId] = useState<number | string | null>(null);
  // 선택된 필드 — EditLayer 내부 상태를 EditorPage로 끌어올려 우측 사이드바의
  // "필드 속성" 패널(필드 타입 · 할당 대상 · 좌표 · 삭제)과 동기화한다.
  const [selectedFieldId, setSelectedFieldId] = useState<FieldItem['id'] | null>(null);

  // ── 필드 조작 helpers (사이드바에서 호출) ──
  const deleteSelectedField = useCallback(
    async (id: FieldItem['id']) => {
      try {
        await api.delete(`/documents/${docId}/fields/${id}`);
        setFields((prev) => prev.filter((f) => f.id !== id));
        if (selectedFieldId === id) setSelectedFieldId(null);
      } catch (err) {
        console.error('Field delete error:', err);
      }
    },
    [docId, selectedFieldId],
  );

  const changeFieldAssignee = useCallback(
    async (id: FieldItem['id'], newParticipantId: number | string) => {
      const pInfo = participants.find((p) => p.id === newParticipantId);
      setFields((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                participant_id: newParticipantId,
                participant_email: pInfo?.email ?? null,
                participant_name: pInfo?.display_name || pInfo?.name || null,
                participant_role: pInfo?.role ?? null,
                participant_is_owner: pInfo?.is_owner ?? false,
              }
            : f,
        ),
      );
      try {
        await api.put(`/documents/${docId}/fields/${id}`, {
          participant_id: newParticipantId,
        });
      } catch (err) {
        console.error('Field assignee change error:', err);
      }
    },
    [docId, participants],
  );

  const toggleFieldRequired = useCallback(
    async (id: FieldItem['id'], required: boolean) => {
      setFields((prev) =>
        prev.map((f) => (f.id === id ? ({ ...f, required } as FieldItem) : f)),
      );
      try {
        await api.put(`/documents/${docId}/fields/${id}`, { required });
      } catch (err) {
        console.error('Field required toggle error:', err);
      }
    },
    [docId],
  );

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  // Signing mode state
  const [activeSignature, setActiveSignature] = useState<ActiveSignature | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);

  // Panel collapse state
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Participant modal (setup mode)
  const [showParticipantModal, setShowParticipantModal] = useState(false);

  // Action state
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Document query ─────────────────────────────────────
  const {
    data: doc,
    isLoading,
    error: docError,
  } = useQuery<DocResponse>({
    queryKey: ['document', docId],
    queryFn: async () => {
      const { data } = await api.get<DocResponse>(`/documents/${docId}`);
      return data;
    },
  });

  const { data: signatures = [] } = useQuery<SignatureRecord[]>({
    queryKey: ['signatures'],
    queryFn: async () => {
      const { data } = await api.get<SignatureRecord[]>('/signatures');
      return data;
    },
  });

  // Load participants (setup · signing · completed 모두 공통 — 서명 현황 패널에 사용).
  // 백엔드에서 accepted 참여자에게도 GET /participants 를 허용하므로 서명자 입장에서도
  // 동일한 목록을 그대로 사용한다.
  useEffect(() => {
    if (!doc) return;
    setFields(doc.fields || []);
    setMyResponses(doc.myResponses || []);
    setAllResponses(doc.allResponses || []);
    setMyParticipantId(doc.participant_id ?? null);

    api
      .get<EditorParticipant[]>(`/documents/${docId}/participants`)
      .then(({ data }) => {
        setParticipants(data);
        // setup 모드: 첫 참여자를 기본 선택.
        if (doc.status === 'draft' && doc.is_owner && !activeParticipantId && data.length > 0) {
          setActiveParticipantId(data[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.status]);

  // Set default sig for signing mode
  useEffect(() => {
    if (signatures.length && !activeSignature) {
      const def =
        (signatures.find((s) => (s as { is_default?: boolean }).is_default) as
          | SignatureRecord
          | undefined) || signatures[0];
      if (def && def.svg_data) {
        setActiveSignature({ id: def.id, svg_data: def.svg_data });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatures]);

  // ── SSE ────────────────────────────────────────────────
  const handleSseEvent = useCallback(
    (msg: SseEvent) => {
      if (msg.type === 'signing_status_changed' || msg.type === 'document_completed') {
        queryClient.invalidateQueries({ queryKey: ['document', docId] });
        queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      }
    },
    [docId, queryClient],
  );
  useDocSSE(docId ?? null, handleSseEvent);

  // ── Zoom ───────────────────────────────────────────────
  const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const calcFitScale = useCallback((mode: ZoomMode) => {
    const container = viewerContainerRef.current;
    if (!container) return 1.4;
    const { pdfWidth, pdfHeight } = pdfPageSizeRef.current;
    const pad = 64;
    return mode === 'fit-height'
      ? (container.clientHeight - pad) / pdfHeight
      : mode === 'fit-width'
        ? (container.clientWidth - pad) / pdfWidth
        : 1.4;
  }, []);

  useEffect(() => {
    const el = viewerContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setZoomMode((prev) => {
        if (prev === 'fit-height' || prev === 'fit-width') setScale(calcFitScale(prev));
        return prev;
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [calcFitScale]);

  const applyZoom = (mode: ZoomMode) => {
    setZoomMode(mode);
    setDropdownOpen(false);
    if (mode === 'fit-height' || mode === 'fit-width') setScale(calcFitScale(mode));
    else if (typeof mode === 'number') setScale(mode);
  };

  const stepZoom = (dir: 1 | -1) => {
    if (dir === 1) {
      const next = ZOOM_STEPS.find((s) => s > scale + 0.01);
      applyZoom(next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    } else {
      const next = [...ZOOM_STEPS].reverse().find((s) => s < scale - 0.01);
      applyZoom(next ?? ZOOM_STEPS[0]);
    }
  };

  const zoomLabel =
    zoomMode === 'fit-height'
      ? '높이 맞춤'
      : zoomMode === 'fit-width'
        ? '너비 맞춤'
        : `${Math.round(scale * 100)}%`;

  // ── Page ───────────────────────────────────────────────
  const handlePageChange = (p: number) => {
    if (p < 1 || p > (doc?.page_count || 1)) return;
    setCurrentPage(p);
  };

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const el = viewerContainerRef.current;
      if (!el) return;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const atTop = el.scrollTop <= 4;
      if (e.deltaY > 0 && atBottom) {
        e.preventDefault();
        setCurrentPage((p) => Math.min(p + 1, doc?.page_count || 1));
        el.scrollTop = 0;
      } else if (e.deltaY < 0 && atTop) {
        e.preventDefault();
        setCurrentPage((p) => Math.max(p - 1, 1));
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    },
    [doc?.page_count],
  );

  useEffect(() => {
    const el = viewerContainerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Actions ────────────────────────────────────────────
  const handleSend = async () => {
    if (
      !confirm(
        '문서를 발송하면 초안을 더 이상 수정할 수 없습니다.\n서명자들에게 초대 이메일이 발송됩니다. 계속하시겠습니까?',
      )
    )
      return;
    setSending(true);
    try {
      await api.post(`/documents/${docId}/send`);
      queryClient.invalidateQueries({ queryKey: ['document', docId] });
      queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
    } catch (err) {
      alert('발송 실패: ' + errorMessage(err, '알 수 없는 오류'));
    } finally {
      setSending(false);
    }
  };

  const handleVoid = async () => {
    const reason = prompt('무효화 사유를 입력하세요 (선택사항):');
    if (reason === null) return; // cancelled
    try {
      await api.patch(`/documents/${docId}/void`, { reason });
      queryClient.invalidateQueries({ queryKey: ['document', docId] });
      queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      navigate('/docs');
    } catch (err) {
      alert('무효화 실패: ' + errorMessage(err, '알 수 없는 오류'));
    }
  };

  // 초안(draft) 문서는 아직 참여자에게 발송되지 않았으므로 무효화 없이 바로
  // 하드 삭제한다. 발송(in_progress) 이후의 문서는 `handleVoid` 로 무효화
  // 감사 기록을 남긴 뒤 참여자에게 알림이 가야 하므로 이 경로를 사용하지 않는다.
  const handleDeleteDraft = async () => {
    if (!confirm('초안 문서를 삭제하시겠습니까? 이 동작은 되돌릴 수 없습니다.')) return;
    try {
      await api.delete(`/documents/${docId}`);
      queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      navigate('/docs');
    } catch (err) {
      alert('삭제 실패: ' + errorMessage(err, '알 수 없는 오류'));
    }
  };

  const handleSubmitSigning = async () => {
    if (!confirm('서명을 제출하면 수정할 수 없습니다. 제출하시겠습니까?')) return;
    try {
      await api.patch(`/documents/${docId}/signing/submit`);
      queryClient.invalidateQueries({ queryKey: ['document', docId] });
      queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      navigate(`/docs/${docId}/complete`);
    } catch (err) {
      alert('서명 제출 실패: ' + errorMessage(err, '알 수 없는 오류'));
    }
  };

  const handleDeclineSigning = async () => {
    const reason = prompt('서명 거부 사유를 입력하세요:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('거부 사유를 입력해야 합니다');
      return;
    }
    try {
      await api.patch(`/documents/${docId}/signing/decline`, { reason });
      queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      navigate('/shared');
    } catch (err) {
      alert('서명 거부 실패: ' + errorMessage(err, '알 수 없는 오류'));
    }
  };

  const handleExport = async (mode: 'combined' | 'signed' = 'combined') => {
    setExporting(true);
    try {
      const resp = await api.post<Blob>(
        `/documents/${docId}/export`,
        { mode },
        { responseType: 'blob' },
      );
      const suffix = mode === 'combined' ? '_combined.pdf' : '_signed.pdf';
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = (doc?.name || 'document').replace('.pdf', '') + suffix;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('내보내기 실패: ' + errorMessage(err, '알 수 없는 오류'));
    } finally {
      setExporting(false);
    }
  };

  // ── Loading / error ────────────────────────────────────
  if (isLoading)
    return (
      <div className="gs-loading">
        <div className="col gap-3" style={{ alignItems: 'center' }}>
          <div className="gs-spinner" />
          <p className="t-caption">문서 불러오는 중...</p>
        </div>
      </div>
    );

  if (docError) {
    const apiErr = docError instanceof ApiError ? docError : null;
    const httpStatus = apiErr?.response.status;
    const errBody = apiErr?.response.data as { error?: string } | undefined;
    const isNotFound = httpStatus === 404;
    const isForbidden = httpStatus === 403;
    return (
      <div className="gs-loading">
        <div className="col gap-3" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-danger)', fontWeight: 500 }}>
            {isForbidden
              ? '이 문서에 대한 접근 권한이 없습니다.'
              : isNotFound
                ? '문서를 찾을 수 없습니다.'
                : '문서를 불러올 수 없습니다.'}
          </p>
          <p className="t-caption">
            {isForbidden
              ? '문서 소유자에게 초대를 요청하세요.'
              : isNotFound
                ? '삭제되었거나 잘못된 링크일 수 있습니다.'
                : errBody?.error || '잠시 후 다시 시도해주세요.'}
          </p>
          <button className="btn btn-secondary" onClick={() => navigate('/docs')}>
            내 문서로 이동
          </button>
        </div>
      </div>
    );
  }

  const isOwner = !!doc?.is_owner;
  const status = doc?.status;
  const isSetupMode = status === 'draft' && isOwner;
  const isSigningMode = status === 'in_progress';
  const isReadOnly = status === 'completed' || status === 'voided';
  const mySigningStatus = doc?.my_signing_status;
  const alreadySigned = mySigningStatus === 'completed' || mySigningStatus === 'declined';
  const totalPages = doc?.page_count || 1;

  interface SetupTool {
    id: FieldType;
    label: string;
    icon: string;
  }
  const SETUP_TOOLS: SetupTool[] = [
    { id: 'text', label: '텍스트', icon: 'M4 4h8M4 8h6M4 12h4' },
    { id: 'checkbox', label: '체크박스', icon: 'M2 3h12v10H2zM5 8l2 2 4-4' },
    { id: 'signature', label: '서명', icon: 'M2 13c2-4 4-7 6-7s2 3 3 5 3 3 5 3' },
    { id: 'date', label: '날짜', icon: 'M2 5h12v9H2zM2 8h12M5 2v3M11 2v3' },
  ];

  const editorClass = ['gs-editor', !leftOpen && 'left-closed', !rightOpen && 'right-closed']
    .filter(Boolean)
    .join(' ');

  interface ZoomDropdownItem {
    label: string;
    value: ZoomMode;
  }
  const zoomDropdownItems: (ZoomDropdownItem | null)[] = [
    { label: '높이에 맞춤', value: 'fit-height' },
    { label: '너비에 맞춤', value: 'fit-width' },
    null,
    { label: '75%', value: 0.75 },
    { label: '100%', value: 1.0 },
    { label: '125%', value: 1.25 },
    { label: '150%', value: 1.5 },
  ];

  return (
    <div className={editorClass} onClick={() => setDropdownOpen(false)}>
      {/* ── Header ── */}
      <div className="gs-ed-head">
        <button className="icon-btn" onClick={() => navigate('/docs')} title="뒤로가기">
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
              style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}
              className="truncate"
            >
              {doc?.name}
            </span>
            {status === 'draft' && <span className="badge badge-neutral">초안</span>}
            {status === 'in_progress' && <span className="badge badge-primary">서명 진행중</span>}
            {status === 'completed' && <span className="badge badge-success">서명 완료</span>}
            {status === 'voided' && <span className="badge badge-danger">무효화됨</span>}
            {isSetupMode && activeTool && (
              <span className="badge badge-primary">
                {SETUP_TOOLS.find((t) => t.id === activeTool)?.label} — PDF 클릭으로 배치
              </span>
            )}
          </div>
          <div className="t-caption" style={{ marginTop: 1 }}>
            {isSetupMode ? `${fields.length}개 필드 배치됨` : ''}
            {isSigningMode && !alreadySigned ? '본인 필드를 작성하고 서명을 완료하세요' : ''}
            {isSigningMode && alreadySigned ? '서명이 완료되었습니다' : ''}
          </div>
        </div>

        {/* Action buttons */}
        <div className="row gap-2">
          {/* Setup mode (draft): 초안은 발송 전이라 무효화가 아닌 하드 삭제로 처리. */}
          {isSetupMode && (
            <>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleDeleteDraft}
                style={{ opacity: 0.7 }}
                title="초안 문서 삭제 (되돌릴 수 없음)"
              >
                <Icon d="m2 2 12 12M14 2 2 14" />
                삭제
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSend} disabled={sending}>
                {sending ? (
                  <span className="gs-spinner" style={{ width: 12, height: 12 }} />
                ) : (
                  <Icon d="M2 8h9M8 5l5 3-5 3" />
                )}
                {sending ? '발송 중…' : '발송'}
              </button>
            </>
          )}

          {/* Signing mode: submit / decline */}
          {isSigningMode && !isOwner && !alreadySigned && (
            <>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDeclineSigning}
                style={{ color: 'var(--color-danger)' }}
              >
                <Icon d="m2 2 12 12M14 2 2 14" />
                서명 거부
              </button>
              <button className="btn btn-success btn-sm" onClick={handleSubmitSigning}>
                <Icon d="m3 8 4 4 6-7" />
                서명 완료
              </button>
            </>
          )}

          {/* Signing mode: owner who is also signer */}
          {isSigningMode && isOwner && mySigningStatus !== 'completed' && (
            <>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleVoid}
                style={{ opacity: 0.7 }}
              >
                문서 무효화
              </button>
              <button className="btn btn-success btn-sm" onClick={handleSubmitSigning}>
                <Icon d="m3 8 4 4 6-7" />내 서명 완료
              </button>
            </>
          )}

          {/* Completed: export button */}
          {status === 'completed' && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/docs/${docId}/complete`)}
              >
                인증서 보기
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleExport('combined')}
                disabled={exporting}
              >
                {exporting ? '생성 중…' : '다운로드'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="gs-ed-tool">
        {/* Setup mode tools */}
        {isSetupMode && (
          <>
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
            <div
              style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 4px' }}
            />
            {/* 참여자 관리 버튼 */}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowParticipantModal(true)}>
              <svg
                width={13}
                height={13}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <circle cx="5" cy="5" r="2" />
                <circle cx="11" cy="5" r="2" />
                <path d="M1 13c0-2 1.8-3 4-3s4 1 4 3" />
                <path d="M11 10c2.2 0 4 1 4 3" />
              </svg>
              참여자 관리
              <span
                className="badge badge-neutral"
                style={{ fontSize: 10, padding: '1px 5px', marginLeft: 2 }}
              >
                {participants.length}
              </span>
            </button>
          </>
        )}

        {/* Signing mode: signature selector */}
        {isSigningMode && !alreadySigned && (
          <div className="row gap-2">
            <span className="t-caption">서명 선택:</span>
            {signatures.slice(0, 3).map((sig) => (
              <button
                key={sig.id}
                onClick={() => {
                  if (sig.svg_data) setActiveSignature({ id: sig.id, svg_data: sig.svg_data });
                }}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: `1.5px solid ${activeSignature?.id === sig.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background:
                    activeSignature?.id === sig.id
                      ? 'var(--color-primary-subtle)'
                      : 'var(--color-surface)',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={
                    sig.thumbnail /* 이미 data:image/png;base64,... URL 이므로 그대로 사용 */ ||
                    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sig.svg_data || '')}`
                  }
                  style={{ height: 22, maxWidth: 60, objectFit: 'contain' }}
                  alt={sig.name}
                />
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSigModal(true)}>
              <Icon d="M8 2v12M2 8h12" />
              서명 추가
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto' }} className="row gap-1">
          {/* Zoom */}
          <button
            className="icon-btn"
            onClick={() => stepZoom(-1)}
            style={{ width: 26, height: 26 }}
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
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3M5 7h4" />
            </svg>
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-sm t-mono"
              style={{ minWidth: 80 }}
              onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                setDropdownOpen((o) => !o);
              }}
            >
              {zoomLabel}
              <svg
                width={10}
                height={10}
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                style={{ marginLeft: 4 }}
              >
                <path d="m2 3.5 3 3 3-3" />
              </svg>
            </button>
            {dropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 100,
                  minWidth: 150,
                  padding: 4,
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {zoomDropdownItems.map((item, i) =>
                  item === null ? (
                    <div
                      key={`sep-${i}`}
                      style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }}
                    />
                  ) : (
                    <button
                      key={String(item.value)}
                      onClick={() => applyZoom(item.value)}
                      className="gs-tool-btn"
                      style={{
                        width: '100%',
                        padding: '7px 12px',
                        justifyContent: 'space-between',
                        color: zoomMode === item.value ? 'var(--color-primary)' : undefined,
                        background:
                          zoomMode === item.value ? 'var(--color-primary-subtle)' : undefined,
                      }}
                    >
                      {item.label}
                      {zoomMode === item.value && (
                        <svg
                          width={12}
                          height={12}
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="m3 8 4 4 6-7" />
                        </svg>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
          <button
            className="icon-btn"
            onClick={() => stepZoom(1)}
            style={{ width: 26, height: 26 }}
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
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3M5 7h4M7 5v4" />
            </svg>
          </button>
        </div>
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
                    onClick={() => handlePageChange(p)}
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
          /* 접힌 상태: 세로 토글 버튼만 */
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
      <div className="gs-ed-canvas" ref={viewerContainerRef}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <PdfViewer
            pdfUrl={`/api/documents/${docId}/pdf`}
            currentPage={currentPage}
            scale={scale}
            token={token}
            onPageRendered={(info: PageRenderedInfo) => {
              const { width, height, pdfWidth, pdfHeight, scale: s } = info;
              pdfPageSizeRef.current = { pdfWidth, pdfHeight };
              if (!pdfFirstRenderRef.current) {
                pdfFirstRenderRef.current = true;
                setScale(calcFitScale('fit-height'));
              }
              setCanvasSize({ width, height, pdfHeight, scale: s });
            }}
          />
          {docId !== undefined && (
            <EditLayer
              docId={docId}
              fields={fields}
              setFields={setFields}
              participants={participants}
              myParticipantId={myParticipantId}
              myResponses={myResponses}
              setMyResponses={setMyResponses}
              allResponses={allResponses}
              canvasSize={canvasSize}
              currentPage={currentPage}
              isSetupMode={isSetupMode}
              activeTool={activeTool}
              activeParticipantId={activeParticipantId}
              onToolUsed={() => setActiveTool(null)}
              activeSignature={activeSignature}
              readOnly={isReadOnly || alreadySigned}
              selectedFieldId={selectedFieldId}
              setSelectedFieldId={setSelectedFieldId}
            />
          )}
        </div>
      </div>

      {/* ── Right Sidebar ── */}
      <div
        className={`gs-ed-right${rightOpen ? '' : ' is-closed'}`}
        style={{ display: 'flex', flexDirection: 'column' } as CSSProperties}
      >
        {rightOpen ? (
          <>
            {/* 패널 헤더 (접기 버튼) */}
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
                {isSetupMode ? (selectedField ? '필드 속성' : '필드 배치 대상') : '서명 현황'}
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

            {/* Setup: 선택된 필드가 있으면 FieldInspector, 없으면 참여자 목록 */}
            {isSetupMode && selectedField && (
              <FieldInspector
                field={selectedField}
                participants={participants}
                onDelete={deleteSelectedField}
                onChangeAssignee={changeFieldAssignee}
                onToggleRequired={toggleFieldRequired}
              />
            )}
            {isSetupMode && !selectedField && (
              <>
                <ParticipantList
                  participants={participants}
                  selectedId={activeParticipantId}
                  onSelect={setActiveParticipantId}
                  fields={fields}
                />
                {/* 참여자 관리 버튼 */}
                <div style={{ padding: '0 12px 12px' }}>
                  <button
                    className="btn btn-ghost btn-sm btn-block"
                    onClick={() => setShowParticipantModal(true)}
                  >
                    <svg
                      width={12}
                      height={12}
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    >
                      <circle cx="5" cy="5" r="2" />
                      <circle cx="11" cy="5" r="2" />
                      <path d="M1 13c0-2 1.8-3 4-3s4 1 4 3" />
                      <path d="M11 10c2.2 0 4 1 4 3" />
                    </svg>
                    참여자 추가/수정
                  </button>
                </div>
              </>
            )}

            {/* Signing / read-only: status panel */}
            {(isSigningMode || isReadOnly) && (
              <SigningStatusPanel participants={participants} myParticipantId={myParticipantId} />
            )}

            {/* Signing: signature library */}
            {isSigningMode && !alreadySigned && signatures.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
                <div className="t-eyebrow" style={{ marginBottom: 8 }}>
                  내 서명
                </div>
                <div className="col gap-2">
                  {signatures.map((sig) => (
                    <div
                      key={sig.id}
                      onClick={() => {
                        if (sig.svg_data)
                          setActiveSignature({ id: sig.id, svg_data: sig.svg_data });
                      }}
                      style={{
                        padding: 8,
                        borderRadius: 'var(--radius-control)',
                        border: `1.5px solid ${activeSignature?.id === sig.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background:
                          activeSignature?.id === sig.id
                            ? 'var(--color-primary-subtle)'
                            : 'var(--color-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <img
                          src={
                            sig.thumbnail /* PNG data URL — SVG 래핑 없이 직접 사용 */ ||
                            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sig.svg_data || '')}`
                          }
                          style={{ height: 28, maxWidth: '100%', objectFit: 'contain' }}
                          alt={sig.name}
                        />
                      </div>
                      {activeSignature?.id === sig.id && (
                        <svg
                          width={12}
                          height={12}
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="var(--color-primary)"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="m3 8 4 4 6-7" />
                        </svg>
                      )}
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowSigModal(true)}>
                    <Icon d="M8 2v12M2 8h12" />
                    서명 추가/관리
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* 접힌 상태: 세로 토글 버튼만 */
          <button
            onClick={() => setRightOpen(true)}
            title="사이드바 열기"
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
              {isSetupMode ? '참여자' : '서명 현황'}
            </span>
          </button>
        )}
      </div>

      {/* ── Signature Modal ── */}
      {showSigModal && (
        <SignatureModal
          onClose={() => setShowSigModal(false)}
          onSaved={(sig) => {
            if (sig.svg_data) setActiveSignature({ id: sig.id, svg_data: sig.svg_data });
            queryClient.invalidateQueries({ queryKey: ['signatures'] });
          }}
        />
      )}

      {/* ── Participant Modal (setup mode) ── */}
      {showParticipantModal && docId !== undefined && (
        <ShareModal
          docId={docId}
          docStatus="draft"
          onClose={() => {
            setShowParticipantModal(false);
            // 참여자 목록 새로고침
            api
              .get<EditorParticipant[]>(`/documents/${docId}/participants`)
              .then(({ data }) => {
                setParticipants(data);
                if (data.length > 0 && !data.find((p) => p.id === activeParticipantId)) {
                  setActiveParticipantId(data[0].id);
                }
              })
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
