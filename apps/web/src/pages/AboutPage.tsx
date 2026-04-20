/**
 * AboutPage — GreedySign 공개 랜딩 페이지 (`/`).
 * 비로그인 사용자용. 로그인된 사용자는 `LandingRoute` 에서 `/docs` 로 리다이렉트.
 */
import { useLayoutEffect, type ReactNode, type SVGProps } from 'react';
import { Link, useLocation } from '../lib/router';
import { useAuthStore } from '../stores/authStore';
import BrandMark from '../components/ui/BrandMark';

// ─────────────────────────────────────────────────────────────────────
// 랜딩 전용 스타일 (design-system.css 의 토큰 위에 얹음)
// ─────────────────────────────────────────────────────────────────────
const CSS = `
  .gs-landing { background: var(--color-bg); color: var(--color-text); }

  /* ── Top nav ── */
  .gs-landing .gs-nav {
    position: sticky; top: 0; z-index: 40;
    height: 64px;
    display: flex; align-items: center; gap: 32px;
    padding: 0 32px;
    background: color-mix(in srgb, var(--color-bg) 88%, transparent);
    backdrop-filter: saturate(140%) blur(14px);
    -webkit-backdrop-filter: saturate(140%) blur(14px);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .gs-landing .gs-nav-brand {
    display: flex; align-items: center; gap: 10px;
    font-weight: 600;
    color: var(--color-text);
    text-decoration: none;
  }
  .gs-landing .gs-nav-brand-label {
    font-family: var(--font-display);
    font-size: 17px; letter-spacing: -0.01em;
  }
  .gs-landing .gs-nav-links { display: flex; align-items: center; gap: 4px; }
  .gs-landing .gs-nav-link {
    padding: 6px 10px;
    font-size: 13.5px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-control);
    cursor: pointer;
    text-decoration: none;
    transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
  }
  .gs-landing .gs-nav-link:hover { color: var(--color-text); background: var(--color-bg-muted); }
  .gs-landing .gs-nav-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }

  /* ── Hero ── */
  .gs-landing .gs-hero {
    position: relative;
    padding: 96px 32px 80px;
    overflow: hidden;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .gs-landing .gs-hero-inner {
    max-width: 1240px; margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: 72px;
    align-items: center;
  }
  .gs-landing .gs-hero-copy { max-width: 580px; }
  .gs-landing .gs-hero-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 12px 5px 8px;
    border-radius: var(--radius-full);
    background: var(--color-primary-subtle);
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
    margin-bottom: 20px;
    border: 1px solid var(--color-primary-border);
  }
  .gs-landing .gs-hero-eyebrow-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--color-primary);
    color: #fff;
    border-radius: var(--radius-full);
    letter-spacing: 0.08em;
    font-weight: 700;
  }
  .gs-landing .gs-hero-title {
    font-family: var(--font-display);
    font-size: 56px;
    line-height: 1.04;
    letter-spacing: -0.03em;
    font-weight: 500;
    margin: 0 0 24px;
    color: var(--color-text);
    word-break: keep-all;
  }
  .gs-landing .gs-hero-title em {
    font-style: italic;
    font-weight: 500;
    color: var(--color-primary);
  }
  .gs-landing .gs-hero-sub {
    font-size: 17px;
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0 0 32px;
    max-width: 52ch;
    word-break: keep-all;
  }
  .gs-landing .gs-hero-cta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .gs-landing .gs-hero-meta {
    margin-top: 28px;
    display: flex; flex-wrap: wrap; gap: 14px 28px;
    color: var(--color-text-muted);
    font-size: 12.5px;
  }
  .gs-landing .gs-hero-meta-item { display: inline-flex; align-items: center; gap: 6px; }
  .gs-landing .gs-hero-meta-item svg { color: var(--color-success); }

  /* Hero document mock */
  .gs-landing .gs-hero-mock { position: relative; width: 100%; min-height: 520px; }
  .gs-landing .gs-hero-doc-card {
    position: absolute;
    background: #fff;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    box-shadow:
      0 1px 2px rgba(10, 10, 10, 0.04),
      0 20px 50px rgba(10, 10, 10, 0.10),
      0 48px 80px -20px rgba(42, 63, 175, 0.18);
    overflow: hidden;
  }
  html[data-theme='dark'] .gs-landing .gs-hero-doc-card {
    background: #f7f6f3; color: #0a0a0a;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.4),
      0 20px 50px rgba(0, 0, 0, 0.5),
      0 48px 80px -20px rgba(138, 155, 255, 0.18);
  }
  .gs-landing .gs-hero-doc-main {
    top: 20px; right: 40px;
    width: 420px;
    padding: 28px 32px;
    font-family: var(--font-serif);
    color: #1a1a1a;
  }
  .gs-landing .gs-hero-doc-main h3 {
    font-size: 18px; margin: 0 0 4px;
    font-weight: 600; letter-spacing: -0.01em;
  }
  .gs-landing .gs-hd-sub {
    font-size: 10px; color: #6a6a68;
    letter-spacing: 0.14em; text-transform: uppercase;
    margin-bottom: 16px;
    font-family: 'Pretendard Variable', Pretendard, Inter, sans-serif;
  }
  .gs-landing .gs-hd-line { height: 6px; background: rgba(0,0,0,0.08); border-radius: 2px; margin: 5px 0; }
  .gs-landing .gs-hd-line.short { width: 62%; }
  .gs-landing .gs-hd-line.med { width: 82%; }
  .gs-landing .gs-hd-seal {
    margin-top: 18px;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 10px;
    background: rgba(42, 63, 175, 0.06);
    border: 1px dashed rgba(42, 63, 175, 0.4);
    border-radius: 4px;
    font-family: 'Pretendard Variable', Pretendard, Inter, sans-serif;
    font-size: 11px;
    color: var(--color-primary);
    font-weight: 600;
  }
  .gs-landing .gs-hd-sig {
    margin-top: 12px;
    font-family: 'Brush Script MT', 'Lucida Handwriting', cursive;
    font-size: 28px;
    color: var(--color-primary);
    transform: rotate(-6deg);
    display: inline-block;
  }

  .gs-landing .gs-hero-doc-side {
    top: 260px; left: 10px;
    width: 280px;
    padding: 16px 18px;
  }
  .gs-landing .gs-hero-doc-side-title {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em;
    color: #6a6a68; margin-bottom: 12px;
    font-weight: 700;
  }
  .gs-landing .gs-hero-sig-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .gs-landing .gs-hero-sig-row:last-child { border-bottom: none; }
  .gs-landing .gs-hero-sig-avatar {
    width: 26px; height: 26px; border-radius: 50%;
    color: #fff; display: inline-flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 600;
  }
  .gs-landing .gs-hero-sig-name { font-size: 12px; font-weight: 500; color: #1a1a1a; }
  .gs-landing .gs-hero-sig-time { font-size: 10.5px; color: #6a6a68; }
  .gs-landing .gs-hero-sig-tick {
    margin-left: auto;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: var(--color-success-subtle);
    color: var(--color-success);
    display: inline-flex; align-items: center; justify-content: center;
  }

  /* Floating pill notification */
  .gs-landing .gs-hero-pill {
    position: absolute;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-md);
    padding: 8px 14px 8px 10px;
    display: inline-flex; align-items: center; gap: 10px;
    font-size: 12.5px;
    white-space: nowrap;
  }
  .gs-landing .gs-hero-pill-icon {
    width: 24px; height: 24px;
    border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
  }

  /* Hero backdrop */
  .gs-landing .gs-hero-bg {
    position: absolute; inset: 0;
    background:
      radial-gradient(900px 500px at 90% 20%, var(--color-primary-subtle) 0%, transparent 55%),
      radial-gradient(800px 500px at 0% 80%, color-mix(in srgb, var(--color-primary-subtle) 60%, transparent) 0%, transparent 55%);
    pointer-events: none;
    z-index: 0;
  }
  .gs-landing .gs-hero-grid-bg {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(var(--color-border-subtle) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px);
    background-size: 80px 80px;
    mask-image: radial-gradient(800px 500px at 50% 30%, black, transparent 70%);
    -webkit-mask-image: radial-gradient(800px 500px at 50% 30%, black, transparent 70%);
    opacity: 0.6;
    pointer-events: none;
  }
  .gs-landing .gs-hero > * { position: relative; z-index: 1; }

  /* ── Section scaffold ── */
  .gs-landing .gs-section { padding: 96px 32px; border-bottom: 1px solid var(--color-border-subtle); }
  .gs-landing .gs-section-inner { max-width: 1240px; margin: 0 auto; }
  .gs-landing .gs-section-head { margin: 0 auto 56px; max-width: 680px; text-align: center; }
  .gs-landing .gs-section-eyebrow {
    display: inline-block;
    font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
    font-weight: 600; color: var(--color-primary);
    margin-bottom: 14px;
  }
  .gs-landing .gs-section-title {
    font-family: var(--font-display);
    font-size: 40px; line-height: 1.1;
    letter-spacing: -0.025em; font-weight: 500;
    margin: 0 0 16px; word-break: keep-all;
  }
  .gs-landing .gs-section-sub {
    font-size: 16px; line-height: 1.65;
    color: var(--color-text-secondary);
    margin: 0; word-break: keep-all;
  }

  /* ── Features grid ── */
  .gs-landing .gs-features {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    background: var(--color-border-subtle);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-card);
    overflow: hidden;
  }
  .gs-landing .gs-feature {
    padding: 32px;
    background: var(--color-bg);
    display: flex; flex-direction: column; gap: 16px;
    min-height: 240px;
  }
  .gs-landing .gs-feature-icon {
    width: 44px; height: 44px;
    border-radius: var(--radius-card);
    background: var(--color-primary-subtle);
    color: var(--color-primary);
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--color-primary-border);
  }
  .gs-landing .gs-feature-title {
    font-family: var(--font-display);
    font-size: 20px; font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .gs-landing .gs-feature-desc {
    font-size: 14px; line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0; word-break: keep-all;
  }

  /* ── Split ── */
  .gs-landing .gs-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 72px;
    align-items: center;
  }
  .gs-landing .gs-split.reverse > :first-child { order: 2; }
  .gs-landing .gs-split-copy h3 {
    font-family: var(--font-display);
    font-size: 34px; letter-spacing: -0.025em;
    line-height: 1.12; margin: 0 0 16px;
    font-weight: 500; word-break: keep-all;
  }
  .gs-landing .gs-split-copy p {
    font-size: 15.5px;
    color: var(--color-text-secondary);
    line-height: 1.65;
    margin: 0 0 24px;
    max-width: 52ch;
    word-break: keep-all;
  }
  .gs-landing .gs-split-bullets { display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; }
  .gs-landing .gs-split-bullet {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 12px;
    font-size: 14px;
    line-height: 1.6;
  }
  .gs-landing .gs-split-bullet-icon {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--color-primary-subtle);
    color: var(--color-primary);
    display: inline-flex; align-items: center; justify-content: center;
    margin-top: 2px;
  }
  .gs-landing .gs-split-bullet strong { color: var(--color-text); font-weight: 600; }
  .gs-landing .gs-split-bullet span { color: var(--color-text-secondary); }

  /* Showcase frame */
  .gs-landing .gs-showcase {
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: 24px;
    position: relative; overflow: hidden;
  }
  .gs-landing .gs-showcase-frame {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: hidden;
    box-shadow: var(--shadow-lg);
  }
  .gs-landing .gs-showcase-bar {
    height: 32px;
    padding: 0 12px;
    display: flex; align-items: center; gap: 6px;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-bg-subtle);
  }
  .gs-landing .gs-showcase-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--color-border-strong); }

  /* ── How it works ── */
  .gs-landing .gs-steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 24px;
    counter-reset: step;
  }
  .gs-landing .gs-step-card {
    position: relative;
    padding: 28px 24px 24px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
  }
  .gs-landing .gs-step-card::before {
    counter-increment: step;
    content: counter(step, decimal-leading-zero);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.08em;
    color: var(--color-primary);
    display: block;
    margin-bottom: 14px;
  }
  .gs-landing .gs-step-card-title {
    font-family: var(--font-display);
    font-size: 18px; font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0 0 6px;
  }
  .gs-landing .gs-step-card p {
    font-size: 13.5px;
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0; word-break: keep-all;
  }

  /* ── Security panel ── */
  .gs-landing .gs-security {
    padding: 56px;
    background: var(--color-text);
    color: var(--color-text-inverse);
    border-radius: var(--radius-card);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 64px;
    align-items: center;
    position: relative; overflow: hidden;
  }
  html[data-theme='dark'] .gs-landing .gs-security {
    background: #0A0A0A;
    border: 1px solid var(--color-border);
  }
  .gs-landing .gs-security::before {
    content: '';
    position: absolute;
    right: -160px; top: -140px;
    width: 480px; height: 480px;
    background: radial-gradient(circle, rgba(138, 155, 255, 0.22) 0%, transparent 70%);
    pointer-events: none;
  }
  .gs-landing .gs-security h3 {
    font-family: var(--font-display);
    font-size: 34px;
    letter-spacing: -0.025em;
    line-height: 1.12;
    margin: 0 0 16px;
    font-weight: 500;
    word-break: keep-all;
  }
  .gs-landing .gs-security p {
    color: rgba(244, 243, 239, 0.72);
    font-size: 15px; line-height: 1.65;
    margin: 0; max-width: 46ch;
    word-break: keep-all;
  }
  .gs-landing .gs-security-specs {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .gs-landing .gs-spec {
    padding: 16px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: var(--radius-sm);
  }
  .gs-landing .gs-spec-label {
    font-size: 11px; letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(244, 243, 239, 0.55);
    font-weight: 600; margin-bottom: 6px;
    font-family: var(--font-mono);
  }
  .gs-landing .gs-spec-value {
    font-family: var(--font-mono);
    font-size: 13px;
    color: #fff; word-break: break-all;
  }

  /* ── FAQ ── */
  .gs-landing .gs-faq { max-width: 780px; margin: 0 auto; }
  .gs-landing .gs-faq-item {
    border-bottom: 1px solid var(--color-border-subtle);
    padding: 20px 4px;
  }
  .gs-landing .gs-faq-q {
    font-family: var(--font-display);
    font-size: 17px; font-weight: 600;
    letter-spacing: -0.005em;
    display: flex; align-items: center; justify-content: space-between;
    gap: 24px;
    cursor: pointer;
    margin: 0;
    width: 100%;
    background: transparent; border: none; padding: 0;
    text-align: left;
    color: var(--color-text);
  }
  .gs-landing .gs-faq-q svg {
    color: var(--color-text-muted);
    transition: transform var(--dur-base) var(--ease-out);
    flex-shrink: 0;
  }
  .gs-landing .gs-faq-item[data-open='true'] .gs-faq-q svg { transform: rotate(180deg); }
  .gs-landing .gs-faq-a {
    font-size: 14.5px;
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-top: 12px;
    max-width: 62ch;
    word-break: keep-all;
  }

  /* ── Final CTA ── */
  .gs-landing .gs-cta-final {
    padding: 88px 32px;
    text-align: center;
    background:
      radial-gradient(600px 400px at 50% -10%, var(--color-primary-subtle) 0%, transparent 60%),
      var(--color-bg);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .gs-landing .gs-cta-final h3 {
    font-family: var(--font-display);
    font-size: 44px;
    line-height: 1.06;
    letter-spacing: -0.03em;
    margin: 0 auto 16px;
    font-weight: 500;
    max-width: 20ch;
    word-break: keep-all;
  }
  .gs-landing .gs-cta-final p { color: var(--color-text-secondary); font-size: 16px; margin: 0 0 28px; }

  /* ── Footer ── */
  .gs-landing .gs-foot {
    padding: 56px 32px 32px;
    background: var(--color-bg-subtle);
  }
  .gs-landing .gs-foot-inner {
    max-width: 1240px; margin: 0 auto;
    display: grid;
    grid-template-columns: 2fr repeat(3, 1fr);
    gap: 32px;
  }
  .gs-landing .gs-foot-brand p {
    color: var(--color-text-muted);
    font-size: 13px; line-height: 1.6;
    margin: 12px 0 0;
    max-width: 36ch;
    word-break: keep-all;
  }
  .gs-landing .gs-foot-col-title {
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--color-text-muted);
    margin-bottom: 14px;
  }
  .gs-landing .gs-foot-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .gs-landing .gs-foot-col a {
    font-size: 13.5px; color: var(--color-text-secondary);
    cursor: pointer; text-decoration: none;
  }
  .gs-landing .gs-foot-col a:hover { color: var(--color-text); }
  .gs-landing .gs-foot-bottom {
    max-width: 1240px; margin: 48px auto 0;
    padding-top: 24px;
    border-top: 1px solid var(--color-border-subtle);
    display: flex; align-items: center; justify-content: space-between;
    font-size: 12.5px; color: var(--color-text-muted);
    gap: 16px;
    flex-wrap: wrap;
  }

  /* ── Responsive ── */
  @media (max-width: 1100px) {
    .gs-landing .gs-hero-inner, .gs-landing .gs-split { grid-template-columns: 1fr; gap: 48px; }
    .gs-landing .gs-split.reverse > :first-child { order: 0; }
    .gs-landing .gs-features, .gs-landing .gs-steps { grid-template-columns: 1fr 1fr; }
    .gs-landing .gs-security { grid-template-columns: 1fr; gap: 32px; padding: 40px; }
    .gs-landing .gs-foot-inner { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 720px) {
    .gs-landing .gs-hero { padding: 64px 20px 56px; }
    .gs-landing .gs-hero-title { font-size: 38px; }
    .gs-landing .gs-section { padding: 64px 20px; }
    .gs-landing .gs-features, .gs-landing .gs-steps { grid-template-columns: 1fr; }
    .gs-landing .gs-nav-links { display: none; }
    .gs-landing .gs-foot-inner { grid-template-columns: 1fr; }
    .gs-landing .gs-hero-mock { min-height: 440px; }
    .gs-landing .gs-hero-doc-main { right: auto; left: 0; width: 100%; max-width: 380px; }
    .gs-landing .gs-hero-doc-side { display: none; }
  }
`;

