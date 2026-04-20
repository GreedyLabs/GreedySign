/**
 * SigningStatusPanel — 서명 진행 현황 패널 (EditorPage 사이드바 내 사용).
 * 소유자 전용. /documents/:docId/participants 를 폴링.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { PARTICIPANT_COLORS } from './EditLayer';

export type ParticipantStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'declined';

export type ParticipantRole = 'signer' | 'cc' | 'approver' | string;

export interface Participant {
  id: number | string;
  name?: string | null;
  email?: string | null;
  role: ParticipantRole;
  is_owner?: boolean;
  participant_status?: ParticipantStatus;
}

// 서버의 `participant_status` (pending·accepted·in_progress·completed·declined)
// 단일 값을 기준으로 뱃지/점 색을 결정한다.
const STATUS_BADGE: Record<ParticipantStatus, { label: string; cls: string }> = {
  pending: { label: '초대 대기', cls: 'badge-neutral' },
  accepted: { label: '수락', cls: 'badge-neutral' },
  in_progress: { label: '진행 중', cls: 'badge-warning' },
  completed: { label: '완료', cls: 'badge-success' },
  declined: { label: '거절', cls: 'badge-danger' },
};

function statusOf(p: Participant): ParticipantStatus {
  return p.participant_status || 'pending';
}

function dotColor(p: Participant): string {
  const s = statusOf(p);
  if (s === 'completed') return 'var(--color-success)';
  if (s === 'declined') return 'var(--color-danger)';
  if (s === 'in_progress') return 'var(--color-warning)';
  return 'var(--color-text-muted)';
}

export const SIGNING_STATUS_QUERY_KEY = (
  docId: string | number,
): readonly [string, string | number] => ['signingStatus', docId];

interface SigningStatusPanelProps {
  docId: string | number;
}

export default function SigningStatusPanel({ docId }: SigningStatusPanelProps) {
  const { data: participants = [] } = useQuery<Participant[]>({
    queryKey: SIGNING_STATUS_QUERY_KEY(docId),
    queryFn: async () => {
      const { data } = await api.get<Participant[]>(
        `/documents/${docId}/participants`,
      );
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 15_000,
  });

  // 서명자(signer)만 진행 현황 계산
  const signers = participants.filter((p) => p.role === 'signer');
  const completed = signers.filter((p) => statusOf(p) === 'completed').length;
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
          style={{
            width: `${signers.length ? (completed / signers.length) * 100 : 0}%`,
          }}
        />
      </div>

      {/* 참여자 목록 */}
      <div className="col gap-1">
        {participants.map((p, idx) => {
          const color = PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length];
          void color; // 예약된 색상 인덱스 확보용 (현재 뱃지에는 사용 안 함)
          // 참조자(cc)는 서명 대상이 아니므로 완료/진행 뱃지를 숨김
          const s = statusOf(p);
          const badge =
            p.role === 'cc' && (s === 'accepted' || s === 'in_progress')
              ? null
              : STATUS_BADGE[s];
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
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: dc,
                }}
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
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-muted)',
                      marginLeft: 4,
                    }}
                  >
                    (나)
                  </span>
                )}
              </span>

              {/* 역할 (cc는 표시) */}
              {p.role === 'cc' && (
                <span
                  className="badge badge-neutral"
                  style={{ fontSize: 10, padding: '1px 5px' }}
                >
                  참조
                </span>
              )}

              {/* 상태 뱃지 */}
              {badge && (
                <span
                  className={`badge ${badge.cls}`}
                  style={{ fontSize: 10, padding: '1px 6px' }}
                >
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
