import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useSearch } from '@tanstack/react-router';
import { useAuthStore } from '../stores/authStore';
import { ApiError } from '../services/api';
import { Link, useNavigate } from '../lib/router';

function ShieldIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M8 1.5 14 4v4c0 3.5-2.5 6-6 7C2.5 14 0 11.5 0 8V4l6-2.5Z" />
      <path d="m5.5 8 2 2 3-3.5" />
    </svg>
  );
}

interface AuthPageProps {
  inviteEmail?: string | null;
}

export default function AuthPage({ inviteEmail = null }: AuthPageProps) {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const navigate = useNavigate();
  // `/login?redirect=/docs/abc` 형태로 들어온 경우 로그인 성공 시 그 경로로
  // 복귀. strict:false 로 InvitePage 등 다른 라우트에서도 이 컴포넌트를 쓸
  // 때 에러나지 않게 한다.
  const search = useSearch({ strict: false }) as { redirect?: string } | undefined;
  const redirectTo =
    typeof search?.redirect === 'string' && search.redirect.startsWith('/')
      ? search.redirect
      : '/docs';

  const handleSuccess = async (response: CredentialResponse) => {
    try {
      if (!response.credential) throw new Error('Google credential 없음');
      await loginWithGoogle(response.credential);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.response.data as { error?: string } | undefined;
        alert(payload?.error || '로그인에 실패했습니다');
      } else {
        alert((err as Error).message || '로그인에 실패했습니다');
      }
    }
  };

  return (
    <div className="gs-auth">
      {/* ── 브랜드 사이드 ── */}
      <div className="gs-auth-brand">
        {/* 로고 — 클릭 시 랜딩 페이지로 이동 (AuthPage는 비로그인 상태에서만 렌더됨). */}
        <Link
          to="/"
          className="row gap-2"
          style={{
            color: 'inherit',
            textDecoration: 'none',
            alignSelf: 'flex-start',
          }}
          aria-label="GreedySign 홈으로"
        >
          <svg width={28} height={28} viewBox="0 0 32 32" fill="none">
            <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--color-primary)" />
            <path
              d="M10 12.5a5.5 5.5 0 1 1 0 7"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path d="M12 20.5h7.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="22.5" cy="20.5" r="1.25" fill="#fff" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            GreedySign
          </span>
        </Link>

        {/* 장식 문서 스택 */}
        <div className="gs-auth-doc-stack">
          <div className="gs-auth-doc" style={{ top: 0, left: 0, transform: 'rotate(-4deg)' }}>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              기술용역계약서
            </div>
            <div className="gs-auth-doc-line" style={{ width: '70%' }} />
            <div className="gs-auth-doc-line" style={{ width: '92%' }} />
            <div className="gs-auth-doc-line" style={{ width: '40%' }} />
            <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <div
                style={{
                  width: 90,
                  height: 28,
                  border: '1.5px dashed var(--color-primary)',
                  borderRadius: 3,
                  background: 'rgba(42,63,175,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: 'var(--color-primary)',
                  fontWeight: 500,
                }}
              >
                서명
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>2026-04-18</div>
            </div>
          </div>

          <div className="gs-auth-doc" style={{ top: 60, left: 90, transform: 'rotate(3deg)' }}>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              비밀유지계약(NDA)
            </div>
            <div className="gs-auth-doc-line" style={{ width: '86%' }} />
            <div className="gs-auth-doc-line" style={{ width: '64%' }} />
            <div className="gs-auth-doc-line" style={{ width: '72%' }} />
            <div
              style={{
                marginTop: 14,
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 18,
                color: 'var(--color-primary)',
              }}
            >
              박민지
            </div>
          </div>

          <div
            className="gs-auth-doc"
            style={{ top: 136, left: 24, transform: 'rotate(-2deg)', width: 300 }}
          >
            <div className="row gap-2" style={{ marginBottom: 8 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 2,
                  background: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 12 2 8l1.5-1.5L6 9l6.5-6.5L14 4 6 12Z" />
                </svg>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>서명 완료 · 3 / 3 명</div>
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              SHA-256 · a3f7…9c21
            </div>
          </div>
        </div>

        {/* 인용문 */}
        <div>
          <div className="gs-auth-quote-mark">"</div>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              lineHeight: 1.4,
              margin: '0 0 16px',
              color: 'var(--color-text)',
            }}
          >
            계약의 속도는 곧 비즈니스의 속도다.
            <br />
            <span style={{ color: 'var(--color-text-secondary)' }}>
              브라우저만 있으면 — 어디서나, 법적 효력 그대로.
            </span>
          </p>
          <div className="row gap-2" style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            <ShieldIcon />
            <span>SHA-256 무결성 검증 · TLS 1.3 · 감사 로그</span>
          </div>
        </div>
      </div>

      {/* ── 폼 사이드 ── */}
      <div className="gs-auth-form-wrap">
        <div className="gs-auth-form">
          <div className="t-eyebrow" style={{ marginBottom: 12 }}>
            Sign in
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 34,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              margin: '0 0 10px',
            }}
          >
            GreedySign 시작하기
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 28px', fontSize: 14 }}>
            Google 계정으로 즉시 로그인하고 문서에 서명하세요. 설치 불필요.
          </p>

          {inviteEmail && (
            <div
              style={{
                background: 'var(--color-primary-subtle)',
                border: '1px solid var(--color-primary-border)',
                borderRadius: 'var(--radius-control)',
                padding: '10px 14px',
                marginBottom: 20,
                fontSize: 13,
                color: 'var(--color-primary)',
              }}
            >
              초대 이메일: <strong>{inviteEmail}</strong> 계정으로 로그인해주세요.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* `login_hint` · `locale` 는 실제 Google Identity Services spec 에
                있지만 @react-oauth/google 의 타입 정의에 빠져 있어 extra prop 으로 전달. */}
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => alert('구글 로그인에 실패했습니다')}
              useOneTap={!inviteEmail}
              width="360"
              {...({
                locale: 'ko',
                login_hint: inviteEmail || undefined,
              } as Record<string, unknown>)}
            />
          </div>

          <p className="t-caption" style={{ marginTop: 16, textAlign: 'center' }}>
            계속하면 <u style={{ cursor: 'pointer' }}>서비스 약관</u> 및{' '}
            <u style={{ cursor: 'pointer' }}>개인정보 처리방침</u>에 동의합니다.
          </p>

          <div
            className="row gap-2"
            style={{
              marginTop: 36,
              paddingTop: 20,
              borderTop: '1px dashed var(--color-border)',
              fontSize: 12,
              color: 'var(--color-text-muted)',
            }}
          >
            <ShieldIcon />
            <span>JWT 세션 · 초대 토큰 단일 사용 · AES-256 저장</span>
          </div>
        </div>
      </div>
    </div>
  );
}
