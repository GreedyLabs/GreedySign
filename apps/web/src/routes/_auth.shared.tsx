import { createFileRoute } from '@tanstack/react-router';
import DocsPage from '../pages/DocsPage';
import { documentsQuery, prefetch } from '../router/loaders';

export const Route = createFileRoute('/_auth/shared')({
  validateSearch: (raw: Record<string, unknown>) => ({
    q:
      typeof raw?.q === 'string' && raw.q.length > 0
        ? (raw.q as string)
        : undefined,
  }),
  loader: prefetch(documentsQuery),
  component: DocsSharedRoute,
});

function DocsSharedRoute() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (next: string) =>
    navigate({
      search: (prev) => ({ ...prev, q: next ? next : undefined }),
      replace: true,
    });
  return <DocsPage mode="shared" search={q ?? ''} onSearchChange={setSearch} />;
}
