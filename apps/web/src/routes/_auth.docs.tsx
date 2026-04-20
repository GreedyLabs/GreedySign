import { createFileRoute } from '@tanstack/react-router';
import DocsPage from '../pages/DocsPage';
import { documentsQuery, prefetch } from '../router/loaders';

export const Route = createFileRoute('/_auth/docs')({
  validateSearch: (raw: Record<string, unknown>) => ({
    q:
      typeof raw?.q === 'string' && raw.q.length > 0
        ? (raw.q as string)
        : undefined,
  }),
  loader: prefetch(documentsQuery),
  component: DocsMineRoute,
});

function DocsMineRoute() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (next: string) =>
    navigate({
      search: (prev) => ({ ...prev, q: next ? next : undefined }),
      replace: true,
    });
  return <DocsPage mode="mine" search={q ?? ''} onSearchChange={setSearch} />;
}
