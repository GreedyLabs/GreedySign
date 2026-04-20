/**
 * App — 최상위 Provider 트리.
 *
 * 라우팅은 `router/index.ts` 의 TanStack Router 인스턴스가 담당하고
 * (`routes/*.tsx` 파일 트리 + `routeTree.gen.ts` 자동 생성),
 * App.tsx 는 순수하게 Query/SSE/인증 부팅만 책임진다. 기존의 `<Routes>`
 * 선언은 모두 라우트 트리로 이동했다.
 *
 * QueryClient 는 `main.tsx` 에서 단 하나만 생성되고 `QueryClientProvider`
 * 로 App 을 감싼다 — App.tsx 는 `useQueryClient()` 로 같은 인스턴스를
 * 참조해 router context 에 주입한다(표준 정렬: 단일 캐시).
 *
 * GoogleOAuthProvider 는 로그인 페이지 전용이라 `router/guards.tsx` 의
 * LoginRoute 내부에서 감싸고, 전역에는 두지 않는다.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { SSEProvider } from './contexts/SSEContext';
import { RouterProvider } from './lib/router';
import DevTools from './components/DevTools';

// 인증 스토어 init 이 끝날 때까지 스피너 표시. init 이 끝나면 실제 라우터
// 를 렌더. (라우터 내부의 RequireAuth 가드가 init 직후 인증 상태를 본다.)
function AppBoot() {
  const queryClient = useQueryClient();
  const loading = useAuthStore((s) => s.loading);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  if (loading) {
    return (
      <div className="gs-loading">
        <div className="gs-spinner" />
      </div>
    );
  }

  // 라우트 loader 가 `context.queryClient.ensureQueryData(...)` 로
  // 프리페칭할 수 있도록 router context 에 QueryClient 를 주입한다.
  return <RouterProvider context={{ queryClient }} />;
}

export default function App() {
  return (
    <SSEProvider>
      <AppBoot />
      <DevTools />
    </SSEProvider>
  );
}
