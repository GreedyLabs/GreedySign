/**
 * TanStack Router 인스턴스 팩토리.
 *
 * 라우트 트리는 `src/routes/*.tsx` 파일에서 자동 생성된 `routeTree.gen.ts`
 * (Vite 플러그인 산출물). 이 모듈은 그 트리를 `createRouter` 에 넘겨 단일
 * `router` 를 export 하며, `lib/router.tsx` shim 과 App 부트가 참조한다.
 *
 * F-3 — context 주입
 * ------------------
 * `context` 기본값은 여기서 빈 객체로 초기화하고, 실제 `queryClient` 는
 * App.tsx 에서 `<RouterProvider router={router} context={{ queryClient }} />`
 * 로 런타임에 넣는다. QueryClient 는 React 트리의 `QueryClientProvider`
 * 안쪽에서 살아야 하므로 모듈 스코프에서 만들지 않는다.
 */
import { createRouter } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { routeTree } from '../routeTree.gen';
import { DefaultNotFound } from './guards';
import { useAuthStore } from '../stores/authStore';

export interface RouterAppContext {
  queryClient: QueryClient | undefined;
}

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: DefaultNotFound,
  // 빈 컨텍스트. RouterProvider 단계에서 { queryClient } 가 덮어쓴다.
  context: { queryClient: undefined } satisfies RouterAppContext,
  // 링크 hover 시 해당 라우트의 loader 를 선실행 — React Query 캐시가
  // 미리 데이터를 준비해 내비게이션 지연을 없앤다 (TanStack 관용 패턴).
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

// TanStack 이 router 타입을 아는 전역 Register 훅.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// 인증 상태 변화 → 라우터 invalidate.
if (typeof window !== 'undefined') {
  let prevUser = useAuthStore.getState().user;
  useAuthStore.subscribe((state) => {
    if (state.user !== prevUser) {
      prevUser = state.user;
      router.invalidate();
    }
  });
}
