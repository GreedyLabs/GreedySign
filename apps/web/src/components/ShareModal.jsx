/**
 * ShareModal (= 참여자 관리 모달)
 * - draft 상태: 참여자 추가/제거 가능
 * - in_progress/completed/voided 상태: 현황 열람만
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { useUserSSE } from '../contexts/SSEContext';
import { PARTICIPANT_COLORS } from './EditLayer';

// ─── 상수 ─────────────────────────────────────────────────
const ROLE_LABEL = { signer: '서명자', cc: '참조' };
const ROLE_BADGE = { signer: 'badge-primary', cc: 'badge-neutral' };

const INVITE_BADGE = {
  pending: { label: '초대 대기', cls: 'badge-neutral' },
  accepted: { label: '수락', cls: 'badge-success' },
  declined: { label: '거절', cls: 'badge-danger' },
};
const SIGN_BADGE = {
  not_started: { label: '미서명', cls: 'badge-neutral' },
  in_progress: { label: '진행 중', cls: 'badge-warning' },
  completed: { label: '완료', cls: 'badge-success' },
  declined: { label: '거부됨', cls: 'badge-danger' },
};

// ─── ShareModal ────────────────────────────────────────────
export default function ShareModal({ docId, docStatus, onClose }) {
  const isDraft = docStatus === 'draft';

  const [participants, setParticipants] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedRole, setSelectedRole] = useState('signer');
  const [pendingEmails, setPendingEmails] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef(null);
  const inputRef = useRef(null);

  const loadParticipants = useCallback(async () => {
    try {
      const { data } = await api.get(`/documents/${docId}/participants`);
      setParticipants(Array.isArray(data) ? data : []);
    } catch {}
  }, [docId]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  // SSE: 참여자 상태 변경 시 새로고침
  const handleUserEvent = useCallback(
    (msg) => {
      if (
        ['invite_accepted', 'invite_declined', 'signing_status_changed'].includes(msg.type) &&
        msg.document_id === docId
      ) {
        loadParticipants();
      }
    },
    [docId, loadParticipants]
  );
  useUserSSE(handleUserEvent);

  // ─── 이메일 태그 입력 ──────────────────────────────────
  const commitInput = (value) => {
    const addr = value.trim();
    if (addr && !pendingEmails.includes(addr)) setPendingEmails((prev) => [...prev, addr]);
    setInputValue('');
    setSuggestions([]);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      commitInput(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && pendingEmails.length) {
      setPendingEmails((prev) => prev.slice(0, -1));
    } else if (e.key === 'Escape') setSuggestions([]);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (val.endsWith(',')) {
      commitInput(val.slice(0, -1));
      return;
    }
    setInputValue(val);
    clearTimeout(searchTimer.current);
    if (val.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    const existingEmails = new Set(participants.map((p) => p.email));
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/auth/users/search?q=${encodeURIComponent(val.trim())}`);
        setSuggestions(
          data.filter((u) => !pendingEmails.includes(u.email) && !existingEmails.has(u.email))
        );
      } catch {}
    }, 200);
  };

  const selectSuggestion = (user) => {
    if (!pendingEmails.includes(user.email)) setPendingEmails((prev) => [...prev, user.email]);
    setInputValue('');
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const removePending = (addr) => setPendingEmails((prev) => prev.filter((e) => e !== addr));

  // ─── 참여자 추가 ───────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    const extra = inputValue.trim();
    const emails = extra ? [...pendingEmails, extra] : [...pendingEmails];
    if (!emails.length) return;
    setLoading(true);
    setError('');
    const errors = [];
    for (const addr of emails) {
      try {
        await api.post(`/documents/${docId}/participants`, { email: addr, role: selectedRole });
      } catch (err) {
        errors.push(`${addr}: ${err.response?.data?.error || '추가 실패'}`);
      }
    }
    setPendingEmails([]);
    setInputValue('');
    await loadParticipants();
    if (errors.length) setError(errors.join('\n'));
    setLoading(false);
  };

  // ─── 참여자 제거 ───────────────────────────────────────
  const handleRemove = async (participant) => {
    if (!confirm(`${participant.email} 참여자를 제거하시겠습니까?`)) return;
    try {
      await api.delete(`/documents/${docId}/participants/${participant.id}`);
      setParticipants((prev) => prev.filter((p) => p.id !== participant.id));
    } catch (err) {
      alert(err.response?.data?.error || '제거 실패');
    }
  };

  // ─── 역할 변경 ─────────────────────────────────────────
  const handleRoleChange = async (participant, newRole) => {
    try {
      const { data } = await api.patch(`/documents/${docId}/participants/${participant.id}`, {
        role: newRole,
      });
      setParticipants((prev) =>
        prev.map((p) => (p.id === participant.id ? { ...p, role: data.role } : p))
      );
    } catch (err) {
      alert(err.response?.data?.error || '역할 변경 실패');
    }
  };

  const nonOwners = participants.filter((p) => !p.is_owner);
  const inviteCount = pendingEmails.length + (inputValue.trim() ? 1 : 0);
  const existingEmails = new Set(participants.map((p) => p.email));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-head">
          <div className="modal-head-title">참여자 관리</div>
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
        <div className="modal-body col gap-5">
          {/* 참여자 추가 (draft 전용) */}
          {isDraft && (
            <div>
              <div className="t-eyebrow" style={{ marginBottom: 10 }}>
                참여자 추가
              </div>
              <form onSubmit={handleAdd}>
                {/* 역할 선택 */}
                <div className="row gap-2" style={{ marginBottom: 8 }}>
                  {['signer', 'cc'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRole(r)}
                      className={`btn btn-sm${selectedRole === r ? ' btn-primary' : ' btn-secondary'}`}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                  <span className="t-caption" style={{ alignSelf: 'center', marginLeft: 4 }}>
                    {selectedRole === 'signer'
                      ? '필드를 채우고 서명합니다'
                      : '완료 문서 사본을 받습니다'}
                  </span>
                </div>

                {/* 이메일 태그 입력 */}
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      padding: '6px 10px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-control)',
                      background: 'var(--color-surface)',
                      minHeight: 40,
                      alignItems: 'center',
                      cursor: 'text',
                    }}
                    onClick={() => inputRef.current?.focus()}
                  >
                    {pendingEmails.map((addr) => (
                      <span key={addr} className="badge badge-primary" style={{ gap: 4 }}>
                        {addr}
                        <button
                          type="button"
                          onClick={() => removePending(addr)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-primary)',
                            fontSize: 14,
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKeyDown}
                      onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                      placeholder={pendingEmails.length ? '' : '이메일 입력 후 쉼표 또는 Enter'}
                      style={{
                        flex: 1,
                        minWidth: 160,
                        border: 'none',
                        outline: 'none',
                        fontSize: 13,
                        background: 'transparent',
                        color: 'var(--color-text)',
                        padding: '2px 4px',
                      }}
                    />
                  </div>

                  {/* 자동완성 드롭다운 */}
                  {suggestions.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 50,
                        overflow: 'hidden',
                      }}
                    >
                      {suggestions.map((u) => (
                        <button
                          key={u.email}
                          type="button"
                          onMouseDown={() => selectSuggestion(u)}
                          style={{
                            width: '100%',
                            padding: '9px 14px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            transition: 'background 100ms',
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = 'var(--color-bg-subtle)')
                          }
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div
                            className="avatar avatar-sm"
                            style={{
                              background: 'var(--color-primary)',
                              color: '#fff',
                              border: 'none',
                              flexShrink: 0,
                            }}
                          >
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          <div className="col" style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name || u.email}</div>
                            <div className="t-caption">{u.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="row-between">
                  <span className="t-caption">
                    {inviteCount > 0 ? `${inviteCount}명 추가 예정` : '이메일 또는 이름으로 검색'}
                  </span>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={loading || inviteCount === 0}
                  >
                    {loading ? '처리 중…' : `추가${inviteCount > 0 ? ` (${inviteCount})` : ''}`}
                  </button>
                </div>
              </form>

              {error && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    background: 'var(--color-danger-subtle)',
                    border: '1px solid var(--color-danger)',
                    borderRadius: 'var(--radius-control)',
                    fontSize: 12,
                    color: 'var(--color-danger)',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}

          {/* 참여자 목록 */}
          <div>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div className="t-eyebrow">참여자 목록</div>
              {participants.length > 0 && (
                <span className="t-caption">총 {participants.length}명</span>
              )}
            </div>

            {participants.length === 0 ? (
              <div
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: 13,
                }}
              >
                참여자가 없습니다
              </div>
            ) : (
              <div className="col gap-2">
                {participants.map((p, idx) => {
                  const dotColor = PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length];
                  const ib = INVITE_BADGE[p.invite_status] ?? INVITE_BADGE.pending;
                  const sb = SIGN_BADGE[p.signing_status] ?? SIGN_BADGE.not_started;
                  const showSign = p.invite_status === 'accepted' && p.role === 'signer';
                  const displayName = p.name || p.email;

                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-card)',
                        background: 'var(--color-surface)',
                      }}
                    >
                      {/* 색상 점 */}
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: dotColor,
                          flexShrink: 0,
                        }}
                      />

                      {/* 이름 / 이메일 */}
                      <div className="col flex-1" style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }} className="truncate">
                            {displayName}
                          </span>
                          {p.is_owner && (
                            <span
                              className="badge badge-neutral"
                              style={{ fontSize: 10, padding: '1px 5px' }}
                            >
                              소유자
                            </span>
                          )}
                        </div>
                        <span className="t-caption truncate">{p.email}</span>
                      </div>

                      {/* 역할 (draft이면 드롭다운, 아니면 뱃지) */}
                      {!p.is_owner && isDraft ? (
                        <select
                          value={p.role}
                          onChange={(e) => handleRoleChange(p, e.target.value)}
                          className="input"
                          style={{ fontSize: 12, padding: '2px 6px', width: 'auto' }}
                        >
                          <option value="signer">서명자</option>
                          <option value="cc">참조</option>
                        </select>
                      ) : (
                        <span
                          className={`badge ${ROLE_BADGE[p.role] ?? 'badge-neutral'}`}
                          style={{ fontSize: 10 }}
                        >
                          {ROLE_LABEL[p.role] ?? p.role}
                        </span>
                      )}

                      {/* 초대 상태 */}
                      {!p.is_owner && (
                        <span className={`badge ${ib.cls}`} style={{ fontSize: 10 }}>
                          {ib.label}
                        </span>
                      )}

                      {/* 서명 상태 */}
                      {showSign && (
                        <span className={`badge ${sb.cls}`} style={{ fontSize: 10 }}>
                          {sb.label}
                        </span>
                      )}

                      {/* 제거 버튼 (draft + 비소유자) */}
                      {isDraft && !p.is_owner && (
                        <button
                          className="icon-btn"
                          style={{ color: 'var(--color-danger)', flexShrink: 0 }}
                          title="참여자 제거"
                          onClick={() => handleRemove(p)}
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
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 비-draft 안내 */}
            {!isDraft && (
              <p className="t-caption" style={{ marginTop: 12, textAlign: 'center' }}>
                {docStatus === 'completed'
                  ? '서명이 완료된 문서입니다.'
                  : docStatus === 'voided'
                    ? '무효화된 문서입니다.'
                    : '발송된 문서의 참여자는 변경할 수 없습니다.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
