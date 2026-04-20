/**
 * StatusBadge — thin wrapper over the design-system .badge / .badge-dot /
 * .badge-* classes, plus an opinionated status → variant map for the domain
 * objects we already show (documents, templates, campaigns, recipients).
 *
 *   <StatusBadge variant="success">완료</StatusBadge>
 *   <StatusBadge kind="document" status="in_progress" />
 *   <StatusBadge kind="template"  status="ready" />
 *   <StatusBadge kind="campaign"  status="in_progress" />
 *   <StatusBadge kind="recipient" status="signed" />
 */
import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const VARIANTS = new Set<BadgeVariant>([
  'neutral',
  'primary',
  'success',
  'warning',
  'danger',
]);

export type StatusKind =
  | 'document'
  | 'participant'
  | 'template'
  | 'campaign'
  | 'recipient';

interface StatusEntry {
  variant: BadgeVariant;
  label: string;
}

// Domain → { status: {variant, label} } maps.
// Centralising these here is the whole point of the refactor — previously
// TemplatesPage / CampaignsPage / DocTable each held a private copy.
const MAPS: Record<StatusKind, Record<string, StatusEntry>> = {
  document: {
    draft: { variant: 'neutral', label: '초안' },
    in_progress: { variant: 'primary', label: '서명 진행중' },
    // `.badge-dot` 이 이미 상태색 원형 점을 찍어주므로 별도 체크 접두사는 생략.
    completed: { variant: 'success', label: '서명 완료' },
    voided: { variant: 'danger', label: '무효화됨' },
  },
  // 참여자(공유받은 문서) 시점의 통합 라이프사이클 상태
  // 서버의 participant_status (pending·accepted·in_progress·completed·declined)
  // 와 fallback 값(not_started)을 모두 커버한다.
  participant: {
    pending: { variant: 'neutral', label: '초대 대기' },
    accepted: { variant: 'warning', label: '서명 대기' },
    not_started: { variant: 'warning', label: '서명 대기' },
    in_progress: { variant: 'primary', label: '서명 진행중' },
    // `.badge-dot` 이 이미 상태색 원형 점을 찍어주므로 별도 체크 접두사는 생략.
    completed: { variant: 'success', label: '서명 완료' },
    declined: { variant: 'danger', label: '거부됨' },
  },
  template: {
    draft: { variant: 'neutral', label: '초안' },
    ready: { variant: 'success', label: '배포 가능' },
    archived: { variant: 'neutral', label: '보관' },
  },
  campaign: {
    draft: { variant: 'neutral', label: '초안' },
    in_progress: { variant: 'primary', label: '진행중' },
    completed: { variant: 'success', label: '완료' },
    cancelled: { variant: 'neutral', label: '취소됨' },
  },
  recipient: {
    pending: { variant: 'neutral', label: '대기' },
    sent: { variant: 'primary', label: '발송됨' },
    viewed: { variant: 'primary', label: '열람' },
    signed: { variant: 'success', label: '서명 완료' },
    declined: { variant: 'danger', label: '거부' },
    expired: { variant: 'warning', label: '만료' },
    failed: { variant: 'danger', label: '실패' },
    excluded: { variant: 'neutral', label: '제외' },
  },
};

/**
 * Lookup helper — exposed so callers (e.g. a table renderer) can read the
 * label/variant without rendering a badge.
 */
export function resolveStatus(
  kind: StatusKind,
  status: string,
): StatusEntry | null {
  const map = MAPS[kind];
  if (!map) return null;
  return map[status] ?? null;
}

interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  kind?: StatusKind;
  status?: string;
  variant?: BadgeVariant;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export default function StatusBadge({
  kind,
  status,
  variant,
  dot = true,
  children,
  className = '',
  ...rest
}: StatusBadgeProps) {
  let resolvedVariant: BadgeVariant | undefined = variant;
  let label: ReactNode = children;

  if (kind && status) {
    const entry = resolveStatus(kind, status);
    if (entry) {
      resolvedVariant = resolvedVariant ?? entry.variant;
      if (label == null) label = entry.label;
    } else {
      resolvedVariant = resolvedVariant ?? 'neutral';
      if (label == null) label = status;
    }
  }

  if (!resolvedVariant || !VARIANTS.has(resolvedVariant)) {
    resolvedVariant = 'neutral';
  }

  const cls = ['badge', dot ? 'badge-dot' : null, `badge-${resolvedVariant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} {...rest}>
      {label}
    </span>
  );
}
