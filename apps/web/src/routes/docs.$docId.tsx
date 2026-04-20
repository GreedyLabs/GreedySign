import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '../router/guards';
import EditorPage from '../components/EditorPage';

// 문서 에디터/서명 화면 — 풀스크린. AppShell 없음.
export const Route = createFileRoute('/docs/$docId')({
  beforeLoad: requireAuth,
  component: EditorPage,
});
