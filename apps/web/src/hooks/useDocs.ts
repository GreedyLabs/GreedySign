import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import api from '../services/api';
import { useUserSSE, type SseEvent } from '../contexts/SSEContext';

export const DOCS_QUERY_KEY = ['documents'] as const;

/** 문서 목록에 담기는 항목 — 백엔드 /documents 응답 shape. */
export interface DocSummary {
  id: number;
  title: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

/** Read docs from cache (or load if missing). No side-effects. */
export function useDocs() {
  return useQuery<DocSummary[]>({
    queryKey: DOCS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<DocSummary[]>('/documents');
      return data;
    },
    staleTime: 30_000,
    placeholderData: [],
  });
}

const DOC_EVENTS = new Set([
  'document_shared',
  'signing_status_changed',
  'invite_accepted',
  'invite_declined',
  'document_completed',
  'document_voided',
  'signing_declined',
  'invite_received',
]);

/** Wire SSE events → query invalidation. Call once at the page level. */
export function useDocsSSESync(): void {
  const queryClient = useQueryClient();
  const handler = useCallback(
    (msg: SseEvent) => {
      if (DOC_EVENTS.has(msg.type)) {
        queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
      }
    },
    [queryClient],
  );
  useUserSSE(handler);
}
