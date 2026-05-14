import { createFileRoute } from '@tanstack/react-router';
import CampaignsPage from '../pages/CampaignsPage';
import { campaignsQuery, prefetch } from '../router/loaders';

export const Route = createFileRoute('/_auth/campaigns/')({
  // 부모 `_auth.campaigns.tsx`(<Outlet/>) 아래 인덱스(=목록) 라우트.
  // 자식 라우트들(`/new`, `/$campaignId`)이 별도 페이지로 렌더되도록
  // 부모는 layout-only 로 분리되어 있다.
  loader: prefetch(campaignsQuery),
  component: CampaignsPage,
});
