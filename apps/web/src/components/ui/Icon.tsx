/**
 * 공통 stroke-based SVG 아이콘 세트. 색상은 `currentColor` 상속.
 * 페이지 전용 장식(EmptyState 일러스트 등)은 여기 포함하지 않는다.
 */
import type { ReactElement, ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  strokeWidth?: number;
}

interface BaseIconProps extends IconProps {
  viewBox?: string;
  children: ReactNode;
}

function BaseIcon({
  size = 18,
  strokeWidth = 1.6,
  viewBox = '0 0 20 20',
  children,
  ...rest
}: BaseIconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <path d="m4 10 4 4 8-8" />
    </BaseIcon>
  );
}

export function XIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <path d="m5 5 10 10M15 5 5 15" />
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" />
    </BaseIcon>
  );
}

export function PenIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <path d="M13 4l3 3-9 9H4v-3l9-9Z" />
    </BaseIcon>
  );
}

export function StarIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <path d="M10 3l2.2 4.6 5 .7-3.6 3.5.9 5L10 14.4 5.5 16.8l.9-5L2.8 8.3l5-.7L10 3z" />
    </BaseIcon>
  );
}

export function BanIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="m5 5 10 10" />
    </BaseIcon>
  );
}

export function BellIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <path d="M7 15a3 3 0 0 0 6 0M10 3a5 5 0 0 1 5 5v3l1.5 3H3.5L5 11V8a5 5 0 0 1 5-5Z" />
    </BaseIcon>
  );
}

/** 빈 상태(EmptyState) 용 큰 종 아이콘. */
export function BellEmptyIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon viewBox="0 0 48 48" size={40} strokeWidth={1.2} {...props}>
      <path d="M18 36a6 6 0 0 0 12 0M24 6a14 14 0 0 1 14 14v6l3 6H7l3-6v-6A14 14 0 0 1 24 6Z" />
    </BaseIcon>
  );
}

export function InviteIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <path d="M3 6l7 5 7-5" />
      <rect x="3" y="5" width="14" height="11" rx="1.5" />
    </BaseIcon>
  );
}

export function SunIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
    </BaseIcon>
  );
}

export function MoonIcon(props: IconProps): ReactElement {
  return (
    <BaseIcon {...props}>
      <path d="M16 12a6 6 0 0 1-8-8 7 7 0 1 0 8 8z" />
    </BaseIcon>
  );
}
