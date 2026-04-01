import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const statusLabel = { not_started: '미서명', in_progress: '진행 중', completed: '완료' };
const statusColor = { not_started: '#9ca3af', in_progress: '#f59e0b', completed: '#10b981' };
const inviteLabel = { pending: '초대 대기', accepted: null, declined: '거절' };
const inviteColor = { pending: '#a78bfa', accepted: null, declined: '#ef4444' };

const REFRESH_EVENT = 'signing-status-refresh';
export const refreshSigningStatus = () => window.dispatchEvent(new Event(REFRESH_EVENT));

export default function SigningStatusPanel({ docId }) {
  const [statuses, setStatuses] = useState([]);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/documents/${docId}/shares`);
      setStatuses(data);
    } catch {}
  }, [docId]);

  useEffect(() => {
    loadStatus();
    window.addEventListener(REFRESH_EVENT, loadStatus);
    return () => window.removeEventListener(REFRESH_EVENT, loadStatus);
  }, [loadStatus]);

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
        {statuses.map(s => (
          <div key={s.share_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: s.invite_status !== 'accepted'
                ? (inviteColor[s.invite_status] || '#9ca3af')
                : statusColor[s.signing_status] }} />
            <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.invitee_name}</span>
            <span style={{ fontSize: 11, fontWeight: 500,
              color: s.invite_status !== 'accepted'
                ? (inviteColor[s.invite_status] || '#9ca3af')
                : statusColor[s.signing_status] }}>
              {s.invite_status !== 'accepted'
                ? (inviteLabel[s.invite_status] || s.invite_status)
                : statusLabel[s.signing_status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
