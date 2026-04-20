/**
 * CompletePage — 전자서명 인증서 (Certificate of Completion)
 * Route: /docs/:docId/complete
 *
 * 서명자 완료 직후 리다이렉트되는 전체화면 페이지. 화면 자체가 "인증서"이며,
 * 브라우저 인쇄(⌘/Ctrl + P) → "PDF 로 저장" 으로 인증서를 보존할 수 있다.
 *
 * 포함되는 정보(서명 인증서 표준 항목 기준):
 *   1) 문서 식별자(UUID), 페이지 수, 크기, 서명 모드
 *   2) 무결성 — 원본 SHA-256, 확정본 SHA-256
 *   3) 소유자 — 이름·이메일
 *   4) 참여자별 — 이름, 이메일, 역할(서명자/참조), 초대/수락/완료 시각, 서명 IP
 *   5) 감사 타임라인 — 업로드·발송·수락·서명·완료 등 주요 이벤트
 *
 * 다운로드 버튼은 두 가지를 제공한다.
 *   a. "확정본 PDF 다운로드" — 모든 서명이 박힌 합본 PDF (signed_pdf_path)
 *   b. "인증서 인쇄/PDF" — window.print() (인증서 자체를 PDF 로 저장)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import api, { ApiError } from '../services/api';
import { useParams, useNavigate } from '../lib/router';
import { useAuthStore } from '../stores/authStore';
import BrandMark from '../components/ui/BrandMark';
import { formatDateTimeLong, getTimeZoneLabel } from '../lib/format';

// ─── Types ─────────────────────────────────────────────────
type ParticipantRole = 'signer' | 'cc' | string;
type InviteStatus = 'pending' | 'accepted' | 'declined' | string;
type SigningStatusValue = 'not_started' | 'in_progress' | 'completed' | 'declined' | string;
type SigningMode = 'parallel' | 'sequential' | string;

interface CertParticipant {
  id: number | string;
  name?: string | null;
  email?: string | null;
  role: ParticipantRole;
  is_owner?: boolean;
  invite_status?: InviteStatus;
  signing_status?: SigningStatusValue;
  decline_reason?: string | null;
  signing_order?: number | null;
  invited_at?: string | null;
  responded_at?: string | null;
  completed_at?: string | null;
  signed_ip?: string | null;
  [key: string]: unknown;
}

interface CertDocument {
  id: string;
  name: string;
  page_count?: number | null;
  size_bytes?: number | null;
  signing_mode?: SigningMode;
  status?: string;
  is_complete?: boolean;
  has_signed_pdf?: boolean;
  created_at?: string | null;
  completed_at?: string | null;
  voided_at?: string | null;
  voided_reason?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  pdf_hash?: string | null;
  signed_pdf_hash?: string | null;
  [key: string]: unknown;
}

interface AuditRow {
  id: number | string;
  action: string;
  created_at: string;
  ip?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  participant_name?: string | null;
  participant_email?: string | null;
  [key: string]: unknown;
}

interface CertificateData {
  document: CertDocument;
  participants: CertParticipant[];
  signers: number;
  completed_signers: number;
  total_signers: number;
  audit_trail?: AuditRow[] | null;
  [key: string]: unknown;
}

interface PageError {
  msg: string;
  status?: number;
}

// ─── Icons ─────────────────────────────────────────────────
interface IconSizeProps {
  size?: number;
}
interface CheckCircleProps extends IconSizeProps {
  color?: string;
}

const CheckCircle = ({ size = 24, color = 'currentColor' }: CheckCircleProps) => (
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
const ClockIcon = ({ size = 16 }: IconSizeProps) => (
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
const DownloadIcon = ({ size = 14 }: IconSizeProps) => (
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
const PrintIcon = ({ size = 14 }: IconSizeProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M4 6V2h8v4M4 11H2V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4h-2M4 10h8v4H4z" />
  </svg>
);
const ShieldIcon = ({ size = 14 }: IconSizeProps) => (
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

// ─── Helpers ───────────────────────────────────────────────
// 공용 `formatDateTimeLong` 은 TZ 축약명까지 포함 (예: "... KST").
const formatDateTime = formatDateTimeLong;

function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.response.data;
    if (body && typeof body === 'object' && !(body instanceof Blob)) {
      const maybeError = (body as { error?: unknown }).error;
      if (typeof maybeError === 'string') return maybeError;
    }
    return err.message ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

const SIGNING_MODE_LABEL: Record<string, string> = {
  parallel: '병렬 (자유 순서)',
  sequential: '순차 (지정 순서)',
};

const ROLE_LABEL: Record<string, string> = { signer: '서명자', cc: '참조자' };

const AUDIT_LABEL: Record<string, string> = {
  document_uploaded: '문서 업로드',
  document_sent: '서명 요청 발송',
  invite_accepted: '초대 수락',
  invite_declined: '초대 거절',
  signing_completed: '서명 완료',
  signing_declined: '서명 거부',
  document_completed: '문서 확정',
  document_voided: '문서 무효화',
  document_exported: '문서 내보내기',
};

interface AvatarLocalProps {
  name?: string | null;
  size?: number;
}

function Avatar({ name, size = 36 }: AvatarLocalProps) {
  const initials = (name || '?')[0].toUpperCase();
  const hue = name ? (name.charCodeAt(0) * 37) % 360 : 220;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: `hsl(${hue},55%,90%)`,
        color: `hsl(${hue},55%,32%)`,
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

// ─── Inline CSS (인쇄 스타일 포함) ─────────────────────────
const CERT_CSS = `
  .gs-cert-page {
    min-height: 100vh;
    background: var(--color-bg-subtle);
    padding: 32px 16px 80px;
    display: flex; flex-direction: column; align-items: center;
  }
  .gs-cert-toolbar {
    width: 100%;
    max-width: 880px;
    margin: 0 0 20px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
  }
  .gs-cert {
    width: 100%;
    max-width: 880px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: 56px 64px;
    color: var(--color-text);
    font-feature-settings: 'tnum' 1, 'lnum' 1;
  }
  .gs-cert-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 24px;
    padding-bottom: 28px;
    border-bottom: 2px solid var(--color-primary);
    margin-bottom: 32px;
  }
  .gs-cert-brand {
    display: flex; align-items: center; gap: 10px;
    font-family: var(--font-display);
    font-weight: 700; font-size: 16px;
    color: var(--color-text);
  }
  .gs-cert-eyebrow {
    font-size: 11px; font-weight: 600;
    color: var(--color-primary);
    text-transform: uppercase; letter-spacing: 0.14em;
    margin-bottom: 6px;
  }
  .gs-cert-title {
    font-family: var(--font-display);
    font-size: 28px; font-weight: 700;
    line-height: 1.2; letter-spacing: -0.01em;
    margin: 0;
  }
  .gs-cert-subtitle {
    font-size: 13.5px; color: var(--color-text-muted);
    margin-top: 8px; line-height: 1.55;
  }
  .gs-cert-stamp {
    flex-shrink: 0;
    width: 96px; height: 96px;
    border-radius: 50%;
    border: 2.5px solid var(--color-success);
    color: var(--color-success);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; gap: 4px;
    font-family: var(--font-display);
    font-weight: 700;
    transform: rotate(-8deg);
    background: rgba(31, 122, 76, 0.04);
  }
  .gs-cert-stamp-pending {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: rgba(42, 63, 175, 0.04);
  }

  .gs-cert-section {
    margin-bottom: 32px;
  }
  .gs-cert-section-title {
    font-family: var(--font-display);
    font-size: 11px; font-weight: 700;
    color: var(--color-text-muted);
    text-transform: uppercase; letter-spacing: 0.12em;
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }
  .gs-cert-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 32px;
  }
  .gs-cert-field-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 4px;
  }
  .gs-cert-field-value {
    font-size: 13.5px;
    color: var(--color-text);
    line-height: 1.5;
    word-break: break-word;
  }
  .gs-cert-mono {
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--color-text-secondary);
    background: var(--color-bg-muted);
    border: 1px solid var(--color-border-subtle);
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    word-break: break-all;
    line-height: 1.5;
  }

  .gs-cert-signer {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    margin-bottom: 10px;
    background: var(--color-surface);
  }
  .gs-cert-signer:last-child { margin-bottom: 0; }
  .gs-cert-signer-head {
    display: flex; align-items: center; gap: 12px;
  }
  .gs-cert-signer-name {
    font-size: 14px; font-weight: 600; color: var(--color-text);
    display: flex; align-items: center; gap: 6px;
  }
  .gs-cert-signer-meta {
    font-size: 12px; color: var(--color-text-muted);
    margin-top: 2px;
  }
  .gs-cert-signer-status {
    margin-left: auto;
    font-size: 12px; font-weight: 600;
    display: flex; align-items: center; gap: 5px;
    flex-shrink: 0;
  }
  .gs-cert-signer-detail {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--color-border);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 16px;
    font-size: 12px;
  }
  .gs-cert-signer-detail dt {
    color: var(--color-text-muted);
    font-weight: 500;
  }
  .gs-cert-signer-detail dd {
    margin: 0; color: var(--color-text);
    font-family: var(--font-mono);
    font-size: 11.5px;
  }

  .gs-cert-tag {
    font-size: 10.5px; font-weight: 600;
    padding: 1px 6px; border-radius: 10px;
    background: var(--color-primary-subtle);
    color: var(--color-primary);
  }
  .gs-cert-tag.is-cc {
    background: var(--color-bg-muted);
    color: var(--color-text-secondary);
  }
  .gs-cert-tag.is-owner {
    background: var(--color-warning-subtle);
    color: var(--color-warning);
  }

  .gs-cert-timeline {
    border-left: 2px solid var(--color-border);
    padding-left: 16px;
  }
  .gs-cert-timeline-row {
    position: relative;
    padding: 6px 0;
    font-size: 12.5px;
    line-height: 1.55;
  }
  .gs-cert-timeline-row::before {
    content: '';
    position: absolute;
    left: -22px; top: 12px;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--color-primary);
  }
  .gs-cert-timeline-time {
    font-family: var(--font-mono);
    font-size: 11px; color: var(--color-text-muted);
    margin-right: 8px;
  }
  .gs-cert-timeline-actor {
    color: var(--color-text);
    font-weight: 600;
  }
  .gs-cert-timeline-action {
    color: var(--color-text-secondary);
    margin-left: 4px;
  }
  .gs-cert-timeline-meta {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: 11px; margin-left: 6px;
  }

  .gs-cert-foot {
    margin-top: 32px; padding-top: 24px;
    border-top: 1px solid var(--color-border);
    display: flex; align-items: flex-start; gap: 14px;
  }
  .gs-cert-foot-text {
    font-size: 11.5px; color: var(--color-text-muted);
    line-height: 1.6;
  }

  @media print {
    @page { size: A4; margin: 16mm; }
    body { background: #ffffff !important; }
    /* flex-center 대신 block — Chromium 에서 flex 컨테이너 페이지 break
       계산이 불안정해 하단이 잘리는 현상을 피한다. */
    .gs-cert-page {
      display: block;
      min-height: 0;
      padding: 0;
      background: #ffffff;
    }
    .gs-cert-toolbar { display: none !important; }
    .gs-cert-noprint { display: none !important; }
    .gs-cert {
      max-width: none; width: 100%;
      border: none; box-shadow: none; border-radius: 0;
      /* 타임라인 ::before 점(left:-22px) 이 페이지 마진 밖으로 튀지 않도록
         좌측 여백을 살짝 확보. */
      padding: 0 2mm;
    }
    .gs-cert-section { break-inside: avoid; }
    .gs-cert-signer { break-inside: avoid; }
    .gs-cert-head { break-after: avoid; }
    /* 컬러 배경/테두리가 그대로 찍히도록 — 도장·태그·해시 박스 등. */
    .gs-cert-stamp,
    .gs-cert-tag,
    .gs-cert-head,
    .gs-cert-mono {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
`;

// ─── CompletePage ──────────────────────────────────────────
export default function CompletePage() {
  const params = useParams<{ docId: string }>();
  const docId = params.docId;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PageError | null>(null);
  const [downloading, setDl] = useState(false);
  const downloadAnchorRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    api
      .get<CertificateData>(`/documents/${docId}/certificate`)
      .then(({ data }) => setCert(data))
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          const status = err.response.status;
          if (status === 403) {
            setError({ msg: '이 문서에 대한 접근 권한이 없습니다.', status });
          } else if (status === 404) {
            setError({ msg: '문서를 찾을 수 없습니다.', status });
          } else {
            setError({ msg: errorMessage(err, '인증서를 불러올 수 없습니다'), status });
          }
        } else {
          setError({ msg: errorMessage(err, '인증서를 불러올 수 없습니다') });
        }
      })
      .finally(() => setLoading(false));
  }, [docId]);

  // ─── 확정본 PDF 다운로드 ──────────────────────────────
  const handleDownloadSigned = async () => {
    setDl(true);
    try {
      const res = await api.post<Blob>(
        `/documents/${docId}/export`,
        { mode: 'combined' },
        { responseType: 'blob' },
      );
      // api 레이어가 !res.ok 일 때 ApiError 로 분기하므로, 여기 도달했다면
      // 본문은 서버가 success 로 돌려준 Blob 이라 간주한다.
      const blob =
        res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cert?.document?.name?.replace('.pdf', '') ?? 'document'}_fully_signed.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      let msg = errorMessage(err, '다운로드 실패');
      if (err instanceof ApiError) {
        const data = err.response.data;
        if (data instanceof Blob) {
          try {
            const text = await data.text();
            const parsed = JSON.parse(text) as { error?: string };
            msg = parsed.error ?? text;
          } catch {
            /* keep msg */
          }
        }
      }
      alert('확정본 다운로드 실패: ' + msg);
    } finally {
      setDl(false);
    }
  };

  const handlePrint = () => window.print();

  // ── 타임라인용 actor 표시 ──────────────────────────
  const renderActor = (row: AuditRow): string => {
    const name = row.user_name || row.participant_name || row.user_email || row.participant_email;
    return name ?? '시스템';
  };

  // 가입자 이메일 매칭으로 "나"를 식별 (소문자 비교).
  const me = useMemo<CertParticipant | null>(() => {
    if (!cert || !user) return null;
    const myEmail = user.email?.toLowerCase();
    return cert.participants.find((p) => p.email?.toLowerCase() === myEmail) ?? null;
  }, [cert, user]);

  // 열람 시점의 브라우저 로컬 TZ — 인증서 푸터 고지용.
  const tz = useMemo(() => getTimeZoneLabel(), []);

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

  if (!cert) return null;

  const { document: doc, participants, completed_signers, total_signers, audit_trail } = cert;
  const isFullyComplete = !!doc.is_complete;
  const hasSignedPdf = !!doc.has_signed_pdf;

  return (
    <div className="gs-cert-page">
      <style>{CERT_CSS}</style>

      {/* ───── 툴바 (인쇄 시 숨김) ───── */}
      <div className="gs-cert-toolbar gs-cert-noprint">
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/docs/${docId}`)}>
            문서 열기
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <PrintIcon size={13} /> 인증서 인쇄/PDF
          </button>
          {isFullyComplete && hasSignedPdf && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDownloadSigned}
              disabled={downloading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              ref={downloadAnchorRef}
            >
              <DownloadIcon size={13} />
              {downloading ? '준비 중…' : '확정본 PDF 다운로드'}
            </button>
          )}
        </div>
      </div>

      {/* ───── 인증서 카드 ───── */}
      <article className="gs-cert" id="certificate">
        {/* Head */}
        <header className="gs-cert-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="gs-cert-brand">
              <BrandMark size={26} radius={6} />
              <span>GreedySign</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <div className="gs-cert-eyebrow">Certificate of Completion</div>
              <h1 className="gs-cert-title">전자서명 완료 인증서</h1>
              <p className="gs-cert-subtitle">
                본 인증서는 GreedySign 전자서명 플랫폼이 위 문서에 대한 서명 절차를 기록·검증한
                결과를 증명합니다. 모든 서명자의 신원·동의·서명 시각·접속 IP 가 감사 로그에 보존되며,
                확정된 PDF 원본은 SHA-256 해시로 무결성이 보장됩니다.
              </p>
            </div>
          </div>
          <div
            className={`gs-cert-stamp${isFullyComplete ? '' : ' gs-cert-stamp-pending'}`}
            aria-hidden
          >
            <CheckCircle size={22} color="currentColor" />
            <div style={{ fontSize: 11, lineHeight: 1.1 }}>
              {isFullyComplete ? 'COMPLETED' : 'IN PROGRESS'}
            </div>
            <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.85 }}>
              {completed_signers}/{total_signers}
            </div>
          </div>
        </header>

        {/* 1. 문서 식별 */}
        <section className="gs-cert-section">
          <h2 className="gs-cert-section-title">1. 문서 정보</h2>
          <div className="gs-cert-grid">
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="gs-cert-field-label">문서명</div>
              <div className="gs-cert-field-value" style={{ fontWeight: 600, fontSize: 15 }}>
                {doc.name}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="gs-cert-field-label">문서 ID (UUID)</div>
              <div className="gs-cert-mono">{doc.id}</div>
            </div>
            <div>
              <div className="gs-cert-field-label">페이지 수</div>
              <div className="gs-cert-field-value">{doc.page_count ?? '—'} 페이지</div>
            </div>
            <div>
              <div className="gs-cert-field-label">파일 크기</div>
              <div className="gs-cert-field-value">{formatBytes(doc.size_bytes)}</div>
            </div>
            <div>
              <div className="gs-cert-field-label">서명 모드</div>
              <div className="gs-cert-field-value">
                {(doc.signing_mode && SIGNING_MODE_LABEL[doc.signing_mode]) ?? doc.signing_mode ?? '—'}
              </div>
            </div>
            <div>
              <div className="gs-cert-field-label">현재 상태</div>
              <div
                className="gs-cert-field-value"
                style={{
                  color: isFullyComplete
                    ? 'var(--color-success)'
                    : doc.status === 'voided'
                      ? 'var(--color-danger)'
                      : 'var(--color-primary)',
                  fontWeight: 600,
                }}
              >
                {isFullyComplete
                  ? '서명 완료'
                  : doc.status === 'voided'
                    ? '무효화됨'
                    : doc.status === 'in_progress'
                      ? '서명 진행 중'
                      : '초안'}
              </div>
            </div>
            <div>
              <div className="gs-cert-field-label">생성 시각</div>
              <div className="gs-cert-field-value">{formatDateTime(doc.created_at)}</div>
            </div>
            <div>
              <div className="gs-cert-field-label">완료 시각</div>
              <div className="gs-cert-field-value">
                {doc.completed_at ? formatDateTime(doc.completed_at) : '—'}
              </div>
            </div>
            {doc.voided_at && (
              <>
                <div>
                  <div className="gs-cert-field-label">무효화 시각</div>
                  <div className="gs-cert-field-value">{formatDateTime(doc.voided_at)}</div>
                </div>
                <div>
                  <div className="gs-cert-field-label">무효화 사유</div>
                  <div className="gs-cert-field-value">{doc.voided_reason ?? '—'}</div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 2. 소유자 */}
        <section className="gs-cert-section">
          <h2 className="gs-cert-section-title">2. 문서 소유자</h2>
          <div className="gs-cert-grid">
            <div>
              <div className="gs-cert-field-label">이름</div>
              <div className="gs-cert-field-value">{doc.owner_name ?? '—'}</div>
            </div>
            <div>
              <div className="gs-cert-field-label">이메일</div>
              <div className="gs-cert-field-value">{doc.owner_email ?? '—'}</div>
            </div>
          </div>
        </section>

        {/* 3. 참여자 */}
        <section className="gs-cert-section">
          <h2 className="gs-cert-section-title">
            3. 참여자 ({completed_signers}/{total_signers} 서명 완료)
          </h2>
          {participants.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>참여자가 없습니다.</p>
          ) : (
            participants.map((p) => {
              const done = p.signing_status === 'completed';
              const declined = p.signing_status === 'declined' || p.invite_status === 'declined';
              const isMe = !!me && p.id === me.id;
              return (
                <div className="gs-cert-signer" key={p.id}>
                  <div className="gs-cert-signer-head">
                    <Avatar name={p.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="gs-cert-signer-name">
                        <span>{p.name}</span>
                        {p.is_owner && <span className="gs-cert-tag is-owner">소유자</span>}
                        {p.role === 'cc' ? (
                          <span className="gs-cert-tag is-cc">{ROLE_LABEL[p.role]}</span>
                        ) : (
                          <span className="gs-cert-tag">{ROLE_LABEL[p.role] ?? p.role}</span>
                        )}
                        {isMe && <span className="gs-cert-tag">나</span>}
                      </div>
                      <div className="gs-cert-signer-meta">{p.email}</div>
                    </div>
                    <div
                      className="gs-cert-signer-status"
                      style={{
                        color: done
                          ? 'var(--color-success)'
                          : declined
                            ? 'var(--color-danger)'
                            : 'var(--color-text-muted)',
                      }}
                    >
                      {done ? (
                        <>
                          <CheckCircle size={13} color="currentColor" /> 서명 완료
                        </>
                      ) : declined ? (
                        <>거부{p.decline_reason ? ` · ${p.decline_reason}` : ''}</>
                      ) : (
                        <>
                          <ClockIcon size={13} />{' '}
                          {p.invite_status === 'pending' ? '초대 미응답' : '서명 대기'}
                        </>
                      )}
                    </div>
                  </div>

                  {/* 상세 메타 — 인증서 핵심 정보 */}
                  <dl className="gs-cert-signer-detail">
                    <dt>참여자 ID</dt>
                    <dd>{p.id}</dd>
                    {typeof p.signing_order === 'number' && (
                      <>
                        <dt>서명 순서</dt>
                        <dd>{p.signing_order}</dd>
                      </>
                    )}
                    <dt>초대 발송</dt>
                    <dd>{formatDateTime(p.invited_at)}</dd>
                    <dt>초대 응답</dt>
                    <dd>
                      {p.responded_at
                        ? `${formatDateTime(p.responded_at)} (${
                            p.invite_status === 'declined' ? '거절' : '수락'
                          })`
                        : '—'}
                    </dd>
                    {p.role === 'signer' && (
                      <>
                        <dt>서명 시각</dt>
                        <dd>{p.completed_at ? formatDateTime(p.completed_at) : '—'}</dd>
                        <dt>서명 IP</dt>
                        <dd>{p.signed_ip ?? '—'}</dd>
                      </>
                    )}
                  </dl>
                </div>
              );
            })
          )}
        </section>

        {/* 4. 무결성 / 해시 */}
        <section className="gs-cert-section">
          <h2 className="gs-cert-section-title">4. 무결성 (SHA-256)</h2>
          <div className="gs-cert-grid">
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="gs-cert-field-label">원본 PDF 해시</div>
              <div className="gs-cert-mono">{doc.pdf_hash ?? '— (계산 전)'}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="gs-cert-field-label">확정본 PDF 해시</div>
              <div className="gs-cert-mono">
                {doc.signed_pdf_hash ?? (isFullyComplete ? '— (생성 실패)' : '— (미확정)')}
              </div>
            </div>
          </div>
          {doc.signed_pdf_hash && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--color-success-subtle)',
                border: '1px solid var(--color-success)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                color: 'var(--color-success)',
              }}
            >
              <ShieldIcon size={14} />
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                확정 이후 본 해시값과 일치하지 않는 PDF 는 위·변조된 것으로 간주합니다. 다운로드 시
                매번 서버에서 해시 검증이 수행됩니다.
              </span>
            </div>
          )}
        </section>

        {/* 5. 감사 타임라인 */}
        <section className="gs-cert-section">
          <h2 className="gs-cert-section-title">
            5. 감사 타임라인 ({audit_trail?.length ?? 0}건)
          </h2>
          {audit_trail && audit_trail.length > 0 ? (
            <div className="gs-cert-timeline">
              {audit_trail.map((row) => (
                <div className="gs-cert-timeline-row" key={row.id}>
                  <span className="gs-cert-timeline-time">{formatDateTime(row.created_at)}</span>
                  <span className="gs-cert-timeline-actor">{renderActor(row)}</span>
                  <span className="gs-cert-timeline-action">
                    {AUDIT_LABEL[row.action] ?? row.action}
                  </span>
                  {row.ip && <span className="gs-cert-timeline-meta">· IP {row.ip}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>감사 로그가 없습니다.</p>
          )}
        </section>

        {/* Footer */}
        <footer className="gs-cert-foot">
          <ShieldIcon size={18} />
          <div className="gs-cert-foot-text">
            본 인증서는 자동 생성된 전자 문서이며, 별도 서명·날인이 없어도 유효합니다. 발급 시각:{' '}
            {formatDateTime(new Date().toISOString())}. 위 문서 ID 와 SHA-256 해시값으로 GreedySign
            관리자에게 진본 여부를 검증 요청할 수 있습니다.
            <div style={{ marginTop: 6, fontSize: 11 }}>
              본 인증서의 모든 시각은 열람자 로컬 타임존({tz.iana}, {tz.short}, {tz.offset}) 기준으로
              표시됩니다. 원본 시각은 UTC 로 저장되어 있으며, 다른 타임존에서 열람 시 해당 로컬 시각으로
              자동 변환됩니다.
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
