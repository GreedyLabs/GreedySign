/**
 * Avatar — user initials or image.
 *
 * <Avatar name="홍길동" src={user.avatar_url} size="sm" />
 * size: 'sm' | 'md' (default) | 'lg'
 */
import type { CSSProperties } from 'react';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 64 };
const FONT: Record<AvatarSize, number> = { sm: 11, md: 14, lg: 22 };

interface AvatarProps {
  name?: string;
  src?: string | null;
  size?: AvatarSize;
  color?: string;
  style?: CSSProperties;
  className?: string;
}

export default function Avatar({
  name,
  src,
  size = 'md',
  color,
  style,
  className,
}: AvatarProps) {
  const px = SIZE[size] ?? SIZE.md;
  const fs = FONT[size] ?? FONT.md;
  const initial = (name?.[0] ?? '?').toUpperCase();

  return (
    <div
      className={`avatar${size === 'sm' ? ' avatar-sm' : ''}${className ? ` ${className}` : ''}`}
      style={{
        width: px,
        height: px,
        fontSize: fs,
        background: color ?? 'var(--color-primary)',
        color: '#fff',
        border: 'none',
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name ?? ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initial
      )}
    </div>
  );
}
