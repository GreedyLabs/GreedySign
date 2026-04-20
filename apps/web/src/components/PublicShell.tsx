/**
 * PublicShell — minimal wrapper for public (no-auth) pages like /guide.
 *
 * Uses the same topbar dimensions/tokens as the landing page (`.gs-nav` on
 * AboutPage) so the sticky header height (64px) is consistent across
 * `/` → `/guide` navigation and doesn't shift.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from '../lib/router';
import { useAuthStore } from '../stores/authStore';
import BrandMark from './ui/BrandMark';

const NAV_CSS = `
  .gs-public-nav {
    position: sticky; top: 0; z-index: 40;
    height: 64px;
    display: flex; align-items: center; gap: 24px;
    padding: 0 32px;
    background: color-mix(in srgb, var(--color-bg) 88%, transparent);
    backdrop-filter: saturate(140%) blur(14px);
    -webkit-backdrop-filter: saturate(140%) blur(14px);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .gs-public-brand {
    display: flex; align-items: center; gap: 10px;
    font-weight: 600; color: var(--color-text); text-decoration: none;
  }
  .gs-public-brand-label {
    font-family: var(--font-display);
    font-size: 17px; letter-spacing: -0.01em;
  }
  .gs-public-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
`;

interface PublicShellProps {
  children: ReactNode;
}

export default function PublicShell({ children }: PublicShellProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 공개 라우트 전환 시 내부 스크롤 컨테이너와 window 모두 최상단으로 리셋.
  // hash 가 있으면 가이드 페이지가 직접 섹션으로 스크롤한다.
  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    if (location.hash) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (typeof document !== 'undefined') {
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  return (
    <div className="gs-shell" style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{NAV_CSS}</style>
      <header className="gs-public-nav">
        {/* 로고 클릭 — 로그인 상태이면 앱 홈(/docs), 아니면 랜딩(/)으로 이동. */}
        <Link
          to={user ? '/docs' : '/'}
          className="gs-public-brand"
          aria-label={user ? 'GreedySign 앱 홈으로' : 'GreedySign 홈으로'}
        >
          <BrandMark size={30} radius={7} />
          <span className="gs-public-brand-label">GreedySign</span>
        </Link>

        <div className="gs-public-right">
          {user ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/docs')}
            >
              앱으로 이동 →
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/login')}
            >
              로그인 →
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="gs-content" style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
