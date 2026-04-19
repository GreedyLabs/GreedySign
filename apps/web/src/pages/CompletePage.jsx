/**
 * CompletePage — 서명 완료 인증서 페이지
 * Route: /docs/:docId/complete
 * 서명자 완료 시 리다이렉트되는 전체화면 페이지.
 * 문서 완료 여부와 관계없이 내 서명 완료 상태를 표시하고,
 * 전원 완료 시엔 frozen PDF 해시와 함께 다운로드 버튼을 제공한다.
 */
import { useEffect, useState } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from '../lib/router';
import { useAuthStore } from '../stores/authStore';

// ─── Icons ────────────────────────────────────────────────
const CheckCircle = ({ size = 24, color = 'currentColor' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m7 12 4 4 6-7" />
  </svg>
);
const ClockIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const DownloadIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M8 2v9M5 9l3 3 3-3M2 13h12" />
  </svg>
);
const ShieldIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M12 2L4 6v6c0 5 4.5 9 8 10 3.5-1 8-5 8-10V6l-8-4Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const DocIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </svg>
);

// ─── Helpers ─────────────────────────────────────────────
function formatDateTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Avatar({ name, size = 36 }) {
  const initials = (name || '?')[0].toUpperCase();
  const hue = name ? (name.charCodeAt(0) * 37) % 360 : 220;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: `hsl(${hue},55%,88%)`,
        color: `hsl(${hue},55%,35%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Signer row ───────────────────────────────────────────
function SignerRow({ signer, isMe }) {
  const done = signer.signing_status === 'completed';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <Avatar name={signer.name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)' }}>
            {signer.name}
          </span>
          {isMe && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 10,
                background: 'var(--color-primary-subtle)',
                color: 'var(--color-primary)',
              }}
            >
              나
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 1 }}>
          {signer.email}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {done ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                justifyContent: 'flex-end',
                color: 'var(--color-success)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <CheckCircle size={14} color="var(--color-success)" /> 서명 완료
            </div>
            {signer.completed_at && (
              <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {formatDateTime(signer.completed_at)}
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: 'var(--color-text-muted)',
              fontSize: 13,
            }}
          >
            <ClockIcon size={13} /> 대기 중
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CompletePage ─────────────────────────────────────────
export default function CompletePage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDl] = useState(false);

  useEffect(() => {
    api
      .get(`/documents/${docId}/certificate`)
      .then(({ data }) => setCert(data))
      .catch((err) => {
        const status = err.response?.status;
        if (status === 403) setError({ msg: '이 문서에 대한 접근 권한이 없습니다.', status });
        else if (status === 404) setError({ msg: '문서를 찾을 수 없습니다.', status });
        else setError({ msg: err.response?.data?.error ?? '인증서를 불러올 수 없습니다', status });
      })
      .finally(() => setLoading(false));
  }, [docId]);

  const handleDownload = async () => {
    setDl(true);
    try {
      const res = await api.post(
        `/documents/${docId}/export`,
        { mode: 'combined' },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cert?.document?.name?.replace('.pdf', '') ?? 'document'}_fully_signed.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error ?? '다운로드 실패');
    } finally {
      setDl(false);
    }
  };

  if (loading)
    return (
      <div className="gs-loading">
        <div className="gs-spinner" />
      </div>
    );

  if (error)
    return (
      <div className="gs-loading">
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-danger)', marginBottom: 8, fontWeight: 500 }}>
            {error.msg}
          </p>
          {error.status === 403 && (
            <p className="t-caption" style={{ marginBottom: 16 }}>
              문서 소유자에게 초대를 요청하세요.
            </p>
          )}
          <button className="btn btn-ghost" onClick={() => navigate('/docs')}>
            ← 문서 목록으로
          </button>
        </div>
      </div>
    );

  const { document: doc, signers, completed_signers, total_signers } = cert;
  const isFullyComplete = doc.is_complete;
  const myEntry = signers.find((s) => s.email === user?.email);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 16px',
      }}
    >
      {/* Header nav */}
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 32,
        }}
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
            <path d="m10 4-4 4 4 4" />
          </svg>
          문서 목록
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/docs/${docId}`)}>
          문서 열기 →
        </button>
      </div>

      <div style={{ width: '100%', maxWidth: 640 }}>
        {/* Completion badge */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              margin: '0 auto 16px',
              background: isFullyComplete
                ? 'var(--color-success-subtle)'
                : 'var(--color-primary-subtle)',
              border: `2px solid ${isFullyComplete ? 'var(--color-success)' : 'var(--color-primary)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle
              size={32}
              color={isFullyComplete ? 'var(--color-success)' : 'var(--color-primary)'}
            />
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--color-text)',
              marginBottom: 6,
            }}
          >
            {isFullyComplete ? '모든 서명이 완료되었습니다' : '내 서명이 제출되었습니다'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
            {isFullyComplete
              ? `${formatDateTime(doc.completed_at)}에 문서가 최종 확정되었습니다.`
              : `${completed_signers}/${total_signers}명이 서명을 완료했습니다.`}
          </p>
        </div>

        {/* Document card */}
        <div className="gs-panel" style={{ marginBottom: 16 }}>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-card)',
                background: 'var(--color-primary-subtle)',
                border: '1px solid var(--color-primary-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
                flexShrink: 0,
              }}
            >
              <DocIcon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text)' }}
                className="truncate"
              >
                {doc.name}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {doc.owner_name} 요청 · {doc.page_count}페이지
              </div>
            </div>
            {isFullyComplete && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleDownload}
                disabled={downloading}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <DownloadIcon size={13} />
                {downloading ? '…' : '다운로드'}
              </button>
            )}
          </div>
        </div>

        {/* Signers list */}
        <div className="gs-panel" style={{ marginBottom: 16 }}>
          <div style={{ padding: '14px 20px 4px', borderBottom: '1px solid var(--color-border)' }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              서명자 현황 ({completed_signers}/{total_signers})
            </span>
          </div>
          <div style={{ padding: '0 20px' }}>
            {signers.map((s) => (
              <SignerRow key={s.email} signer={s} isMe={s.email === user?.email} />
            ))}
            {signers.length === 0 && (
              <p
                style={{
                  padding: '20px 0',
                  color: 'var(--color-text-muted)',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                서명자가 없습니다.
              </p>
            )}
          </div>
        </div>

        {/* Integrity info (only when frozen) */}
        {isFullyComplete && doc.signed_pdf_hash && (
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 'var(--radius-card)',
              background: 'var(--color-success-subtle)',
              border: '1px solid var(--color-success)',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <ShieldIcon size={15} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--color-success)',
                  marginBottom: 4,
                }}
              >
                문서 무결성 보장 (SHA-256)
              </div>
              <code
                style={{
                  fontSize: 10.5,
                  wordBreak: 'break-all',
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-mono, monospace)',
                  lineHeight: 1.6,
                }}
              >
                {doc.signed_pdf_hash}
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
