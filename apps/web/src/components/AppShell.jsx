/**
 * AppShell — fixed sidebar + sticky topbar layout.
 * Navigation uses NavLink from our custom router (no prop drilling).
 * Doc counts are read from the shared TanStack Query cache.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { useDocs } from '../hooks/useDocs';
import { NavLink, useLocation, useNavigate } from '../lib/router';
import Avatar from './ui/Avatar';
import api from '../services/api';
import SearchPalette from './SearchPalette';

// ─── Brand ────────────────────────────────────────────────
function BrandMark() {
  return (
    <svg width={22} height={22} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--color-primary)" />
      <path d="M10 12.5a5.5 5.5 0 1 1 0 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 20.5h7.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="22.5" cy="20.5" r="1.25" fill="#fff" />
    </svg>
  );
}

// ─── Icons ────────────────────────────────────────────────
const icons = {
  docs: 'M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM10 2v3h3M5 7h6M5 9.5h4',
  shared:
    'M5 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM1 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5M11 9.5c2.2 0 4 1.5 4 3.5',
  activity: 'M1 9 4 5l3 3 3-5 3 3 2-2',
  settings:
    'M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.929 2.929l1.06 1.06M12.01 12.01l1.06 1.06M13.07 2.929l-1.06 1.06M3.99 12.01l-1.06 1.06',
  plus: 'M8 3v10M3 8h10',
  search: '',
  bell: 'M6 13.5a2 2 0 0 0 4 0M8 2a5 5 0 0 1 5 5v2l1 2H2l1-2V7a5 5 0 0 1 5-5Z',
  logout: 'M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6',
  chevron: 'm4.5 2.5 3 3.5-3 3.5',
};
function Icon({ name, size = 16 }) {
  // activity uses polyline, not path
  if (name === 'activity')
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <polyline points="1,9 4,5 7,8 10,3 13,6 15,4" />
      </svg>
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]
        ?.split('M')
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={'M' + seg} />
        ))}
    </svg>
  );
}
// Separate circle for settings
function SettingsIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.929 2.929l1.06 1.06M12.01 12.01l1.06 1.06M13.07 2.929l-1.06 1.06M3.99 12.01l-1.06 1.06" />
    </svg>
  );
}

// ─── Breadcrumbs ──────────────────────────────────────────
const CRUMB_MAP = {
  '/docs': ['GreedySign', '내 문서'],
  '/shared': ['GreedySign', '공유받은 문서'],
  '/upload': ['GreedySign', '새 문서 요청'],
  '/activity': ['GreedySign', '활동 로그'],
  '/notifications': ['GreedySign', '알림'],
  '/settings/profile': ['GreedySign', '설정', '프로필'],
  '/settings/appearance': ['GreedySign', '설정', '화면 설정'],
};

function Breadcrumbs({ pathname }) {
  const crumbs = CRUMB_MAP[pathname] ?? ['GreedySign'];
  return (
    <div className="gs-breadcrumbs">
      {crumbs.map((b, i) => (
        <span key={i} className="row gap-2">
          {i > 0 && (
            <span className="gs-bc-sep">
              <svg
                width={12}
                height={12}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="m4.5 2.5 3 3.5-3 3.5" />
              </svg>
            </span>
          )}
          <span className={i === crumbs.length - 1 ? 'gs-bc-current' : 'gs-bc-item'}>{b}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────
function Sidebar({ myCount, sharedCount, pendingCount }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <aside className="gs-sidebar">
      {/* Brand */}
      <div className="gs-sidebar-brand">
        <div className="gs-brand-mark">
          <BrandMark />
          <span className="gs-brand-mark-text">GreedySign</span>
        </div>
      </div>

      {/* Primary CTA */}
      <div className="gs-sidebar-cta">
        <button className="btn btn-primary btn-block" onClick={() => navigate('/upload')}>
          <svg
            width={14}
            height={14}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
          새 문서 요청
        </button>
      </div>

      {/* Main nav */}
      <nav className="gs-sidebar-nav">
        <div className="t-eyebrow gs-sidebar-eyebrow">Workspace</div>

        <NavLink to="/docs" exact className="gs-nav-item">
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
            <path d="M10 2v3h3M5 7h6M5 9.5h4" />
          </svg>
          <span className="flex-1 truncate">내 문서</span>
          {myCount > 0 && <span className="gs-nav-count t-num">{myCount}</span>}
        </NavLink>

        <NavLink to="/shared" exact className="gs-nav-item">
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <circle cx="5" cy="6" r="2" />
            <circle cx="11" cy="6" r="2" />
            <path d="M1 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" />
            <path d="M11 9.5c2.2 0 4 1.5 4 3.5" />
          </svg>
          <span className="flex-1 truncate">공유받은 문서</span>
          {(sharedCount > 0 || pendingCount > 0) && (
            <span className={`gs-nav-count t-num${pendingCount > 0 ? ' is-warn' : ''}`}>
              {pendingCount > 0 ? pendingCount : sharedCount}
            </span>
          )}
        </NavLink>

        <NavLink to="/activity" exact className="gs-nav-item">
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <polyline points="1,9 4,5 7,8 10,3 13,6 15,4" />
          </svg>
          <span className="flex-1 truncate">활동 로그</span>
        </NavLink>
      </nav>

      <div className="gs-sidebar-spacer" />

      {/* Secondary nav */}
      <nav className="gs-sidebar-nav">
        <NavLink to="/settings/profile" className="gs-nav-item">
          <SettingsIcon size={16} />
          <span className="flex-1 truncate">설정</span>
        </NavLink>
      </nav>

      {/* User chip */}
      <div className="gs-sidebar-foot">
        <div className="gs-plan-card">
          <div className="row-between">
            <div className="row gap-2" style={{ minWidth: 0, flex: 1 }}>
              <Avatar
                name={user?.name}
                src={user?.avatar_url}
                size="sm"
                style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}
              />
              <div className="col" style={{ minWidth: 0, lineHeight: 1.3 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }} className="truncate">
                  {user?.name ?? '사용자'}
                </span>
                <span className="t-caption truncate">{user?.email}</span>
              </div>
            </div>
            <button
              className="icon-btn"
              onClick={logout}
              title="로그아웃"
              style={{ width: 24, height: 24, flexShrink: 0 }}
            >
              <svg
                width={13}
                height={13}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Topbar ───────────────────────────────────────────────
