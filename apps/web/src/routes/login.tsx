import { createFileRoute } from '@tanstack/react-router';
import { LoginRoute, redirectIfAuthed } from '../router/guards';

// `/login` — 이미 로그인된 상태라면 beforeLoad 에서 복귀 경로로 튕겨낸다.
export const Route = createFileRoute('/login')({
  validateSearch: (raw: Record<string, unknown>) => ({
    redirect:
      typeof raw?.redirect === 'string' && raw.redirect.startsWith('/')
        ? raw.redirect
        : undefined,
  }),
  beforeLoad: redirectIfAuthed,
  component: LoginRoute,
});
