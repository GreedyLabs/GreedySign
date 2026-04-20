/**
 * react-router-dom ↔ @tanstack/react-router 호환 어댑터.
 *
 * F-1: 기존 호출부 20 여 곳이 `../lib/router` 에서 import 하는
 * `useNavigate` · `useLocation` · `useParams` · `Navigate` · `Link` ·
 * `NavLink` · `RouterProvider` 의 API shape 를 유지하면서, 내부를
 * TanStack Router 로 교체한다. 사용처 수정 없이 라이브러리만 교체되는
 * 것이 목표.
 */
import { forwardRef, type ComponentPropsWithoutRef, type Ref } from 'react';
import {
  Link as TSLink,
  Navigate as TSNavigate,
  RouterProvider as TSRouterProvider,
  useLocation as useTSLocation,
  useNavigate as useTSNavigate,
  useParams as useTSParams,
} from '@tanstack/react-router';
import { router } from '../router';

// ─── 훅 ─────────────────────────────────────────────────────────────────────

type NavigateOptions = { replace?: boolean };
type NavigateFn = (to: string | number, opts?: NavigateOptions) => void;

export function useNavigate(): NavigateFn {
  const nav = useTSNavigate();
  // RRD 형: navigate('/path') | navigate('/path', { replace: true }) | navigate(-1)
  return (to, opts = {}) => {
    if (typeof to === 'number') {
      // RRD 의 navigate(-1) 등 히스토리 이동 호환.
      window.history.go(to);
      return;
    }
    // '#hash' 를 분리해 TanStack 에 전달.
    let path = to;
    let hash: string | undefined;
    const hashIdx = path.indexOf('#');
    if (hashIdx >= 0) {
      hash = path.slice(hashIdx + 1);
      path = path.slice(0, hashIdx);
    }
    // TanStack Router 의 navigate 는 엄격한 타입이라 shim 내부에선 any 캐스팅.
    (nav as (args: unknown) => void)({
      to: path,
      hash,
      replace: !!opts.replace,
    });
  };
}

export function useLocation() {
  return useTSLocation();
}

// strict:false — 소비자는 현재 라우트가 뭐든 신경 안 쓰고 paramName 만 읽는다.
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useTSParams({ strict: false }) as unknown as T;
}

// RRD 호환 useSearchParams (getter 중심).
export function useSearchParams(): [
  URLSearchParams,
  (
    update:
      | URLSearchParams
      | Record<string, string>
      | ((prev: URLSearchParams) => URLSearchParams),
    opts?: NavigateOptions,
  ) => void,
] {
  const nav = useTSNavigate();
  const location = useTSLocation();
  const raw =
    typeof window !== 'undefined' && window.location
      ? window.location.search
      : '';
  const params = new URLSearchParams(raw);

  const setParams = (
    update:
      | URLSearchParams
      | Record<string, string>
      | ((prev: URLSearchParams) => URLSearchParams),
    opts: NavigateOptions = {},
  ) => {
    const next =
      typeof update === 'function' ? update(new URLSearchParams(raw)) : update;
    const nextStr =
      next instanceof URLSearchParams
        ? next.toString()
        : new URLSearchParams(next).toString();
    (nav as (args: unknown) => void)({
      to: location.pathname,
      search: nextStr
        ? Object.fromEntries(new URLSearchParams(nextStr))
        : {},
      replace: !!opts.replace,
    });
  };

  return [params, setParams];
}

// ─── 컴포넌트 ───────────────────────────────────────────────────────────────
interface NavigateProps {
  to: string;
  replace?: boolean;
}

export function Navigate({ to, replace, ...rest }: NavigateProps) {
  // TanStack 의 Navigate 타입이 strict literal 을 원하므로 string 은 cast.
  return <TSNavigate to={to as never} replace={!!replace} {...rest} />;
}

type TSLinkProps = ComponentPropsWithoutRef<typeof TSLink>;
interface LinkProps extends Omit<TSLinkProps, 'to'> {
  to: string;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, ...rest },
  ref,
) {
  // TSLink 의 to 는 typed-routes literal 을 요구. shim 이라 string 통과.
  return <TSLink ref={ref as Ref<HTMLAnchorElement>} to={to as never} {...rest} />;
});

interface NavLinkProps extends Omit<LinkProps, 'className'> {
  exact?: boolean;
  activeClass?: string;
  className?: string | ((args: { isActive: boolean }) => string);
  children?: React.ReactNode;
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLink(
    {
      to,
      exact = false,
      activeClass = 'is-active',
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const inactiveBase =
      typeof className === 'function'
        ? className({ isActive: false })
        : (className ?? '');
    const activeBase =
      typeof className === 'function'
        ? className({ isActive: true })
        : (className ?? '');
    return (
      <TSLink
        ref={ref as Ref<HTMLAnchorElement>}
        to={to as never}
        activeOptions={{ exact }}
        activeProps={{
          className: [activeBase, activeClass].filter(Boolean).join(' '),
        }}
        inactiveProps={{ className: inactiveBase }}
        {...rest}
      >
        {children}
      </TSLink>
    );
  },
);

// RouterProvider — 호출부는 BrowserRouter 시그니처로 children 과 함께 감싼다.
// 라우트 트리는 `router/index.ts` 가 `routeTree.gen` 을 consume 해 pre-build
// 하므로 children 은 무시한다.
interface RouterProviderProps {
  context?: unknown;
}

export function RouterProvider({ context }: RouterProviderProps) {
  return <TSRouterProvider router={router} context={context as never} />;
}
