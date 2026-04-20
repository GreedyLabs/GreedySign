/**
 * DevTools — TanStack Router + Query 디버그 패널.
 *
 * 표준 정렬(idiomatic hardening): TanStack 공식 가이드가 권장하는 devtools
 * 를 묶어 개발 빌드에서만 마운트한다. `import.meta.env.DEV` 가 false 이면
 * 컴포넌트가 null 을 반환해 Vite 번들러가 죽은 import 를 tree-shake 한다
 * (devtools 코드가 프로덕션 번들에 섞이지 않음).
 *
 * 플로팅 패널 위치:
 *  - Router devtools : 화면 하단 우측
 *  - Query devtools  : 화면 하단 좌측
 */
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { router } from '../router';

export default function DevTools() {
  if (!import.meta.env.DEV) return null;
  return (
    <>
      <TanStackRouterDevtools router={router} position="bottom-right" />
      <ReactQueryDevtools buttonPosition="bottom-left" initialIsOpen={false} />
    </>
  );
}
