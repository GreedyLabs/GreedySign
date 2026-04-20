/**
 * BrandMark — GreedySign 브랜드 아이콘(공통).
 *
 * AppShell · PublicShell(공개 라우트) · AboutPage · 초대 페이지 등 모든
 * 진입점에서 동일한 아이콘을 사용하도록 단일 컴포넌트로 관리한다. 과거에는
 * 공개 라우트가 "GS" 텍스트 뱃지를, 앱 내부가 SVG 아이콘을 사용해 브랜드가
 * 어긋나 보였다.
 *
 * Props:
 *   size    — 렌더 픽셀 크기(가로=세로). 기본 22.
 *   radius  — 배경 사각형 라운드(SVG 좌표계 기준). 기본 6. PublicShell 처럼
 *             둥글기를 조금 더 키우고 싶으면 7로 넘긴다.
 *   title   — 접근성용 툴팁. 지정 시 aria-labelledby 으로 노출.
 */
import type { SVGProps } from 'react';

interface BrandMarkProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number;
  radius?: number;
  title?: string;
}

export default function BrandMark({
  size = 22,
  radius = 6,
  title,
  ...rest
}: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    >
      <rect x="1" y="1" width="30" height="30" rx={radius} fill="var(--color-primary)" />
      <path d="M10 12.5a5.5 5.5 0 1 1 0 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 20.5h7.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="22.5" cy="20.5" r="1.25" fill="#fff" />
    </svg>
  );
}
