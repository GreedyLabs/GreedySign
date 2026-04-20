/**
 * NotificationsPage — 알림 목록 및 읽음 처리.
 * Route: /notifications
 */
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useNavigate } from '../lib/router';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import {
  BanIcon,
  BellEmptyIcon,
  BellIcon,
  CheckIcon,
  InviteIcon,
  PenIcon,
  StarIcon,
  TrashIcon,
  XIcon,
  type IconProps,
} from '../components/ui/Icon';

interface Notification {
  id: number | string;
  type: string;
  title: string;
  body?: string | null;
  read_at?: string | null;
  created_at: string;
  document_id?: number | string | null;
}

interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
}

interface TypeConfig {
  Icon: (props: IconProps) => React.ReactElement;
  label: string;
  color: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  invite_received: { Icon: InviteIcon, label: '서명 초대', color: 'var(--color-primary)' },
  invite_accepted: { Icon: CheckIcon, label: '초대 수락', color: 'var(--color-success)' },
  invite_declined: { Icon: XIcon, label: '초대 거절', color: 'var(--color-danger)' },
  signing_completed: { Icon: PenIcon, label: '서명 완료', color: 'var(--color-success)' },
  signing_declined: { Icon: BanIcon, label: '서명 거부', color: 'var(--color-danger)' },
  document_completed: { Icon: StarIcon, label: '문서 완료', color: 'var(--color-success)' },
  document_voided: { Icon: TrashIcon, label: '문서 무효화', color: 'var(--color-warning)' },
};

function formatDate(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 172800) return '어제';
  return d.toLocaleDateString('ko-KR');
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get<NotificationsResponse>('/notifications');
      return data;
    },
    staleTime: 10_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const markAllRead = async () => {
    await api.patch('/notifications/read');
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const handleClick = async (n: Notification) => {
    if (!n.read_at) {
      await api.patch(`/notifications/${n.id}/read`);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (n.document_id) navigate(`/docs/${n.document_id}`);
  };

  return (
    <div className="gs-page-narrow">
      <PageHeader
        title="알림"
        subtitle={unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}건` : '모두 읽음'}
      >
        {unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
            모두 읽음 표시
          </button>
        )}
      </PageHeader>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="gs-spinner" />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<BellEmptyIcon />}
          title="알림이 없습니다"
          description="서명 요청이나 서명 완료 시 알림이 표시됩니다."
        />
      ) : (
        <div className="gs-table">
          {notifications.map((n) => {
            const cfg: TypeConfig = TYPE_CONFIG[n.type] || {
              Icon: BellIcon,
              label: n.type,
              color: 'var(--color-text-muted)',
            };
            const isUnread = !n.read_at;
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '14px 20px',
                  cursor: n.document_id ? 'pointer' : 'default',
                  background: isUnread ? 'var(--color-primary-subtle)' : 'transparent',
                  borderLeft: `3px solid ${isUnread ? cfg.color : 'transparent'}`,
                  borderBottom: '1px solid var(--color-border-subtle)',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e: ReactMouseEvent<HTMLDivElement>) => {
                  if (n.document_id) e.currentTarget.style.background = 'var(--color-bg-subtle)';
                }}
                onMouseLeave={(e: ReactMouseEvent<HTMLDivElement>) => {
                  e.currentTarget.style.background = isUnread
                    ? 'var(--color-primary-subtle)'
                    : 'transparent';
                }}
              >
                <div
                  style={{
                    color: cfg.color,
                    flexShrink: 0,
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <cfg.Icon />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isUnread ? 600 : 400,
                        color: 'var(--color-text)',
                      }}
                    >
                      {n.title}
                    </span>
                    {isUnread && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: cfg.color,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                  {n.body && (
                    <div className="t-caption" style={{ marginBottom: 4 }}>
                      {n.body}
                    </div>
                  )}
                  <div className="t-caption" style={{ color: 'var(--color-text-muted)' }}>
                    {formatDate(n.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
