/**
 * `_auth` pathless layout — 로그인 + AppShell 이 필요한 모든 라우트의 공통
 * 래퍼. URL 에 `/_auth` 는 노출되지 않는다.
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAuth } from '../router/guards';
import AppShell from '../components/AppShell';

export const Route = createFileRoute('/_auth')({
  beforeLoad: requireAuth,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
