import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { SSEProvider } from './contexts/SSEContext';
import { RouterProvider, useLocation, Navigate } from './lib/router';
import AppShell from './components/AppShell';
import AuthPage from './components/AuthPage';
import InvitePage from './components/InvitePage';
import EditorPage from './components/EditorPage';
import CompletePage from './pages/CompletePage';
import DocsPage from './pages/DocsPage';
import UploadPage from './pages/UploadPage';
import ActivityPage from './pages/ActivityPage';
import SettingsPage from './pages/SettingsPage';
import NotificationsPage from './pages/NotificationsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// ─── Route renderer ───────────────────────────────────────
// Reads current pathname and renders the matching component.
// AppShell is a layout wrapper for all authenticated shell routes.
function AppRoutes() {
  const { user, loading, init } = useAuthStore();
  const { pathname } = useLocation();

  useEffect(() => {
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading)
    return (
      <div className="gs-loading">
        <div className="gs-spinner" />
      </div>
    );

  // ── Invite (accessible without being logged in) ──────────
  if (pathname.startsWith('/invite/')) {
    if (!user)
      return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <AuthPage />
        </GoogleOAuthProvider>
      );
    return <InvitePage />;
  }

  // ── Not authenticated ─────────────────────────────────────
  if (!user) {
    // 현재 경로가 의미있는 경로면 로그인 후 복귀할 수 있도록 저장
    if (pathname !== '/' && !pathname.startsWith('/invite/')) {
      sessionStorage.setItem('auth_redirect', pathname);
    }
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthPage />
      </GoogleOAuthProvider>
    );
  }

  // ── Signing complete certificate (full-screen, no shell) ──
  if (/^\/docs\/[a-f0-9-]{36}\/complete$/.test(pathname)) {
    return <CompletePage />;
  }

  // ── Editor (full-screen, no shell) ────────────────────────
  if (/^\/docs\/[a-f0-9-]{36}$/.test(pathname)) {
    return <EditorPage />;
  }

  // ── Shell routes ──────────────────────────────────────────
  return (
    <AppShell>
      {pathname === '/docs' && <DocsPage mode="mine" />}
      {pathname === '/shared' && <DocsPage mode="shared" />}
      {pathname === '/upload' && <UploadPage />}
      {pathname === '/activity' && <ActivityPage />}
      {pathname === '/notifications' && <NotificationsPage />}
      {pathname.startsWith('/settings') && <SettingsPage />}
      {/* Default redirect */}
      {!['/docs', '/shared', '/upload', '/activity', '/notifications'].includes(pathname) &&
        !pathname.startsWith('/settings') && <Navigate to="/docs" />}
    </AppShell>
  );
}

// ─── App root ─────────────────────────────────────────────
export default function App() {
  return (
    <RouterProvider>
      <QueryClientProvider client={queryClient}>
        <SSEProvider>
          <AppRoutes />
        </SSEProvider>
      </QueryClientProvider>
    </RouterProvider>
  );
}
