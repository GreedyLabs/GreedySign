/**
 * InfoBanner — variant-driven in-page banner/notice.
 *
 *   <InfoBanner variant="info" title="템플릿이란?">
 *     하나의 PDF에 필드를 한 번만 배치해두면…
 *   </InfoBanner>
 *
 *   <InfoBanner variant="warning" icon={<WarnIcon />}>
 *     서명 초대 3건이 수락 대기 중입니다.
 *   </InfoBanner>
 *
 *   <InfoBanner variant="danger">{errorMessage}</InfoBanner>
 *
 * Variants: 'info' | 'warning' | 'danger' | 'success' | 'primary'
 * (primary == "intro" accent using --color-primary tokens)
 */
import type { CSSProperties, ReactNode } from 'react';

export type InfoBannerVariant = 'info' | 'primary' | 'warning' | 'danger' | 'success';

interface ToneTokens {
  bg: string;
  border: string;
  fg: string;
}

const VARIANT_TOKENS: Record<InfoBannerVariant, ToneTokens> = {
  info: {
    bg: 'var(--color-bg-subtle)',
    border: 'var(--color-border)',
    fg: 'var(--color-text-secondary)',
  },
  primary: {
    bg: 'var(--color-primary-subtle)',
    border: 'var(--color-primary)',
    fg: 'var(--color-primary)',
  },
  warning: {
    bg: 'var(--color-warning-subtle)',
    border: 'var(--color-warning)',
    fg: 'var(--color-warning)',
  },
  danger: {
    bg: 'var(--color-danger-subtle)',
    border: 'var(--color-danger)',
    fg: 'var(--color-danger)',
  },
  success: {
    bg: 'var(--color-success-subtle)',
    border: 'var(--color-success)',
    fg: 'var(--color-success)',
  },
};

interface InfoBannerProps {
  variant?: InfoBannerVariant;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  marginBottom?: number | string;
}

export default function InfoBanner({
  variant = 'info',
  icon,
  title,
  children,
  className = '',
  style,
  marginBottom = 20,
}: InfoBannerProps) {
  const tone = VARIANT_TOKENS[variant] ?? VARIANT_TOKENS.info;
  return (
    <div
      className={className || undefined}
      style={{
        padding: '11px 16px',
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 'var(--radius-card)',
        marginBottom,
        display: 'flex',
        alignItems: title ? 'flex-start' : 'center',
        gap: 12,
        fontSize: 13,
        lineHeight: 1.6,
        color: tone.fg,
        ...style,
      }}
    >
      {icon && <span style={{ flexShrink: 0, display: 'inline-flex' }}>{icon}</span>}
      <div style={{ minWidth: 0, flex: 1 }}>
        {title && (
          <div style={{ fontWeight: 600, marginBottom: children ? 2 : 0 }}>{title}</div>
        )}
        {children && <div style={{ fontWeight: title ? 400 : 500 }}>{children}</div>}
      </div>
    </div>
  );
}
