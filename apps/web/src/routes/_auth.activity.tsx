import { createFileRoute } from '@tanstack/react-router';
import ActivityPage from '../pages/ActivityPage';

export const Route = createFileRoute('/_auth/activity')({
  component: ActivityPage,
});