// ─── Inline icons ───────────────────────────────────────────────────
const stroke: Partial<SVGProps<SVGSVGElement>> = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

interface IconProps {
  size?: number;
}

function IconArrow({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...stroke}>
      <path d="M3 8h10" />
      <path d="m9 4 4 4-4 4" />
    </svg>
  );
}
function IconCheck({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...stroke}>
      <path d="m3 8.5 3.2 3L13 4.5" />
    </svg>
  );
}
function IconChevronDown({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...stroke}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}
function IconSend({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M21 3 3 10l7 3 3 7 8-17Z" />
      <path d="m10 13 5-5" />
    </svg>
  );
}
function IconSignature({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M3 17c2-.5 3-2.5 4-5s2-5 3-5 1 3 2 4 2 1 4-1 3-3 4-3" />
      <path d="M3 20h18" />
    </svg>
  );
}
function IconFields({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="5" width="18" height="5" rx="1.5" />
      <rect x="3" y="14" width="11" height="5" rx="1.5" />
      <path d="M8 7.5h1M8 16.5h1" />
    </svg>
  );
}
function IconActivity({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}
function IconShield({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3 4 6v6c0 4.5 3.5 8 8 9 4.5-1 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function IconDownload({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}
function IconPeople({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="7" r="2.4" />
      <path d="M15 15c2-.2 6 .6 6 4.5" />
    </svg>
  );
}
function IconSparkle({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...stroke}>
      <path d="M8 2v4M8 10v4M2 8h4M10 8h4" />
    </svg>
  );
}

// ─── Components ─────────────────────────────────────────────────────
// BrandMark 은 공통 컴포넌트(../components/ui/BrandMark)를 사용

/**
 * HeroMock — legal-tech 풍의 PDF 문서 카드 + 사이드 서명자 패널 미니 합성.
 */
function HeroMock() {
  return (
    <div className="gs-hero-mock" aria-hidden="true">
      <div className="gs-hero-doc-card gs-hero-doc-main">
        <h3>개인정보 수집·이용 동의서</h3>
        <div className="gs-hd-sub">2026 · 직원 전체 · v1.2</div>
        <div className="gs-hd-line med" />
        <div className="gs-hd-line" />
        <div className="gs-hd-line short" />
        <div className="gs-hd-line med" />
        <div className="gs-hd-line" />
        <div className="gs-hd-line short" />
        <div className="gs-hd-seal">
          <IconSparkle /> FIELD · 서명 (담당자: 김가나)
        </div>
        <div className="gs-hd-sig">김가나</div>
      </div>

      <div className="gs-hero-doc-card gs-hero-doc-side">
        <div className="gs-hero-doc-side-title">Signers · 3 / 5</div>
        {[
          { name: '김가나', time: '14:22', color: '#2A3FAF', initials: 'K', done: true },
          { name: '이다라', time: '14:10', color: '#1F7A4C', initials: 'L', done: true },
          { name: '박마바', time: '14:05', color: '#A15A1A', initials: 'P', done: true },
          { name: '최사아', time: '대기', color: '#8A8A86', initials: 'C', done: false },
        ].map((s) => (
          <div className="gs-hero-sig-row" key={s.name}>
            <span className="gs-hero-sig-avatar" style={{ background: s.color }}>
              {s.initials}
            </span>
            <span>
              <div className="gs-hero-sig-name">{s.name}</div>
              <div className="gs-hero-sig-time">{s.time}</div>
            </span>
            {s.done ? (
              <span className="gs-hero-sig-tick" aria-label="서명 완료">
                <IconCheck size={11} />
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="gs-hero-pill" style={{ top: 18, left: 18 }}>
        <span
          className="gs-hero-pill-icon"
          style={{ background: 'var(--color-success-subtle)', color: 'var(--color-success)' }}
        >
          <IconCheck size={14} />
        </span>
        <strong>김가나</strong>님이 서명을 완료했습니다
      </div>
      <div className="gs-hero-pill" style={{ bottom: 30, right: 30 }}>
        <span
          className="gs-hero-pill-icon"
          style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}
        >
          <IconActivity size={14} />
        </span>
        캠페인 <strong>87 / 120</strong> 서명 완료
      </div>
    </div>
  );
}

/** 하나의 토글 가능한 FAQ 항목 */
interface FaqItemProps {
  q: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

function FaqItem({ q, children, defaultOpen = false }: FaqItemProps) {
  return (
    <details
      className="gs-faq-item"
      open={defaultOpen}
      onToggle={(e) => {
        e.currentTarget.setAttribute('data-open', e.currentTarget.open ? 'true' : 'false');
      }}
      data-open={defaultOpen ? 'true' : 'false'}
    >
      <summary className="gs-faq-q" style={{ listStyle: 'none' }}>
        <span>{q}</span>
        <IconChevronDown />
      </summary>
      <div className="gs-faq-a">{children}</div>
    </details>
  );
}

export default function AboutPage() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  // 로고/주요 CTA 목적지: 로그인 상태면 앱 홈(/docs), 아니면 로그인(/login).
  const primaryTarget = user ? '/docs' : '/login';
  const homeTarget = user ? '/docs' : '/';

  // 타이틀/메타/JSON-LD 는 라우트의 `head()` 가 TanStack Router `<HeadContent />`
  // 를 통해 document.head 에 주입한다 (`routes/index.jsx` 참조). 여기서는 별도
  // `document.title` 갱신 불필요.

  // `/guide` 에서 스크롤이 하단에 있는 채로 `/` 로 돌아오면 브라우저가 이전
  // window.scrollY 를 복원해 랜딩이 중간부터 보이는 증상을 방지한다.
  // hash 가 있으면 브라우저가 해당 앵커로 스크롤하도록 그대로 둔다.
  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    if (location.hash) return;
    if (typeof document !== 'undefined') {
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  return (
    <div className="gs-landing">
      <style>{CSS}</style>

      {/* ── Top nav ── */}
      <nav className="gs-nav" aria-label="GreedySign 랜딩 내비게이션">
        <Link
          to={homeTarget}
          className="gs-nav-brand"
          aria-label={user ? 'GreedySign 앱 홈으로' : 'GreedySign 홈으로'}
        >
          {/* 앱 내부(AppShell) 와 동일한 SVG 브랜드 마크 — 공개/앱 간 일관성 */}
          <BrandMark size={30} radius={7} />
          <span className="gs-nav-brand-label">GreedySign</span>
        </Link>
        <div className="gs-nav-links">
          <a className="gs-nav-link" href="#features">
            제품
          </a>
          <a className="gs-nav-link" href="#workflow">
            워크플로우
          </a>
          <a className="gs-nav-link" href="#security">
            보안
          </a>
          <a className="gs-nav-link" href="#faq">
            FAQ
          </a>
          <Link to="/guide" className="gs-nav-link">
            사용자 가이드
          </Link>
        </div>
        <div className="gs-nav-right">
          {/* 로그인/시작하기 는 동일 목적지(`primaryTarget`) 이므로 primary CTA 하나로 통일.
              로고 클릭이 홈(`homeTarget`)을 담당하므로 ghost 보조 버튼은 제거. */}
          <Link to={primaryTarget} className="btn btn-primary btn-sm">
            {user ? '앱 열기 →' : '로그인 →'}
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="gs-hero">
        <div className="gs-hero-grid-bg" />
        <div className="gs-hero-bg" />
        <div className="gs-hero-inner">
          <div className="gs-hero-copy">
            <span className="gs-hero-eyebrow">
              <span className="gs-hero-eyebrow-badge">NEW</span>
              캠페인 대시보드 · SSE 실시간 집계
            </span>
            <h1 className="gs-hero-title">
              하나의 서식으로,
              <br />
              <em>수백 명의 서명</em>을 한 번에 수집합니다
            </h1>
            <p className="gs-hero-sub">
              GreedySign은 기업 내부 동의·서약·계약에 특화된 오픈소스 PDF 전자서명 도구입니다.
              1:1 계약부터 임직원 전원을 대상으로 하는 대량 배포 캠페인까지, 같은 도구로
              일관된 감사 로그와 함께 처리하세요.
            </p>
            <div className="gs-hero-cta">
              <Link to={primaryTarget} className="btn btn-primary btn-lg">
                {user ? 'GreedySign 열기' : 'Google 계정으로 시작하기'}
                <IconArrow />
              </Link>
              <a href="#workflow" className="btn btn-secondary btn-lg">
                작동 방식 보기
              </a>
            </div>
            <div className="gs-hero-meta">
              <span className="gs-hero-meta-item">
                <IconCheck /> 오픈소스 · 자체 호스팅 가능
              </span>
              <span className="gs-hero-meta-item">
                <IconCheck /> SHA-256 해시·감사 로그 내장
              </span>
              <span className="gs-hero-meta-item">
                <IconCheck /> 신용카드 없이 바로 사용
              </span>
            </div>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="gs-section" id="features">
        <div className="gs-section-inner">
          <div className="gs-section-head">
            <div className="gs-section-eyebrow">제품 개요</div>
            <h2 className="gs-section-title">
              법무팀이 요구하는 증거 능력, 실무자가 원하는 사용감
            </h2>
            <p className="gs-section-sub">
              필드 배치부터 발송·서명·완료 인증서까지, 모든 단계가 하나의 도구 안에서 일관된
              감사 로그를 남기며 완결됩니다.
            </p>
          </div>

          <div className="gs-features">
            <div className="gs-feature">
              <span className="gs-feature-icon"><IconSend /></span>
              <h3 className="gs-feature-title">1:1 · 1:다수 서명</h3>
              <p className="gs-feature-desc">
                단일 계약부터 임직원 전원을 대상으로 하는 동의서 일괄 발송까지, 동일한 에디터
                경험으로 다룹니다. 템플릿으로 저장해 두면 입사자가 생길 때마다 같은 서식을
                1:1 로 재발송할 수 있어, 반복 업무에 특히 유리합니다.
              </p>
            </div>
            <div className="gs-feature">
              <span className="gs-feature-icon"><IconSignature /></span>
              <h3 className="gs-feature-title">손글씨 · 이미지 서명</h3>
              <p className="gs-feature-desc">
                터치·마우스로 직접 그리거나 저장된 서명을 재사용합니다.{' '}
                <code>user_signatures</code>에 서명을 보관해 다음 문서에서 한 번에 불러올 수
                있습니다.
              </p>
            </div>
            <div className="gs-feature">
              <span className="gs-feature-icon"><IconFields /></span>
              <h3 className="gs-feature-title">드래그로 끝나는 필드 배치</h3>
              <p className="gs-feature-desc">
                텍스트·서명·날짜·체크박스 네 가지 필드 타입을 PDF 위에 끌어다 놓으면 좌표·페이지
                크기가 자동 저장됩니다. 원본 PDF는 손대지 않습니다.
              </p>
            </div>
            <div className="gs-feature">
              <span className="gs-feature-icon"><IconActivity /></span>
              <h3 className="gs-feature-title">SSE 실시간 집계</h3>
              <p className="gs-feature-desc">
                문서별·사용자별 두 개의 Server-Sent Events 채널로 열람·서명·거절 이벤트가 즉시
                반영됩니다. 10초 폴링 폴백이 함께 동작합니다.
              </p>
            </div>
            <div className="gs-feature">
              <span className="gs-feature-icon"><IconShield /></span>
              <h3 className="gs-feature-title">SHA-256 무결성</h3>
              <p className="gs-feature-desc">
                업로드 시점과 확정 시점의 PDF 해시를 이중 기록하고, 초대·열람·서명·거절·무효화
                등 모든 액션을 <code>audit_log</code>에 남깁니다.
              </p>
            </div>
            <div className="gs-feature">
              <span className="gs-feature-icon"><IconDownload /></span>
              <h3 className="gs-feature-title">CSV · ZIP 내보내기</h3>
              <p className="gs-feature-desc">
                완료된 PDF는 전용 인증서 페이지에서 단건 다운로드하거나, 캠페인 대시보드에서
                수신자 상태 CSV · 완료 PDF ZIP으로 일괄 내보낼 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Workflow ── */}
      <section className="gs-section" id="workflow" style={{ background: 'var(--color-bg-subtle)' }}>
        <div className="gs-section-inner">
          <div className="gs-section-head">
            <div className="gs-section-eyebrow">작동 방식</div>
            <h2 className="gs-section-title">네 단계로 끝나는 서명 여정</h2>
            <p className="gs-section-sub">
              PDF 업로드부터 완료 인증서 발급까지, GreedySign은 서로 다른 도구 사이를 오가지
              않고도 전 과정을 동일한 UI에서 처리합니다.
            </p>
          </div>

          <div className="gs-steps">
            <div className="gs-step-card">
              <h3 className="gs-step-card-title">PDF 업로드 · 해시 기록</h3>
              <p>
                PDF를 업로드하면 SHA-256 해시가 즉시 저장되고 UUID 경로로 보관됩니다. 문서 또는
                템플릿 중 용도를 선택하세요.
              </p>
            </div>
            <div className="gs-step-card">
              <h3 className="gs-step-card-title">필드 배치 · 참여자 지정</h3>
              <p>
                에디터에서 텍스트·서명·날짜·체크박스를 드래그로 배치하고, 서명자·참조자에게
                필드 담당자를 지정합니다.
              </p>
            </div>
            <div className="gs-step-card">
              <h3 className="gs-step-card-title">발송 · 실시간 집계</h3>
              <p>
                개별 초대 메일, 템플릿으로 1 명에게 즉시 재발송, 또는 수신자 CSV 로 수백 건을
                한 번에 배포할 수 있습니다. 대시보드는 SSE 로 실시간 갱신됩니다.
              </p>
            </div>
            <div className="gs-step-card">
              <h3 className="gs-step-card-title">확정 · 인증서 · 보관</h3>
              <p>
                전원이 서명하면 평탄화된 완료 PDF와 해시·IP·타임스탬프가 기록된 인증서
                페이지가 생성됩니다. ZIP으로 일괄 다운로드할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Split 1: Template + Campaign (대량 배포) ── */}
      <section className="gs-section" id="bulk">
        <div className="gs-section-inner">
          <div className="gs-split">
            <div className="gs-split-copy">
              <div className="gs-section-eyebrow" style={{ textAlign: 'left', marginBottom: 12 }}>
                대량 배포 · BULK DISTRIBUTION
              </div>
              <h3>
                한 번 만든 템플릿으로
                <br />
                1 명부터 수백 명까지, 같은 서식을 반복 발송
              </h3>
              <p>
                PDF 에 필드를 한 번만 배치해 두면, 같은 서식을 새 입사자에게 1:1 로 반복
                발송하거나, 수신자 이메일 목록(CSV 붙여넣기 지원)을 붙여 수백 명에게 한 번에
                일괄 배포할 수 있습니다. 각 수신자는 자신만의 개별 문서를 받고, 소유자는
                목록·대시보드에서 전체 진행률을 한눈에 봅니다.
              </p>
              <div className="gs-split-bullets">
                <div className="gs-split-bullet">
                  <span className="gs-split-bullet-icon"><IconCheck /></span>
                  <span>
                    <strong>템플릿 1:1 발송</strong> — 근로계약서 · 개인정보 동의서처럼 고정된
                    서식을 입사자가 생길 때마다 한 명에게 다시 보내기. 캠페인을 만들 필요 없음
                  </span>
                </div>
                <div className="gs-split-bullet">
                  <span className="gs-split-bullet-icon"><IconCheck /></span>
                  <span>
                    <strong>캠페인 일괄 배포</strong> — 동일 템플릿으로 N 명에게 개별 문서
                    생성 + 초대 메일 팬아웃
                  </span>
                </div>
                <div className="gs-split-bullet">
                  <span className="gs-split-bullet-icon"><IconCheck /></span>
                  <span>
                    <strong>수신자 라이프사이클</strong> — 재발송 · 교체(후임 지정) · 제외 ·
                    수동 완료까지 대시보드에서 관리
                  </span>
                </div>
                <div className="gs-split-bullet">
                  <span className="gs-split-bullet-icon"><IconCheck /></span>
                  <span>
                    <strong>실시간 추적 + CSV · ZIP 내보내기</strong> — 발송 · 열람 · 서명 ·
                    거절 상태를 실시간으로 보고, 수신자 상태 CSV 와 완료 PDF ZIP 로 내보냅니다
                  </span>
                </div>
              </div>
              <Link to={user ? '/campaigns' : '/login'} className="btn btn-secondary">
                캠페인 둘러보기 <IconArrow />
              </Link>
            </div>

            {/* Campaign dashboard mock */}
            <div className="gs-showcase">
              <div className="gs-showcase-frame">
                <div className="gs-showcase-bar">
                  <span className="gs-showcase-dot" style={{ background: '#b42318' }} />
                  <span className="gs-showcase-dot" style={{ background: '#A15A1A' }} />
                  <span className="gs-showcase-dot" style={{ background: '#1F7A4C' }} />
                  <span
                    style={{
                      marginLeft: 12,
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    /campaigns/c_2026q2
                  </span>
                </div>
                <div style={{ padding: 24 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 10,
                      marginBottom: 20,
                    }}
                  >
                    {[
                      { label: '전체', val: 120, color: 'var(--color-text)' },
                      { label: '발송', val: 120, color: 'var(--color-primary)' },
                      { label: '서명', val: 87, color: 'var(--color-success)' },
                      { label: '거절', val: 2, color: 'var(--color-danger)' },
                    ].map((s) => (
                      <div
                        key={s.label}
                        style={{
                          padding: '12px 14px',
                          background: 'var(--color-bg-subtle)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: 'var(--radius-card)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-muted)',
                            fontWeight: 600,
                          }}
                        >
                          {s.label}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 24,
                            fontWeight: 500,
                            letterSpacing: '-0.02em',
                            color: s.color,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {s.val}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      height: 10,
                      background: 'var(--color-bg-muted)',
                      borderRadius: 'var(--radius-full)',
                      overflow: 'hidden',
                      display: 'flex',
                      border: '1px solid var(--color-border-subtle)',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ width: '72.5%', background: 'var(--color-success)' }} />
                    <div style={{ width: '1.7%', background: 'var(--color-danger)' }} />
                  </div>
                  {[
                    { email: 'hong@example.com', badge: '서명', tone: 'success' },
                    { email: 'kim@example.com', badge: '열람', tone: 'primary' },
                    { email: 'park@example.com', badge: '발송', tone: 'neutral' },
                    { email: 'lee@example.com', badge: '거절', tone: 'danger' },
                  ].map((r) => (
                    <div
                      key={r.email}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 0',
                        borderBottom: '1px dashed var(--color-border-subtle)',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {r.email}
                      </span>
                      <span className={`badge badge-${r.tone}`}>{r.badge}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Split 2: 감사 · 완료 인증서 ── */}
      <section className="gs-section" style={{ background: 'var(--color-bg-subtle)' }} id="audit">
        <div className="gs-section-inner">
          <div className="gs-split reverse">
            <div className="gs-split-copy">
              <div className="gs-section-eyebrow" style={{ textAlign: 'left', marginBottom: 12 }}>
                감사 · AUDIT
              </div>
              <h3>모든 액션에 타임스탬프, 모든 문서에 해시</h3>
              <p>
                누가 · 언제 · 무엇을 했는지 기록이 남지 않으면 전자서명은 의미가 없습니다.
                GreedySign은 원본·확정 PDF의 SHA-256 해시, 참여자의 IP · User-Agent, 모든 액션의
                감사 로그를 PostgreSQL에 적재하고 전용 인증서 페이지에서 언제든 조회할 수 있게
                합니다.
              </p>
              <div className="gs-split-bullets">
                <div className="gs-split-bullet">
                  <span className="gs-split-bullet-icon"><IconCheck /></span>
                  <span>
                    <strong>원본/확정 해시</strong> — 업로드 시점과 확정 시점을 따로 기록
                  </span>
                </div>
                <div className="gs-split-bullet">
                  <span className="gs-split-bullet-icon"><IconCheck /></span>
                  <span>
                    <strong>참여자 메타</strong> — 서명 시각, 접속 IP, User-Agent 저장
                  </span>
                </div>
                <div className="gs-split-bullet">
                  <span className="gs-split-bullet-icon"><IconCheck /></span>
                  <span>
                    <strong>액션 audit_log</strong> — 초대 · 열람 · 서명 · 거절 · 무효화 ·
                    제외 · 교체 · 수동 완료
                  </span>
                </div>
                <div className="gs-split-bullet">
                  <span className="gs-split-bullet-icon"><IconCheck /></span>
                  <span>
                    <strong>완료 PDF 평탄화</strong> — pdf-lib로 필드를 평탄화해 재변조 방지
                  </span>
                </div>
              </div>
            </div>

            <div className="gs-showcase">
              <div
                style={{
                  padding: 20,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-card)',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  완료 인증서
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'max-content 1fr',
                    gap: '8px 16px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1.7,
                    padding: 16,
                    background: 'var(--color-bg-subtle)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)' }}>Document ID</span>
                  <span>a3c4e2d1…f9b2</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Original hash</span>
                  <span>7e8a9c3d…4d91</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Signed hash</span>
                  <span>3f2be80a…8e47</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Completed at</span>
                  <span>2026-04-19 14:22:08 KST</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>Signers</span>
                  <span>3 / 3 · 모두 서명</span>
                </div>
                <div
                  style={{
                    marginTop: 14,
                    padding: '10px 14px',
                    background: 'var(--color-success-subtle)',
                    color: 'var(--color-success)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <IconCheck size={14} /> 참여자 전원이 서명을 완료했습니다.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security panel ── */}
      <section className="gs-section" id="security">
        <div className="gs-section-inner">
          <div className="gs-security">
            <div>
              <div
                className="gs-section-eyebrow"
                style={{ color: 'rgba(255,255,255,0.65)', textAlign: 'left', marginBottom: 12 }}
              >
                보안 · SECURITY
              </div>
              <h3>Google OAuth · JWT · 일회용 초대 토큰</h3>
              <p>
                로그인은 Google OAuth로 일원화하여 비밀번호를 서버에 저장하지 않습니다. 참여자
                초대는 단건·서명 전용의 만료 토큰으로 이루어지며, 모든 PDF와 인증서는 HTTPS로
                전달됩니다. 자체 호스팅 환경에서 엔터프라이즈 인프라 정책에 맞출 수 있습니다.
              </p>
            </div>
            <div className="gs-security-specs">
              <div className="gs-spec">
                <div className="gs-spec-label">Auth</div>
                <div className="gs-spec-value">Google OAuth 2.0</div>
              </div>
              <div className="gs-spec">
                <div className="gs-spec-label">Session</div>
                <div className="gs-spec-value">JWT · 서버 만료 검사</div>
              </div>
              <div className="gs-spec">
                <div className="gs-spec-label">Integrity</div>
                <div className="gs-spec-value">SHA-256 · 원본/확정 이중</div>
              </div>
              <div className="gs-spec">
                <div className="gs-spec-label">Invite token</div>
                <div className="gs-spec-value">단건 · 서명 전용 · 만료</div>
              </div>
              <div className="gs-spec">
                <div className="gs-spec-label">Transport</div>
                <div className="gs-spec-value">HTTPS · nginx 프록시</div>
              </div>
              <div className="gs-spec">
                <div className="gs-spec-label">Audit</div>
                <div className="gs-spec-value">PostgreSQL audit_log</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="gs-section" id="faq">
        <div className="gs-section-inner">
          <div className="gs-section-head">
            <div className="gs-section-eyebrow">자주 묻는 질문</div>
            <h2 className="gs-section-title">궁금한 것들, 먼저 정리했습니다</h2>
          </div>
          <div className="gs-faq">
            <FaqItem q="GreedySign은 정말 오픈소스인가요?" defaultOpen>
              네. 서버(Node.js · Hono · Drizzle ORM)·프론트엔드(React 19 · Vite · TanStack
              Router/Query)·공유 Zod 스키마(<code>packages/shared</code>)까지 전체 스택이
              오픈소스로 공개됩니다. Docker Compose 로 온프레미스·사내 인프라에 그대로
              배포할 수 있습니다.
            </FaqItem>
            <FaqItem q="일반 문서 · 템플릿 1:1 발송 · 캠페인 은 어떻게 다른가요?">
              <strong>일반 문서(<code>/docs</code>)</strong> 는 1 회성 서명 흐름입니다. 그때그때
              PDF 를 올리고 서명자·참조자를 직접 지정합니다.<br /><br />
              <strong>템플릿 1:1 발송(<code>/templates</code> → "1:1 발송")</strong> 은 고정된
              서식을 반복해서 한 명씩 보낼 때 쓰입니다. 예를 들어 근로계약서를 새 입사자가
              생길 때마다 재발송하는 경우입니다. 캠페인을 만들지 않고 템플릿에서 바로 발송하며,
              만들어진 문서는 일반 문서 목록에 함께 표시됩니다.<br /><br />
              <strong>캠페인(<code>/campaigns</code>)</strong> 은 하나의 템플릿으로 한 번에 여러
              명에게 배포하고 진행 상황을 묶어서 관리하는 대량 배포 흐름입니다. 캠페인에 속한
              문서는 목록이 비대해지지 않도록 <code>/docs</code> 에서 숨겨지고, 캠페인
              대시보드에서만 관리됩니다.
            </FaqItem>
            <FaqItem q="근로계약서 같은 걸 계속 반복해서 보내는 용도로 써도 되나요?">
              네, 바로 그 케이스를 위한 흐름이 준비돼 있습니다. PDF 를 한 번 업로드해
              <strong>템플릿</strong> 으로 저장하고 필드만 배치해 두면, 이후에는 템플릿 목록에서
              <strong>"1:1 발송"</strong> 버튼으로 한 명에게 바로 보낼 수 있습니다. 캠페인
              오버헤드 없이 같은 서식을 몇 달·몇 년에 걸쳐 반복해서 쓰기에 적합합니다.
            </FaqItem>
            <FaqItem q="수신자가 퇴사했는데 캠페인을 계속할 수 있나요?">
              네. 대시보드에서 해당 수신자의 <strong>교체</strong> 액션을 사용하면 기존 문서는
              무효화되고 후임자의 이메일로 새 문서가 재발송됩니다. 모든 교체·제외 이벤트는
              감사 로그에 기록됩니다.
            </FaqItem>
            <FaqItem q="일부 수신자가 끝까지 응답하지 않으면 어떻게 마감하나요?">
              대시보드 헤더의 <strong>수동 완료</strong> 액션으로 남은 문서를 일괄 만료
              처리하고 캠페인 상태를 <code>completed</code>로 전환할 수 있습니다. 이미 서명된
              문서는 그대로 유지됩니다.
            </FaqItem>
            <FaqItem q="서명의 법적 효력은 어떻게 확보하나요?">
              대한민국 전자문서법·전자서명법 체계에서 전자서명은 서명자 식별 · 서명 의사
              확인 · 변경 검출이 가능하면 효력이 인정됩니다. GreedySign은 Google OAuth로
              서명자를 식별하고, IP · 타임스탬프 · SHA-256 해시를 기록해 변경 검출 가능성을
              보장합니다. 공인전자서명이 필요한 상업등기 등 제한 영역은 별도 솔루션을 사용해
              주세요.
            </FaqItem>
            <FaqItem q="완료 PDF는 어떻게 보관하나요?">
              개별 문서는 완료 인증서 페이지에서, 캠페인은 "완료 PDF 일괄 다운로드 (ZIP)"
              버튼으로 한 번에 받을 수 있습니다. 서버에도 UUID 경로로 원본·확정 PDF가 함께
              보관됩니다.
            </FaqItem>
            <FaqItem q="가격 정책은 어떻게 되나요?">
              현재 버전은 오픈소스 · 자체 호스팅 전용입니다. 별도 SaaS 구독은 없으며, 설치와
              사용 모두 무료입니다. 서버 자원과 SMTP · 도메인만 준비하면 됩니다.
            </FaqItem>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="gs-cta-final">
        <h3>
          지금 첫 문서를 만들어
          <br />
          5분 안에 발송까지 끝내보세요
        </h3>
        <p>Google 계정으로 로그인하고, 설치 · 구독 · 카드 등록 없이 바로 시작합니다.</p>
        <div style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to={primaryTarget} className="btn btn-primary btn-lg">
            {user ? 'GreedySign 열기' : '로그인하고 시작하기'} <IconArrow />
          </Link>
          <Link to="/guide" className="btn btn-secondary btn-lg">
            사용자 가이드 읽기
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="gs-foot">
        <div className="gs-foot-inner">
          <div className="gs-foot-brand">
            <Link
              to={homeTarget}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--color-text)',
                textDecoration: 'none',
              }}
            >
              <BrandMark />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
                GreedySign
              </span>
            </Link>
            <p>
              엔터프라이즈 환경을 위한 오픈소스 PDF 전자서명 · 대량 배포 도구. 1:1 계약부터
              임직원 전원 동의서까지, 같은 도구 안에서 감사 로그와 함께 처리합니다.
            </p>
          </div>
          <div className="gs-foot-col">
            <div className="gs-foot-col-title">제품</div>
            <ul>
              <li><a href="#features">기능 개요</a></li>
              <li><a href="#workflow">작동 방식</a></li>
              <li><a href="#bulk">대량 배포</a></li>
              <li><a href="#security">보안</a></li>
            </ul>
          </div>
          <div className="gs-foot-col">
            <div className="gs-foot-col-title">리소스</div>
            <ul>
              <li><Link to="/guide">사용자 가이드</Link></li>
              <li><a href="#faq">자주 묻는 질문</a></li>
              <li>
                {user ? <Link to="/activity">활동 로그</Link> : <Link to="/login">로그인</Link>}
              </li>
            </ul>
          </div>
          <div className="gs-foot-col">
            <div className="gs-foot-col-title">시작하기</div>
            <ul>
              <li>
                <Link to={primaryTarget}>{user ? '앱으로 이동' : '로그인'}</Link>
              </li>
              <li>
                {user ? <Link to="/upload">새 문서 요청</Link> : <Link to="/guide#quickstart">시작 가이드</Link>}
              </li>
              <li>
                {user ? <Link to="/campaigns">캠페인</Link> : <Link to="/guide#campaigns">대량 배포 가이드</Link>}
              </li>
            </ul>
          </div>
        </div>
        <div className="gs-foot-bottom">
          <span>© 2026 GreedySign · 오픈소스 PDF 전자서명 프로젝트</span>
          <span>Typography — Pretendard Variable</span>
        </div>
      </footer>
    </div>
  );
}
