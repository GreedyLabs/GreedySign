/**
 * `_auth.campaigns` layout — `/campaigns/...` 하위 라우트(목록 · 신규 · 대시보드)
 * 공통 래퍼. 자식 라우트(index, new, $campaignId)가 <Outlet/>으로 렌더된다.
 *
 * 분리 이유: 같은 디렉터리 dot-notation 으로 `_auth.campaigns.new.tsx`
 * 등이 존재하므로, 이 파일은 자동으로 nested layout 부모가 된다.
 * Outlet 이 없으면 `/campaigns/new`, `/campaigns/:id` 가 빈 페이지로 보인다.
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/campaigns')({
  component: () => <Outlet />,
});
