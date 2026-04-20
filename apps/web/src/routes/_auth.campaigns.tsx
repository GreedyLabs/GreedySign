import { createFileRoute } from '@tanstack/react-router';
import CampaignsPage from '../pages/CampaignsPage';
import { campaignsQuery, prefetch } from '../router/loaders';

export const Route = createFileRoute('/_auth/campaigns')({
  loader: prefetch(campaignsQuery),
  component: CampaignsPage,
});