function Topbar({ pathname, onSearchOpen }) {
  const navigate = useNavigate();
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications');
      return data;
    },
    staleTime: 30_000,
    placeholderData: { notifications: [], unread_count: 0 },
  });
  const unreadCount = notifData?.unread_count ?? 0;

  return (
    <header className="gs-topbar">
      <Breadcrumbs pathname={pathname} />
      <div className="gs-topbar-search" onClick={onSearchOpen} style={{ cursor: 'pointer' }}>
        <svg
          width={14}
          height={14}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <span style={{ fontSize: 13 }}>문서, 서명자, 활동 검색…</span>
        <span className="row gap-1" style={{ marginLeft: 'auto' }}>
          <span className="kbd">⌘</span>
          <span className="kbd">K</span>
        </span>
      </div>
      <div className="row gap-2">
        <button
          className="icon-btn"
          title="알림"
          style={{ position: 'relative' }}
          onClick={() => navigate('/notifications')}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <path d="M6 13.5a2 2 0 0 0 4 0M8 2a5 5 0 0 1 5 5v2l1 2H2l1-2V7a5 5 0 0 1 5-5Z" />
          </svg>
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 1,
                right: 1,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--color-danger)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                lineHeight: '14px',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

// ─── AppShell ─────────────────────────────────────────────
export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const { data: docs = [] } = useDocs();
  const myCount = docs.filter((d) => d.is_owner).length;
  const sharedCount = docs.filter((d) => !d.is_owner).length;
  const pendingCount = docs.filter((d) => !d.is_owner && d.invite_status === 'pending').length;

  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K / Ctrl+K 글로벌 단축키
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="gs-shell">
      <Sidebar myCount={myCount} sharedCount={sharedCount} pendingCount={pendingCount} />
      <div className="gs-main">
        <Topbar pathname={pathname} onSearchOpen={() => setSearchOpen(true)} />
        <div className="gs-content">{children}</div>
      </div>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
