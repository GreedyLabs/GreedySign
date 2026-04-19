/**
 * SearchPalette — ⌘K 검색 팔레트
 * 문서 이름 / 참여자 이름·이메일로 검색
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '../lib/router';
import api from '../services/api';

const STATUS_LABEL = {
  draft: { text: '초안', color: 'var(--color-text-muted)' },
  in_progress: { text: '진행 중', color: 'var(--color-warning)' },
  completed: { text: '완료', color: 'var(--color-success)' },
  voided: { text: '무효화', color: 'var(--color-danger)' },
};

function StatusBadge({ status }) {
  const s = STATUS_LABEL[status] ?? { text: status, color: 'var(--color-text-muted)' };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
        padding: '2px 6px',
        borderRadius: 4,
      }}
    >
      {s.text}
    </span>
  );
}

function DocIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
      <path d="M10 2v3h3M5 7h6M5 9.5h4" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" />
    </svg>
  );
}

export default function SearchPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ documents: [], participants: [] });
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  // 포커스
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults({ documents: [], participants: [] });
      setActiveIdx(0);
    }
  }, [open]);

  // 디바운스 검색
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) {
      setResults({ documents: [], participants: [] });
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(query.trim())}`);
        setResults(data);
        setActiveIdx(0);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  // 플랫 아이템 목록 (키보드 탐색용)
  const flatItems = [
    ...results.documents.map((d) => ({ type: 'doc', data: d })),
    ...results.participants.map((p) => ({ type: 'participant', data: p })),
  ];

  const goTo = useCallback(
    (item) => {
      onClose();
      if (item.type === 'doc') {
        navigate(`/documents/${item.data.id}`);
      } else {
        navigate(`/documents/${item.data.document_id}`);
      }
    },
    [navigate, onClose]
  );

  // 키보드 핸들러
  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && flatItems[activeIdx]) {
        goTo(flatItems[activeIdx]);
      }
    },
    [flatItems, activeIdx, goTo, onClose]
  );

  if (!open) return null;

  const hasResults = results.documents.length > 0 || results.participants.length > 0;
  let itemCounter = 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 560,
          maxHeight: '60vh',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onKeyDown={onKeyDown}
      >
        {/* 입력 영역 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="문서 이름, 참여자 이름/이메일 검색…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              color: 'var(--color-text)',
              lineHeight: '1.4',
            }}
          />
          {loading && (
            <svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ animation: 'spin 0.8s linear infinite' }}
            >
              <path d="M8 2a6 6 0 1 0 6 6" />
            </svg>
          )}
          <span
            style={{
              fontSize: 11,
              color: 'var(--color-text-muted)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            esc
          </span>
        </div>

        {/* 결과 영역 */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!query.trim() && (
            <div
              style={{
                padding: '20px 16px',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 13,
              }}
            >
              검색어를 입력하세요
            </div>
          )}

          {query.trim() && !loading && !hasResults && (
            <div
              style={{
                padding: '20px 16px',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 13,
              }}
            >
              검색 결과가 없습니다
            </div>
          )}

          {results.documents.length > 0 && (
            <div>
              <div
                style={{
                  padding: '8px 16px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-muted)',
                }}
              >
                문서
              </div>
              {results.documents.map((doc) => {
                const idx = itemCounter++;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={doc.id}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => goTo({ type: 'doc', data: doc })}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 16px',
                      background: isActive
                        ? 'var(--color-primary-bg, color-mix(in srgb, var(--color-primary) 8%, transparent))'
                        : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--color-text)',
                    }}
                  >
                    <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                      <DocIcon />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 14,
                        fontWeight: 500,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {doc.name}
                    </span>
                    <StatusBadge status={doc.status} />
                    {doc.is_owner && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        내 문서
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {results.participants.length > 0 && (
            <div>
              <div
                style={{
                  padding: '8px 16px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-muted)',
                  borderTop:
                    results.documents.length > 0 ? '1px solid var(--color-border)' : 'none',
                  marginTop: results.documents.length > 0 ? 4 : 0,
                }}
              >
                참여자
              </div>
              {results.participants.map((p) => {
                const idx = itemCounter++;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={`${p.participant_id}-${p.document_id}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => goTo({ type: 'participant', data: p })}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 16px',
                      background: isActive
                        ? 'var(--color-primary-bg, color-mix(in srgb, var(--color-primary) 8%, transparent))'
                        : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--color-text)',
                    }}
                  >
                    <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                      <PersonIcon />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.participant_name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.participant_email} · {p.document_name}
                      </div>
                    </div>
                    <StatusBadge status={p.document_status} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 힌트 */}
        {hasResults && (
          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              padding: '8px 16px',
              display: 'flex',
              gap: 16,
              fontSize: 11,
              color: 'var(--color-text-muted)',
            }}
          >
            <span>
              <kbd
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 3,
                  padding: '1px 4px',
                }}
              >
                ↑↓
              </kbd>{' '}
              이동
            </span>
            <span>
              <kbd
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 3,
                  padding: '1px 4px',
                }}
              >
                Enter
              </kbd>{' '}
              열기
            </span>
            <span>
              <kbd
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 3,
                  padding: '1px 4px',
                }}
              >
                Esc
              </kbd>{' '}
              닫기
            </span>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
