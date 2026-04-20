/**
 * ProgressBar — unified progress indicator built on the .gs-progress* tokens.
 *
 * Three use modes:
 *   1. Simple fraction (DocTable inline variant):
 *        <ProgressBar percent={0.6} captionRight showText />
 *   2. Signed / declined breakdown (CampaignsPage):
 *        <ProgressBar value={signed} declined={declined} total={total} />
 *   3. Multi-segment (CampaignDashboardPage):
 *        <ProgressBar
 *          total={stats.total}
 *          segments={[{value: ..., color: 'var(--color-success)'}, ...]}
 *        />
 */
import type { ReactNode } from 'react';

export interface ProgressSegment {
  value?: number;
  color: string;
}

interface ProgressBarProps {
  value?: number;
  declined?: number;
  total?: number;
  percent?: number | null;
  segments?: ProgressSegment[];
  height?: number;
  caption?: ReactNode;
  captionRight?: boolean;
  showText?: boolean;
  minWidth?: number | string;
  className?: string;
}

export default function ProgressBar({
  value = 0,
  declined = 0,
  total,
  percent,
  segments,
  height,
  caption,
  captionRight = false,
  showText = true,
  minWidth,
  className = '',
}: ProgressBarProps) {
  // ── Multi-segment mode ──
  if (Array.isArray(segments)) {
    const denom =
      total || segments.reduce((a, s) => a + (s.value ?? 0), 0) || 1;
    return (
      <div className={className}>
        <div
          style={{
            height: height ?? 10,
            borderRadius: Math.min(5, (height ?? 10) / 2),
            overflow: 'hidden',
            background: 'var(--color-bg-subtle)',
            display: 'flex',
          }}
        >
          {segments.map((s, i) => (
            <div
              key={i}
              style={{
                width: `${((s.value ?? 0) / denom) * 100}%`,
                background: s.color,
              }}
            />
          ))}
        </div>
        {caption && showText && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
            {caption}
          </div>
        )}
      </div>
    );
  }

  // ── Empty state ──
  if (!total && percent == null) {
    return <span className="t-caption">—</span>;
  }

  const signedPct =
    percent != null
      ? Math.max(0, Math.min(1, percent)) * 100
      : total
        ? (value / total) * 100
        : 0;
  const declinedPct = total && declined ? (declined / total) * 100 : 0;
  const isComplete =
    percent != null ? percent >= 1 : !!total && value >= total;

  // ── Inline caption (DocTable variant) ──
  if (captionRight) {
    return (
      <div
        className={`gs-progress ${className}`.trim()}
        style={minWidth ? { minWidth } : undefined}
      >
        <div className="gs-progress-track" style={height ? { height } : undefined}>
          <div
            className={`gs-progress-fill${isComplete ? ' is-complete' : ''}`}
            style={{ width: `${signedPct}%` }}
          />
        </div>
        {showText && (
          <span className="t-num" style={{ minWidth: 32, textAlign: 'right', fontSize: 12 }}>
            {Math.round(signedPct)}%
          </span>
        )}
      </div>
    );
  }

  // ── Stacked caption (CampaignsPage variant) ──
  return (
    <div className={className} style={{ minWidth: minWidth ?? 120 }}>
      <div
        style={{
          height: height ?? 6,
          borderRadius: Math.min(3, (height ?? 6) / 2),
          overflow: 'hidden',
          background: 'var(--color-bg-subtle)',
          display: 'flex',
        }}
      >
        <div style={{ width: `${signedPct}%`, background: 'var(--color-success)' }} />
        {declinedPct > 0 && (
          <div style={{ width: `${declinedPct}%`, background: 'var(--color-danger)' }} />
        )}
      </div>
      {showText && (caption || total != null) && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
          {caption ?? `서명 ${value} · 전체 ${total}`}
        </div>
      )}
    </div>
  );
}
