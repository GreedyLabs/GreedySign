/**
 * ActivityPage — audit log feed.
 * Route: /activity
 */
import { useState, useEffect } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

// ─── Types ─────────────────────────────────────────────────
interface ActivityMeta {
  email?: string;
  invitee_email?: string;
  [key: string]: unknown;
}

interface ActivityLog {
  id: number | string;
  action: string;
  actor_name?: string | null;
  doc_name?: string | null;
  created_at: string;
  meta?: ActivityMeta | null;
}

// ─── Action metadata ──────────────────────────────────────
const ACTION_META: Record<string, { label: string; dot: string }> = {
  document_uploaded: { label: '문서 업로드', dot: 'is-primary' },
  document_viewed: { label: '문서 열람', dot: '' },
  document_exported: { label: '문서 내보내기', dot: 'is-success' },
  document_sent: { label: '문서 발송', dot: 'is-primary' },
  document_voided: { label: '문서 무효화', dot: 'is-danger' },
  document_completed: { label: '문서 완료 (자동)', dot: 'is-success' },
  signing_started: { label: '서명 시작', dot: 'is-primary' },
  signing_completed: { label: '서명 완료', dot: 'is-success' },
  signing_declined: { label: '서명 거부', dot: 'is-danger' },
  field_placed: { label: '필드 추가', dot: '' },
  participant_added: { label: '참여자 추가', dot: 'is-warning' },
  invite_accepted: { label: '초대 수락', dot: 'is-success' },
  invite_declined: { label: '초대 거절', dot: 'is-warning' },
  // 구 스키마 호환 (기존 로그)
  share_invited: { label: '서명 초대 발송', dot: 'is-warning' },
  share_accepted: { label: '초대 수락', dot: 'is-success' },
  share_declined: { label: '초대 거절', dot: 'is-warning' },
};

const ACTION_ICONS: Record<string, string> = {
  document_uploaded: 'M14 2H6a1 1 0 0 0-1 1v3M8 2v5h5M5 14v-4M3 12l2 2 2-2',
  document_exported: 'M8 2v9M5 9l3 3 3-3M2 13h12',
  document_sent: 'm14 2-7 7M14 2 9 14l-2-5-5-2 12-5Z',
  document_voided: 'M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10',
  signing_completed: 'm3 8 4 4 6-7',
  signing_declined: 'm4 4 8 8M12 4 4 12',
  participant_added: 'm14 2-7 7M14 2 9 14l-2-5-5-2 12-5Z',
  invite_accepted: 'm3 8 4 4 6-7',
  invite_declined: 'm4 4 8 8M12 4 4 12',
  share_invited: 'm14 2-7 7M14 2 9 14l-2-5-5-2 12-5Z',
  share_accepted: 'm3 8 4 4 6-7',
  share_declined: 'm4 4 8 8M12 4 4 12',
};

function DotIcon({ action }: { action: string }) {
  const d = ACTION_ICONS[action] ?? 'M8 2v6M8 10v2';
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d={d} />
    </svg>
  );
}

// ─── FeedItem ─────────────────────────────────────────────
// 시스템이 자동으로 기록하는 이벤트들은 특정 사용자에게 귀속되지 않는다.
// 예: `document_completed` 는 마지막 서명자가 제출한 순간 서버가 freeze 파이프
// 라인을 돌리며 `userId: null` 로 로그를 남긴다 — "시스템" 으로 표기해
// "알 수 없음 사용자" 같은 오해를 줄인다.
const SYSTEM_ACTIONS = new Set<string>(['document_completed']);

function FeedItem({ log }: { log: ActivityLog }) {
  const meta = ACTION_META[log.action] ?? { label: log.action, dot: '' };
  const time = new Date(log.created_at).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const mEmail = log.meta?.email ?? log.meta?.invitee_email;
  const actorLabel = log.actor_name ?? (SYSTEM_ACTIONS.has(log.action) ? '시스템' : '알 수 없음');

  return (
    <div className="gs-feed-item">
      <div className={`gs-feed-dot ${meta.dot}`}>
        <DotIcon action={log.action} />
      </div>
      <div className="col flex-1" style={{ minWidth: 0 }}>
        <div className="gs-feed-text">
          <strong>{actorLabel}</strong> {meta.label}
          {log.doc_name && (
            <>
              {' '}
              — <span style={{ color: 'var(--color-text-secondary)' }}>{log.doc_name}</span>
            </>
          )}
          {mEmail && (
            <>
              {' '}
              → <span className="t-caption">{mEmail}</span>
            </>
          )}
        </div>
        <div className="gs-feed-meta">{time}</div>
      </div>
    </div>
  );
}

// ─── Empty icon ───────────────────────────────────────────
const ActivityEmptyIcon = () => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
  >
    <polyline points="4,28 12,16 20,24 30,10 38,18 44,14" />
    <line x1="4" y1="40" x2="44" y2="40" />
  </svg>
);

// ─── ActivityPage ─────────────────────────────────────────
export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ActivityLog[]>('/activity')
      .then(({ data }) => setLogs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Group logs by calendar date
  const grouped = logs.reduce<Record<string, ActivityLog[]>>((acc, log) => {
    const date = new Date(log.created_at).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    (acc[date] ??= []).push(log);
    return acc;
  }, {});

  return (
    <div className="gs-page">
      <PageHeader title="활동 로그" subtitle="내 문서와 공유 문서에서 발생한 이벤트 내역입니다." />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="gs-spinner" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={<ActivityEmptyIcon />} title="아직 활동 기록이 없습니다." />
      ) : (
        <div className="col gap-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="t-eyebrow" style={{ marginBottom: 12 }}>
                {date}
              </div>
              <div className="gs-panel">
                <div className="gs-feed">
                  {items.map((log) => (
                    <FeedItem key={log.id} log={log} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
