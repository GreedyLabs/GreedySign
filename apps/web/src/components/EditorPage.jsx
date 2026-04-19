/**
 * EditorPage — PDF 문서 편집/서명 페이지.
 *
 * 두 가지 모드:
 *   setup   — 소유자가 draft 문서에서 참여자별 필드 배치 → "발송" 버튼으로 in_progress 전환
 *   signing — in_progress 문서에서 참여자가 자신에게 할당된 필드 응답 → "서명 완료" 제출
 *
 * 소유자도 signer인 경우 setup 단계에서 발송 후 signing 모드로 진입해 자신의 필드를 채움.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useDocSSE } from '../contexts/SSEContext';
import { useAuthStore } from '../stores/authStore';
import { useNavigate, useParams } from '../lib/router';
import PdfViewer from './PdfViewer';
import EditLayer, { getParticipantColor } from './EditLayer';
import SignatureModal from './SignatureModal';
import ShareModal from './ShareModal';
import { DOCS_QUERY_KEY } from '../hooks/useDocs';

// ─── Icon helper ──────────────────────────────────────────
const Icon = ({ d, size = 14 }) => (
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

// ─── Participant badge ────────────────────────────────────
function ParticipantBadge({ name, color, selected, onClick }) {
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
function ParticipantList({ participants, selectedId, onSelect }) {
  return (
    <div className="col gap-2" style={{ padding: '8px 0' }}>
      {participants.map((p, i) => {
        const color = getParticipantColor(i);
        const isSelected = p.id === selectedId;
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
                {p.field_count || 0}개 필드
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Signing status panel (signing mode) ─────────────────
function SigningStatusPanel({ participants, myParticipantId }) {
  return (
    <div className="col gap-1" style={{ padding: '12px 0' }}>
      <div className="t-eyebrow" style={{ padding: '0 16px', marginBottom: 4 }}>
        서명 현황
      </div>
      {participants.map((p, i) => {
        const color = getParticipantColor(i);
        const statusMap = {
          not_started: { label: '대기', cls: 'badge-neutral' },
          in_progress: { label: '진행중', cls: 'badge-warning' },
          completed: { label: '완료', cls: 'badge-success' },
          declined: { label: '거부', cls: 'badge-danger' },
        };
        const st = statusMap[p.signing_status] || { label: p.signing_status, cls: 'badge-neutral' };
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
              style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
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

// ─── EditorPage ───────────────────────────────────────────
export default function EditorPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const [fields, setFields] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [myResponses, setMyResponses] = useState([]);
  const [myParticipantId, setMyParticipantId] = useState(null);

  // Viewer state
  const [currentPage, setCurrentPage] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 1000 });
  const [zoomMode, setZoomMode] = useState('fit-height');
  const [scale, setScale] = useState(1.4);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const viewerContainerRef = useRef(null);
  const pdfPageSizeRef = useRef({ pdfWidth: 595, pdfHeight: 842 });
  const pdfFirstRenderRef = useRef(false);

  // Setup mode state
  const [activeTool, setActiveTool] = useState(null);
  const [activeParticipantId, setActiveParticipantId] = useState(null);

  // Signing mode state
  const [activeSignature, setActiveSignature] = useState(null);
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
  } = useQuery({
    queryKey: ['document', docId],
    queryFn: async () => {
      const { data } = await api.get(`/documents/${docId}`);
      return data;
    },
  });

  const { data: signatures = [] } = useQuery({
    queryKey: ['signatures'],
    queryFn: async () => {
      const { data } = await api.get('/signatures');
      return data;
    },
  });

  // Load participants
  useEffect(() => {
    if (!doc) return;
    setFields(doc.fields || []);
    setMyResponses(doc.myResponses || []);
    setMyParticipantId(doc.participant_id || null);

    // Determine active participant for setup mode
    if (doc.status === 'draft' && doc.is_owner) {
      api
        .get(`/documents/${docId}/participants`)
        .then(({ data }) => {
          setParticipants(data);
          if (!activeParticipantId && data.length > 0) {
            setActiveParticipantId(data[0].id);
          }
        })
        .catch(() => {});
    } else {
      // For signing mode, extract participants from doc data (if returned)
      if (doc.fields) {
        // Derive unique participants from fields
        const partMap = {};
        doc.fields.forEach((f) => {
          if (f.participant_id && !partMap[f.participant_id]) {
            partMap[f.participant_id] = {
              id: f.participant_id,
              email: f.participant_email,
              display_name: f.participant_name,
              role: f.participant_role,
              is_owner: f.participant_is_owner,
            };
          }
        });
        // Load full participants list for status panel
        api
          .get(`/documents/${docId}/participants`)
          .then(({ data }) => {
            setParticipants(data);
          })
          .catch(() => {});
      }
    }
  }, [doc?.id, doc?.status]);

  // Set default sig for signing mode
  useEffect(() => {
    if (signatures.length && !activeSignature) {
      const def = signatures.find((s) => s.is_default) || signatures[0];
      if (def) setActiveSignature(def);
    }
  }, [signatures]);

  // ── SSE ────────────────────────────────────────────────
  const handleSseEvent = useCallback(
    (msg) => {
      if (msg.type === 'signing_status_changed' || msg.type === 'document_completed') {
        queryClient.invalidateQueries({ queryKey: ['document', docId] });
        queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      }
    },
    [docId, queryClient]
  );
  useDocSSE(docId, handleSseEvent);

  // ── Zoom ───────────────────────────────────────────────
  const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const calcFitScale = useCallback((mode) => {
    const container = viewerContainerRef.current;
    if (!container) return 1.4;
    const { pdfWidth, pdfHeight } = pdfPageSizeRef.current;
    const pad = 64;
    return mode === 'fit-height'
      ? (container.clientHeight - pad) / pdfHeight
      : (container.clientWidth - pad) / pdfWidth;
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

  const applyZoom = (mode) => {
    setZoomMode(mode);
    setDropdownOpen(false);
    if (mode === 'fit-height' || mode === 'fit-width') setScale(calcFitScale(mode));
    else setScale(mode);
  };

  const stepZoom = (dir) => {
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
  const handlePageChange = (p) => {
    if (p < 1 || p > (doc?.page_count || 1)) return;
    setCurrentPage(p);
  };

  const handleWheel = useCallback(
    (e) => {
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
    [doc?.page_count]
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
        '문서를 발송하면 초안을 더 이상 수정할 수 없습니다.\n서명자들에게 초대 이메일이 발송됩니다. 계속하시겠습니까?'
      )
    )
      return;
    setSending(true);
    try {
      await api.post(`/documents/${docId}/send`);
      queryClient.invalidateQueries({ queryKey: ['document', docId] });
      queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
    } catch (err) {
      alert('발송 실패: ' + (err.response?.data?.error || err.message));
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
      alert('무효화 실패: ' + (err.response?.data?.error || err.message));
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
      alert('서명 제출 실패: ' + (err.response?.data?.error || err.message));
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
      alert('서명 거부 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleExport = async (mode = 'combined') => {
    setExporting(true);
    try {
      const resp = await api.post(`/documents/${docId}/export`, { mode }, { responseType: 'blob' });
      const suffix = mode === 'combined' ? '_combined.pdf' : '_signed.pdf';
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = (doc?.name || 'document').replace('.pdf', '') + suffix;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('내보내기 실패: ' + (err.response?.data?.error || err.message));
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
    const httpStatus = docError.response?.status;
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
                : docError.response?.data?.error || '잠시 후 다시 시도해주세요.'}
          </p>
          <button className="btn btn-secondary" onClick={() => navigate('/docs')}>
            내 문서로 이동
          </button>
        </div>
      </div>
    );
  }

  const isOwner = doc?.is_owner;
  const status = doc?.status;
  const isSetupMode = status === 'draft' && isOwner;
  const isSigningMode = status === 'in_progress';
  const isReadOnly = status === 'completed' || status === 'voided';
  const mySigningStatus = doc?.my_signing_status;
  const alreadySigned = mySigningStatus === 'completed' || mySigningStatus === 'declined';
  const totalPages = doc?.page_count || 1;

  const SETUP_TOOLS = [
    { id: 'text', label: '텍스트', icon: 'M4 4h8M4 8h6M4 12h4' },
    { id: 'checkbox', label: '체크박스', icon: 'M2 3h12v10H2zM5 8l2 2 4-4' },
    { id: 'signature', label: '서명', icon: 'M2 13c2-4 4-7 6-7s2 3 3 5 3 3 5 3' },
    { id: 'date', label: '날짜', icon: 'M2 5h12v9H2zM2 8h12M5 2v3M11 2v3' },
  ];

  const editorClass = ['gs-editor', !leftOpen && 'left-closed', !rightOpen && 'right-closed']
    .filter(Boolean)
    .join(' ');

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
          {/* Setup mode: 발송 버튼 */}
          {isSetupMode && (
            <>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleVoid}
                style={{ opacity: 0.7 }}
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
                onClick={() => setActiveSignature(sig)}
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
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sig.thumbnail || sig.svg_data)}`}
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
              onClick={(e) => {
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
                {[
                  { label: '높이에 맞춤', value: 'fit-height' },
                  { label: '너비에 맞춤', value: 'fit-width' },
                  null,
                  { label: '75%', value: 0.75 },
                  { label: '100%', value: 1.0 },
                  { label: '125%', value: 1.25 },
                  { label: '150%', value: 1.5 },
                ].map((item, i) =>
                  item === null ? (
                    <div
                      key={i}
                      style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }}
                    />
                  ) : (
                    <button
                      key={item.value}
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
                  )
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
            onPageRendered={({ width, height, pdfWidth, pdfHeight, scale: s }) => {
              pdfPageSizeRef.current = { pdfWidth, pdfHeight };
              if (!pdfFirstRenderRef.current) {
                pdfFirstRenderRef.current = true;
                setScale(calcFitScale('fit-height'));
              }
              setCanvasSize({ width, height, pdfWidth, pdfHeight, scale: s });
            }}
          />
          <EditLayer
            docId={docId}
            fields={fields}
            setFields={setFields}
            participants={participants}
            myParticipantId={myParticipantId}
            myResponses={myResponses}
            setMyResponses={setMyResponses}
            canvasSize={canvasSize}
            currentPage={currentPage}
            isSetupMode={isSetupMode}
            activeTool={activeTool}
            activeParticipantId={activeParticipantId}
            onToolUsed={() => setActiveTool(null)}
            activeSignature={activeSignature}
            readOnly={isReadOnly || alreadySigned}
          />
        </div>
      </div>

      {/* ── Right Sidebar ── */}
      <div
        className={`gs-ed-right${rightOpen ? '' : ' is-closed'}`}
        style={{ display: 'flex', flexDirection: 'column' }}
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
              <span className="t-eyebrow">{isSetupMode ? '필드 배치 대상' : '서명 현황'}</span>
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

            {/* Setup: participant list */}
            {isSetupMode && (
              <>
                <ParticipantList
                  participants={participants}
                  selectedId={activeParticipantId}
                  onSelect={setActiveParticipantId}
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
                      onClick={() => setActiveSignature(sig)}
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
                          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sig.thumbnail || sig.svg_data)}`}
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
            setActiveSignature(sig);
            queryClient.invalidateQueries({ queryKey: ['signatures'] });
          }}
        />
      )}

      {/* ── Participant Modal (setup mode) ── */}
      {showParticipantModal && (
        <ShareModal
          docId={docId}
          docStatus="draft"
          onClose={() => {
            setShowParticipantModal(false);
            // 참여자 목록 새로고침
            api
              .get(`/documents/${docId}/participants`)
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
