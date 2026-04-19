/**
 * UploadPage — 2-step wizard: upload PDF → 참여자 설정.
 * Step 2에서 서명자/참조자를 추가하고 소유자 서명 여부 설정 후 에디터로 이동.
 */
import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useNavigate } from '../lib/router';
import { DOCS_QUERY_KEY } from '../hooks/useDocs';
import { useAuthStore } from '../stores/authStore';
import PageHeader from '../components/ui/PageHeader';
import { getParticipantColor } from '../components/EditLayer';

// ─── Icons ────────────────────────────────────────────────
const UploadCloudIcon = () => (
  <svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const CheckIcon = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// ─── Dropzone ─────────────────────────────────────────────
function Dropzone({ onFile, loading }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      className="gs-dropzone"
      style={{
        borderColor: drag ? 'var(--color-primary)' : undefined,
        background: drag ? 'var(--color-primary-subtle)' : undefined,
      }}
      onClick={() => !loading && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
    >
      <div className="gs-dropzone-icon">
        {loading ? (
          <div className="gs-spinner" style={{ width: 24, height: 24 }} />
        ) : (
          <UploadCloudIcon />
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--color-text)' }}>
        {loading ? '업로드 중...' : 'PDF 파일을 끌어 놓거나 클릭'}
      </div>
      <div className="t-caption">최대 50MB · SHA-256 무결성 자동 검증</div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        disabled={loading}
        onChange={(e) => {
          const f = e.target.files[0];
          if (f) {
            onFile(f);
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}

// ─── Participant Setup ────────────────────────────────────
function ParticipantSetup({ doc, onDone }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [participants, setParticipants] = useState([]); // [{email, name, role}]
  const [ownerIsSigner, setOwnerIsSigner] = useState(true);
  const [input, setInput] = useState('');
  const [role, setRole] = useState('signer');
  const [suggestions, setSugg] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const timer = useRef(null);

  const ownerEmail = user?.email || '';

  const handleChange = (e) => {
    const val = e.target.value;
    setInput(val);
    clearTimeout(timer.current);
    if (!val.trim()) {
      setSugg([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/auth/users/search?q=${encodeURIComponent(val.trim())}`);
        setSugg(
          data.filter(
            (u) => u.email !== ownerEmail && !participants.find((p) => p.email === u.email)
          )
        );
      } catch {}
    }, 200);
  };

  const addParticipant = (email, name = '') => {
    if (!email.trim()) return;
    if (email === ownerEmail) return;
    if (participants.find((p) => p.email === email)) return;
    setParticipants((prev) => [...prev, { email: email.trim(), name, role }]);
    setInput('');
    setSugg([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addParticipant(input);
    } else if (e.key === 'Escape') setSugg([]);
  };

  const removeParticipant = (email) => {
    setParticipants((prev) => prev.filter((p) => p.email !== email));
  };

  const updateParticipantRole = (email, newRole) => {
    setParticipants((prev) => prev.map((p) => (p.email === email ? { ...p, role: newRole } : p)));
  };

  const handleNext = async () => {
    setLoading(true);
    setError('');

    try {
      // 소유자 참여자 레코드 업데이트 (role 설정)
      // 소유자는 이미 upload시 자동 생성됨. ownerIsSigner=false이면 cc로 변경
      if (!ownerIsSigner) {
        // 소유자를 cc로 변경 (서명 불필요)
        const { data: parts } = await api.get(`/documents/${doc.id}/participants`);
        const ownerPart = parts.find((p) => p.is_owner);
        if (ownerPart) {
          await api.patch(`/documents/${doc.id}/participants/${ownerPart.id}`, { role: 'cc' });
        }
      }

      // 추가 참여자들 등록
      for (const p of participants) {
        try {
          await api.post(`/documents/${doc.id}/participants`, {
            email: p.email,
            name: p.name,
            role: p.role,
          });
        } catch (err) {
          setError((prev) => prev + `\n${p.email}: ${err.response?.data?.error || '추가 실패'}`);
        }
      }

      if (error) {
        setLoading(false);
        return;
      }

      // 에디터로 이동하여 필드 배치
      navigate(`/docs/${doc.id}`);
    } catch (err) {
      setError(err.response?.data?.error || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // 색상: 0=소유자, 1+=추가 참여자
  const allColors = [
    ownerIsSigner ? getParticipantColor(0) : '#9ca3af',
    ...participants.map((_, i) => getParticipantColor(i + 1)),
  ];

  return (
    <div className="col gap-5">
      {/* Upload success */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px',
          background: 'var(--color-success-subtle)',
          border: '1px solid var(--color-success)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <CheckIcon />
        </div>
        <div className="col" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>
            업로드 완료
          </div>
          <div className="truncate t-caption">{doc.name}</div>
        </div>
      </div>

      {/* Owner signing toggle */}
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>나도 서명자로 참여</div>
          <div className="t-caption">
            소유자인 나도 직접 서명 필드를 채워야 하는 경우 활성화하세요.
          </div>
        </div>
        <div
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            position: 'relative',
            cursor: 'pointer',
            background: ownerIsSigner ? 'var(--color-primary)' : 'var(--color-border)',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
          onClick={() => setOwnerIsSigner((v) => !v)}
        >
          <div
            style={{
              position: 'absolute',
              top: 3,
              left: ownerIsSigner ? 23 : 3,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'white',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </div>
      </div>

      {/* Participant list */}
      {(ownerIsSigner || participants.length > 0) && (
        <div className="col gap-2">
          <div className="label">서명 참여자</div>
          {ownerIsSigner && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: `${getParticipantColor(0)}12`,
                border: `1px solid ${getParticipantColor(0)}40`,
                borderRadius: 'var(--radius-control)',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: getParticipantColor(0),
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{user?.name || ownerEmail}</span>
                <span className="t-caption" style={{ marginLeft: 8 }}>
                  (나 · 소유자)
                </span>
              </div>
              <span className="badge badge-primary" style={{ fontSize: 10 }}>
                서명자
              </span>
            </div>
          )}
          {participants.map((p, i) => {
            const color = getParticipantColor(i + 1);
            return (
              <div
                key={p.email}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: `${color}0c`,
                  border: `1px solid ${color}30`,
                  borderRadius: 'var(--radius-control)',
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
                <div style={{ flex: 1, fontSize: 13 }} className="truncate">
                  {p.name || p.email}
                  {p.name && (
                    <span className="t-caption" style={{ marginLeft: 6 }}>
                      {p.email}
                    </span>
                  )}
                </div>
                <select
                  value={p.role}
                  onChange={(e) => updateParticipantRole(p.email, e.target.value)}
                  style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                  }}
                >
                  <option value="signer">서명자</option>
                  <option value="cc">참조만</option>
                </select>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 2,
                  }}
                  onClick={() => removeParticipant(p.email)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add participant input */}
      <div>
        <label className="label" style={{ marginBottom: 8 }}>
          참여자 추가
        </label>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                ref={inputRef}
                type="text"
                className="input"
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setSugg([]), 150)}
                placeholder="이메일 입력 후 Enter"
              />
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
                      onMouseDown={() => {
                        addParticipant(u.email, u.name);
                        inputRef.current?.focus();
                      }}
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
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'var(--color-bg-subtle)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--color-primary)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 600,
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
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input"
              style={{ width: 'auto', minWidth: 90 }}
            >
              <option value="signer">서명자</option>
              <option value="cc">참조만</option>
            </select>
            <button className="btn btn-secondary" onClick={() => addParticipant(input)}>
              추가
            </button>
          </div>
          <div className="help">가입된 사용자를 검색하거나 이메일을 직접 입력하세요.</div>
        </div>
      </div>

      {error && (
        <div
          style={{
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

      <div className="row gap-3" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => navigate(`/docs/${doc.id}`)}>
          나중에 설정
        </button>
        <button className="btn btn-primary" onClick={handleNext} disabled={loading}>
          {loading ? '처리 중…' : '필드 배치하기 →'}
        </button>
      </div>
    </div>
  );
}

// ─── UploadPage ───────────────────────────────────────────
export default function UploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file) => {
    setLoading(true);
    setError('');
    const form = new FormData();
    form.append('pdf', file);
    try {
      const { data } = await api.post('/documents/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      setDoc(data);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error ?? '업로드 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gs-page-narrow">
      {/* Stepper */}
      <div className="gs-stepper">
        <div className={`gs-step${step === 1 ? ' is-active' : ' is-done'}`}>
          <div className="gs-step-num">{step > 1 ? '✓' : '1'}</div>
          <span className="gs-step-label">PDF 업로드</span>
        </div>
        <div className="gs-step-line" />
        <div className={`gs-step${step === 2 ? ' is-active' : ''}`}>
          <div className="gs-step-num">2</div>
          <span className="gs-step-label">참여자 설정</span>
        </div>
      </div>

      <PageHeader
        title={step === 1 ? '새 서명 요청' : '참여자 설정'}
        subtitle={
          step === 1
            ? 'PDF를 업로드하고 서명자를 초대하세요.'
            : '서명자와 참조자를 추가하고 소유자 서명 여부를 설정하세요.'
        }
      >
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/docs')}>
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
          취소
        </button>
      </PageHeader>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--color-danger-subtle)',
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-control)',
            marginBottom: 20,
            fontSize: 13,
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}

      {step === 1 && <Dropzone onFile={handleFile} loading={loading} />}
      {step === 2 && doc && <ParticipantSetup doc={doc} onDone={() => navigate('/docs')} />}
    </div>
  );
}
