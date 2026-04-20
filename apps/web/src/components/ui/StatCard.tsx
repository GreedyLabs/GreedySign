/**
 * StatCard / StatGrid — dashboard summary tiles built on .gs-stats / .gs-stat.
 *
 * Two layout variants:
 *   - <StatGrid>            → grid of icon-led tiles (default; DocsPage usage)
 *   - <StatGrid variant="row"> → flex row of compact tiles, each flex:1
 */
import type { ReactNode } from 'react';

export type DeltaTone = 'warn' | 'down';

const TONE_CLASS: Record<DeltaTone, string> = {
  warn: 'is-warn',
  down: 'is-down',
};

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: DeltaTone;
  icon?: ReactNode;
  iconColor?: string;
  valueColor?: string;
  compact?: boolean;
}

export function StatCard({
  label,
  value,
  delta,
  deltaTone,
  icon,
  iconColor,
  valueColor,
  compact = false,
}: StatCardProps) {
  const deltaClass = deltaTone ? TONE_CLASS[deltaTone] : '';

  if (compact) {
    return (
      <div
        style={{
          flex: 1,
          padding: 16,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-surface)',
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-muted)',
            marginBottom: 6,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: valueColor ?? 'var(--color-text)',
          }}
        >
          {value}
        </div>
      </div>
    );
  }

  return (
    <div className="gs-stat">
      {icon && (
        <div
          style={{
            color: iconColor ?? 'var(--color-primary)',
            marginBottom: 4,
            opacity: 0.65,
          }}
        >
          {icon}
        </div>
      )}
      <div className="gs-stat-label">{label}</div>
      <div className="gs-stat-value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      {delta != null && (
        <div className={`gs-stat-delta${deltaClass ? ' ' + deltaClass : ''}`}>{delta}</div>
      )}
    </div>
  );
}

interface StatGridProps {
  children: ReactNode;
  variant?: 'grid' | 'row';
  className?: string;
}

export function StatGrid({ children, variant = 'grid', className = '' }: StatGridProps) {
  if (variant === 'row') {
    return (
      <div className={`row gap-2 ${className}`.trim()} style={{ marginBottom: 12 }}>
        {children}
      </div>
    );
  }
  return <div className={`gs-stats ${className}`.trim()}>{children}</div>;
}

export default StatCard;
