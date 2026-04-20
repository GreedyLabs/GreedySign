import { createFileRoute } from '@tanstack/react-router';
import CampaignDashboardPage from '../pages/CampaignDashboardPage';
import { campaignQuery, campaignRecipientsQuery } from '../router/loaders';

export const Route = createFileRoute('/_auth/campaigns/$campaignId')({
  loader: async ({ context, params }) => {
    if (!context?.queryClient) return;
    await Promise.all([
      context.queryClient.ensureQueryData(campaignQuery(params.campaignId)),
      context.queryClient.ensureQueryData(
        campaignRecipientsQuery(params.campaignId),
      ),
    ]);
  },
  component: CampaignDashboardPage,
});
