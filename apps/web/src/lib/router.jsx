/**
 * Minimal SPA router — no external deps.
 * Provides: RouterProvider, useNavigate, useLocation, useParams,
 *           Navigate, Link, NavLink
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const Ctx = createContext(null);

// ── Route param extraction ────────────────────────────────
// Matches path params for all known route patterns.
function extractParams(pathname) {
  let m;
  if ((m = pathname.match(/^\/docs\/([a-f0-9-]{36})\/complete$/)))
    return { docId: m[1], view: 'complete' };
  if ((m = pathname.match(/^\/docs\/([a-f0-9-]{36})$/))) return { docId: m[1] };
  if ((m = pathname.match(/^\/invite\/([^/]+)$/))) return { token: m[1] };
  if ((m = pathname.match(/^\/settings\/([^/]+)$/))) return { tab: m[1] };
  return {};
}

// ── Provider ─────────────────────────────────────────────
export function RouterProvider({ children }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    setPathname(to);
  }, []);

  return <Ctx.Provider value={{ pathname, navigate }}>{children}</Ctx.Provider>;
}

// ── Hooks ─────────────────────────────────────────────────
export const useNavigate = () => useContext(Ctx).navigate;
export const useLocation = () => ({ pathname: useContext(Ctx).pathname });
export const useParams = () => extractParams(useContext(Ctx).pathname);

// ── Navigate (declarative redirect) ──────────────────────
export function Navigate({ to, replace = true }) {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace }), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Link ──────────────────────────────────────────────────
export function Link({ to, children, className, style, onClick, ...rest }) {
  const navigate = useNavigate();
  const handleClick = (e) => {
    e.preventDefault();
    onClick?.();
    navigate(to);
  };
  return (
    <a href={to} className={className} style={style} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

// ── NavLink ───────────────────────────────────────────────
// className can be a string or fn({ isActive }) => string
export function NavLink({
  to,
  exact = false,
  children,
  className,
  activeClass = 'is-active',
  ...rest
}) {
  const { pathname } = useContext(Ctx);
  const navigate = useNavigate();
  const isActive = exact ? pathname === to : pathname === to || pathname.startsWith(to + '/');
  const cls = [
    typeof className === 'function' ? className({ isActive }) : (className ?? ''),
    isActive ? activeClass : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      href={to}
      className={cls}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {typeof children === 'function' ? children({ isActive }) : children}
    </a>
  );
}
