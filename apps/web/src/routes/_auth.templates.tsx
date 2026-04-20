import { createFileRoute } from '@tanstack/react-router';
import TemplatesPage from '../pages/TemplatesPage';
import { prefetch, templatesQuery } from '../router/loaders';

export const Route = createFileRoute('/_auth/templates')({
  loader: prefetch(templatesQuery),
  component: TemplatesPage,
});
