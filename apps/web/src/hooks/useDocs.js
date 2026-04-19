import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import api from '../services/api';
import { useUserSSE } from '../contexts/SSEContext';

export const DOCS_QUERY_KEY = ['documents'];

/** Read docs from cache (or load if missing). No side-effects. */
export function useDocs() {
  return useQuery({
    queryKey: DOCS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get('/documents');
      return data;
    },
    staleTime: 30_000,
    placeholderData: [],
  });
}

/** Wire SSE events → query invalidation. Call once at the page level. */
export function useDocsSSESync() {
  const queryClient = useQueryClient();
  const handler = useCallback(
    (msg) => {
      if (
        [
          'document_shared',
          'signing_status_changed',
          'invite_accepted',
          'invite_declined',
          'document_completed',
          'document_voided',
          'signing_declined',
          'invite_received',
        ].includes(msg.type)
      ) {
        queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      }
    },
    [queryClient]
  );
  useUserSSE(handler);
}
