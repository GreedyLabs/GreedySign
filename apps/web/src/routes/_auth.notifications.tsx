import { createFileRoute } from '@tanstack/react-router';
import NotificationsPage from '../pages/NotificationsPage';
import { notificationsQuery, prefetch } from '../router/loaders';

export const Route = createFileRoute('/_auth/notifications')({
  loader: prefetch(notificationsQuery),
  component: NotificationsPage,
});
