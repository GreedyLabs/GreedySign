/**
 * ListToolbar — compact toolbar that sits above a list table.
 *
 *   <ListToolbar
 *     search={search}
 *     onSearchChange={setSearch}
 *     searchPlaceholder="문서 이름 검색"
 *     count={filtered.length}
 *     countSuffix="건"
 *   >
 *     <button className="btn btn-secondary btn-sm">필터</button>
 *   </ListToolbar>
 *
 * children → right-aligned action slot.
 * Either `search/onSearchChange` or `leading` can be omitted independently.
 */
import type { ReactNode } from 'react';

const SearchIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    style={{
      position: 'absolute',
      left: 10,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--color-text-muted)',
      pointerEvents: 'none',
    }}
  >
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);

interface ListToolbarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchWidth?: number | string;
  count?: number | null;
  countSuffix?: string;
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = '검색',
  searchWidth = 280,
  count,
  countSuffix = '건',
  leading,
  children,
  className = '',
}: ListToolbarProps) {
  const showSearch = typeof onSearchChange === 'function';
  return (
    <div className={`gs-toolbar ${className}`.trim()}>
      {showSearch && (
        <div style={{ position: 'relative', flex: 1, maxWidth: searchWidth }}>
          <SearchIcon />
          <input
            className="input"
            placeholder={searchPlaceholder}
            style={{ paddingLeft: 32 }}
            value={search ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
        </div>
      )}
      {leading}
      {count != null && (
        <span className="t-caption" style={{ marginLeft: 'auto' }}>
          {count}
          {countSuffix}
        </span>
      )}
      {children && (
        <div className="row gap-2" style={{ marginLeft: count == null ? 'auto' : 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}
