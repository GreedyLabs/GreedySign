import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

const statusLabel = { not_started: '미서명', in_progress: '진행 중', completed: '완료' };
const statusColor = { not_started: '#9ca3af', in_progress: '#f59e0b', completed: '#10b981' };
const inviteLabel = { pending: '초대 대기', accepted: null, declined: '거절' };
const inviteColor = { pending: '#a78bfa', accepted: null, declined: '#ef4444' };

export const SIGNING_STATUS_QUERY_KEY = (docId) => ['signingStatus', docId];

export default function SigningStatusPanel({ docId, onViewSignatures, viewingEmail }) {
  const { data: statuses = [] } = useQuery({
    queryKey: SIGNING_STATUS_QUERY_KEY(docId),
    queryFn: async () => {
      const { data } = await api.get(`/documents/${docId}/shares`);
      return data;
    },
  });

  if (statuses.length === 0) return null;

  const completed = statuses.filter(s => s.signing_status === 'completed').length;

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>서명 현황</p>
        <span style={{ fontSize: 11, color: completed === statuses.length ? '#10b981' : '#6b7280', fontWeight: 500 }}>
          {completed}/{statuses.length} 완료
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {statuses.map(s => {
          const isViewing = viewingEmail === s.invitee_email;
          const canView = s.invite_status === 'accepted';
          return (
            <div key={s.share_id}
              onClick={() => canView && onViewSignatures(isViewing ? null : s.invitee_email)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 6,
                background: isViewing ? '#f5f3ff' : 'transparent',
                cursor: canView ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (canView && !isViewing) e.currentTarget.style.background = '#f9fafb'; }}
              onMouseLeave={e => { if (!isViewing) e.currentTarget.style.background = 'transparent'; }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: s.invite_status !== 'accepted'
                  ? (inviteColor[s.invite_status] || '#9ca3af')
                  : statusColor[s.signing_status] }} />
              <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.invitee_name}</span>
              {isViewing && <span style={{ fontSize: 10, color: '#8b5cf6' }}>보는 중</span>}
              <span style={{ fontSize: 11, fontWeight: 500,
                color: s.invite_status !== 'accepted'
                  ? (inviteColor[s.invite_status] || '#9ca3af')
                  : statusColor[s.signing_status] }}>
                {s.invite_status !== 'accepted'
                  ? (inviteLabel[s.invite_status] || s.invite_status)
                  : statusLabel[s.signing_status]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
