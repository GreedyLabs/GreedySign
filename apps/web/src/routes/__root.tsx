/**
 * 루트 라우트 — 모든 라우트의 공통 조상.
 *
 * createRootRouteWithContext<RouterAppContext>() 로 router context 에
 * QueryClient 를 싣는다. 자식 라우트의 `loader({ context })` 가
 * `context.queryClient.ensureQueryData(...)` 를 호출해 페이지 렌더
 * 전에 서버 상태를 프리패칭한다.
 *
 * SEO — 기본 noindex
 * ------------------
 * __root 에서 보수적 기본값 `noindex, nofollow` 설정. 공개 라우트
 * (`/`, `/guide`) 만 자체 `head()` 에서 `index, follow` 로 덮어쓴다.
 */
import {
  createRootRouteWithContext,
  Outlet,
  HeadContent,
} from '@tanstack/react-router';
import type { RouterAppContext } from '../router';

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
