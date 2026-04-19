/**
 * SigningStatusPanel — 서명 진행 현황 패널 (EditorPage 사이드바 내 사용).
 * 소유자 전용. /documents/:docId/participants 를 폴링.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { PARTICIPANT_COLORS } from './EditLayer';

const SIGN_BADGE = {
  not_started: { label: '미서명', cls: 'badge-neutral' },
  in_progress: { label: '진행 중', cls: 'badge-warning' },
  completed: { label: '완료', cls: 'badge-success' },
  declined: { label: '거부됨', cls: 'badge-danger' },
};
const INVITE_BADGE = {
  pending: { label: '초대 대기', cls: 'badge-neutral' },
  declined: { label: '거절', cls: 'badge-danger' },
};

// Dot color for each composite state
function dotColor(p) {
  if (p.invite_status === 'declined') return 'var(--color-danger)';
  if (p.invite_status === 'pending') return 'var(--color-text-muted)';
  if (p.signing_status === 'completed') return 'var(--color-success)';
  if (p.signing_status === 'declined') return 'var(--color-danger)';
  if (p.signing_status === 'in_progress') return 'var(--color-warning)';
  return 'var(--color-text-muted)';
}

export const SIGNING_STATUS_QUERY_KEY = (docId) => ['signingStatus', docId];

export default function SigningStatusPanel({ docId }) {
  const { data: participants = [] } = useQuery({
    queryKey: SIGNING_STATUS_QUERY_KEY(docId),
    queryFn: async () => {
      const { data } = await api.get(`/documents/${docId}/participants`);
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 15_000,
  });

  // 서명자(signer)만 진행 현황 계산
  const signers = participants.filter((p) => p.role === 'signer');
  const completed = signers.filter((p) => p.signing_status === 'completed').length;
  const allDone = signers.length > 0 && completed === signers.length;

  if (participants.length === 0) return null;

  return (
    <div>
      {/* 헤더 */}
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div className="t-eyebrow">서명 현황</div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: allDone ? 'var(--color-success)' : 'var(--color-text-muted)',
          }}
        >
          {completed}/{signers.length} 완료
        </span>
      </div>

      {/* 진행률 바 */}
      <div className="gs-progress-track" style={{ marginBottom: 12 }}>
        <div
          className={`gs-progress-fill${allDone ? ' is-complete' : ''}`}
          style={{ width: `${signers.length ? (completed / signers.length) * 100 : 0}%` }}
        />
      </div>

      {/* 참여자 목록 */}
      <div className="col gap-1">
        {participants.map((p, idx) => {
          const color = PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length];
          const isInvitePending = p.invite_status !== 'accepted';
          const badge = isInvitePending
            ? INVITE_BADGE[p.invite_status]
            : p.role === 'cc'
              ? null
              : SIGN_BADGE[p.signing_status];
          const dc = dotColor(p);
          const displayName = p.name || p.email;

          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {/* 상태 점 */}
              <div
                style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dc }}
              />

              {/* 이름 */}
              <span
                style={{
                  fontSize: 12.5,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--color-text)',
                }}
              >
                {displayName}
                {p.is_owner && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 4 }}>
                    (나)
                  </span>
                )}
              </span>

              {/* 역할 (cc는 표시) */}
              {p.role === 'cc' && (
                <span className="badge badge-neutral" style={{ fontSize: 10, padding: '1px 5px' }}>
                  참조
                </span>
              )}

              {/* 상태 뱃지 */}
              {badge && (
                <span className={`badge ${badge.cls}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                  {badge.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
