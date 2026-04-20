import { createFileRoute } from '@tanstack/react-router';
import CampaignNewPage from '../pages/CampaignNewPage';
import { prefetch, templatesQuery } from '../router/loaders';

export const Route = createFileRoute('/_auth/campaigns/new')({
  loader: prefetch(templatesQuery),
  component: CampaignNewPage,
});
