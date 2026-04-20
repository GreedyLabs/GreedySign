/**
 * 라우트 가드/엔트리 모음.
 *
 * 이 모듈은 TanStack Router 의 **`beforeLoad`** 훅과 몇 개 엔트리 컴포넌트
 * (`LoginRoute` / `LandingRoute` / `DefaultNotFound`) 를 export 한다.
 *
 * idiomatic hardening: 보호된 라우트는 `beforeLoad: requireAuth` 로 라우트
 * 매치 단계(컴포넌트 마운트·로더 실행 이전)에 인증을 검사해 리다이렉트.
 *
 * - 보호 라우트: `beforeLoad: requireAuth` → 비로그인 시 `throw redirect` → `/login?redirect=...`
 * - `/login`:    `beforeLoad: redirectIfAuthed` → 로그인 상태면 `search.redirect || /docs` 로 리다이렉트
 * - `/` 랜딩:    `beforeLoad: redirectIfAuthed` + 콘텐츠는 AboutPage
 *
 * 세션 저장(sessionStorage) 기반 복귀 경로 대신 **URL search param** 으로
 * 복귀 경로를 싣는다 (`/login?redirect=/docs/abc`) — TanStack 관용.
 */
import { Navigate, redirect } from '@tanstack/react-router';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from '../stores/authStore';
import AuthPage from '../components/AuthPage';
import AboutPage from '../pages/AboutPage';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

interface RouteLocation {
  pathname: string;
  href: string;
}

interface LoginSearch {
  redirect?: string;
}

// ─── beforeLoad 훅 ────────────────────────────────────────────────────────
/**
 * 보호된 라우트에서 사용. 비로그인 시 /login 으로 리다이렉트하며 현재 URL
 * 을 `redirect` search param 으로 전달해 로그인 후 복귀할 수 있게 한다.
 * 랜딩(/) 과 로그인(/login) 은 공개 경로라 복귀 경로에서 제외한다.
 */
export function requireAuth({ location }: { location: RouteLocation }): void {
  const user = useAuthStore.getState().user;
  if (!user) {
    const keep =
      location.pathname !== '/' &&
      location.pathname !== '/login' &&
      !location.pathname.startsWith('/invite/');
    throw redirect({
      to: '/login',
      search: { redirect: keep ? location.href : undefined },
    });
  }
}

/**
 * 로그인/랜딩 라우트에서 사용. 이미 로그인돼 있으면 복귀 경로(또는 /docs)
 * 로 보내 이중 로그인 UI 를 막는다.
 */
export function redirectIfAuthed({ search }: { search: LoginSearch }): void {
  const user = useAuthStore.getState().user;
  if (user) {
    const to =
      typeof search?.redirect === 'string' && search.redirect
        ? search.redirect
        : '/docs';
    throw redirect({ to: to as never });
  }
}

// ─── 엔트리 컴포넌트 ──────────────────────────────────────────────────────
/** `/login` 페이지 콘텐츠. beforeLoad 가 이미 "비로그인" 을 보장. */
export function LoginRoute() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthPage />
    </GoogleOAuthProvider>
  );
}

/** `/` 랜딩. beforeLoad 가 로그인 상태면 /docs 로 보낸다. */
export function LandingRoute() {
  return <AboutPage />;
}

/** 미매칭 경로 — 로그인 상태면 /docs, 아니면 / 로 리다이렉트. */
export function DefaultNotFound() {
  const user = useAuthStore.getState().user;
  return <Navigate to={user ? '/docs' : '/'} replace />;
}
