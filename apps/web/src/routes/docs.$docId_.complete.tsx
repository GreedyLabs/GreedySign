import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '../router/guards';
import CompletePage from '../pages/CompletePage';

// 서명 완료 인증서 — 풀스크린. AppShell 없음.
//
// 파일명에 `$docId_` (trailing underscore) 를 쓴 이유:
// TanStack Router 의 flat 라우팅은 `docs.$docId.tsx` + `docs.$docId.complete.tsx`
// 를 부모/자식 관계로 해석한다. 부모 `EditorPage` 가 `<Outlet />` 을 렌더하지
// 않으므로 `/docs/:id/complete` 로 이동해도 자식이 마운트되지 않는다. `_`
// 서픽스는 "이 세그먼트에서 부모 레이아웃을 상속하지 않는다"는 TanStack 의
// opt-out 관례. 덕분에 complete 은 docs.$docId 와 같은 레벨의 독립 라우트가
// 되어 EditorPage 가 언마운트되고 CompletePage 가 풀스크린으로 렌더된다.
export const Route = createFileRoute('/docs/$docId_/complete')({
  beforeLoad: requireAuth,
  component: CompletePage,
});
