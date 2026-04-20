/**
 * 파일 라우트 전용 loader 팩토리 모음 (F-3).
 *
 * 각 라우트 파일이 반복적으로 아래 패턴을 쓴다:
 *
 *     loader: async ({ context }) =>
 *       context.queryClient.ensureQueryData({ queryKey, queryFn })
 *
 * 이 파일은 페이지가 실제 렌더 시 쓰는 `useQuery` 의 queryKey/queryFn 과
 * 1:1 동일한 정의를 re-export 해, 라우트는 얇게 `prefetch(listDocs)` 처럼
 * 쓰면 된다.
 */
import type { QueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { API_ENDPOINTS } from '../services/endpoints';

interface QueryFactoryArg<T> {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
}

type LoaderCtx = {
  context?: { queryClient?: QueryClient } | undefined;
};

// ─── Query 정의 ──────────────────────────────────────────────
export const documentsQuery = (): QueryFactoryArg<unknown> => ({
  queryKey: ['documents'],
  queryFn: async () => (await api.get('/documents')).data,
});

export const templatesQuery = (): QueryFactoryArg<unknown> => ({
  queryKey: ['templates'],
  queryFn: async () => (await api.get(API_ENDPOINTS.templates.list)).data,
});

export const templateQuery = (
  templateId: string | number,
): QueryFactoryArg<unknown> => ({
  queryKey: ['template', templateId],
  queryFn: async () =>
    (await api.get(API_ENDPOINTS.templates.get(templateId))).data,
});

export const campaignsQuery = (): QueryFactoryArg<unknown> => ({
  queryKey: ['campaigns'],
  queryFn: async () => (await api.get(API_ENDPOINTS.campaigns.list)).data,
});

export const campaignQuery = (
  campaignId: string | number,
): QueryFactoryArg<unknown> => ({
  queryKey: ['campaign', campaignId],
  queryFn: async () =>
    (await api.get(API_ENDPOINTS.campaigns.get(campaignId))).data,
});

export const campaignRecipientsQuery = (
  campaignId: string | number,
): QueryFactoryArg<unknown> => ({
  queryKey: ['campaign', campaignId, 'recipients'],
  queryFn: async () =>
    (await api.get(API_ENDPOINTS.campaigns.recipients(campaignId))).data,
});

export const notificationsQuery = (): QueryFactoryArg<unknown> => ({
  queryKey: ['notifications'],
  queryFn: async () => (await api.get(API_ENDPOINTS.notifications.list)).data,
});

// ─── loader 헬퍼 ─────────────────────────────────────────────
type NoArgQueryFactory = () => QueryFactoryArg<unknown>;
type ArgQueryFactory<A> = (arg: A) => QueryFactoryArg<unknown>;

/**
 * 라우트 `loader` 에서 바로 쓸 수 있도록 queryFactory 를 loader 시그니처로
 * 래핑한다. 파라미터 없는 팩토리(`documentsQuery`) 와 파라미터 있는
 * 팩토리(`templateQuery`) 둘 다 지원하도록 오버로드.
 */
export function prefetch(queryFactory: NoArgQueryFactory): (ctx: LoaderCtx) => Promise<unknown>;
export function prefetch<A>(queryFactory: ArgQueryFactory<A>, arg: A): (ctx: LoaderCtx) => Promise<unknown>;
export function prefetch<A>(
  queryFactory: NoArgQueryFactory | ArgQueryFactory<A>,
  arg?: A,
) {
  return async ({ context }: LoaderCtx) => {
    if (!context?.queryClient) return;
    const factory = queryFactory as ArgQueryFactory<A>;
    return context.queryClient.ensureQueryData(factory(arg as A));
  };
}

export const prefetchAll =
  (queries: QueryFactoryArg<unknown>[]) =>
  async ({ context }: LoaderCtx) => {
    if (!context?.queryClient) return;
    await Promise.all(
      queries.map((q) => context.queryClient!.ensureQueryData(q)),
    );
  };
