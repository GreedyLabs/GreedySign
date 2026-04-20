/**
 * CampaignDashboardPage — 캠페인 상세 & 수신자 현황.
 * 실시간 업데이트: 사용자 SSE(캠페인 이벤트) 구독으로 통계/목록 자동 재조회.
 *
 * 진행 중 캠페인에서 지원하는 수신자 라이프사이클:
 *   - 추가: "수신자 추가" 모달 → 즉시 문서 생성·발송
 *   - 제외: 문서 무효화 + status='excluded' (예: 수신자 부재)
 *   - 교체: 기존 수신자 제외 + 신규 수신자로 문서 재발송 (예: 퇴사 → 후임자)
 *   - 수동 완료: 미응답 문서를 모두 만료 처리하고 캠페인 status='completed'
 */
import { useCallback, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api, { ApiError } from '../services/api';
import { API_ENDPOINTS } from '../services/endpoints';
import { useUserSSE, type SseEvent } from '../contexts/SSEContext';
import { useNavigate, useParams } from '../lib/router';
import { formatDateTime } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import { StatCard, StatGrid } from '../components/ui/StatCard';
import ProgressBar from '../components/ui/ProgressBar';
import StatusBadge from '../components/ui/StatusBadge';
import ListTable from '../components/ui/ListTable';
import type { Column } from '../components/ui/ListTable';
import InfoBanner from '../components/ui/InfoBanner';
import EmptyState from '../components/ui/EmptyState';

// 종결 상태(=더 이상 자동 진행 없음) — 백엔드 TERMINAL_STATUSES와 일치
const TERMINAL = new Set(['signed', 'declined', 'expired', 'failed', 'excluded']);

// ─── Types ────────────────────────────────────────────────
interface CampaignStats {
  total: number;
  sent: number;
  viewed: number;
  signed: number;
  declined: number;
  excluded?: number;
  [key: string]: number | undefined;
}

type CampaignStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled' | string;

interface Campaign {
  id: number | string;
  name: string;
  status: CampaignStatus;
  message?: string | null;
  template?: { id: number | string; name?: string } | null;
  stats: CampaignStats;
  [key: string]: unknown;
}

interface Recipient {
  id: number | string;
  email: string;
  name?: string | null;
  status: string;
  error?: string | null;
  sent_at?: string | null;
  signed_at?: string | null;
  declined_at?: string | null;
  document_id?: number | string | null;
  [key: string]: unknown;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.response.data as { error?: string } | undefined;
    return body?.error ?? err.message ?? fallback;
  }
  return fallback;
}

// ─── Modal shells ─────────────────────────────────────────
interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

function ModalShell({ title, onClose, children, footer }: ModalShellProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-card)',
          padding: 20,
          width: 'min(440px, 92vw)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{title}</div>
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

// 수신자 교체 모달
interface ReplaceSubmit {
  email: string;
  name: string;
  reason: string;
}
interface ReplaceModalProps {
  recipient: Recipient;
  onSubmit: (payload: ReplaceSubmit) => void;
  onClose: () => void;
  pending: boolean;
}

function ReplaceModal({ recipient, onSubmit, onClose, pending }: ReplaceModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  return (
    <ModalShell
      title={`${recipient.email} 수신자 교체`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            취소
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !email}
            onClick={() =>
              onSubmit({ email: email.trim(), name: name.trim(), reason: reason.trim() })
            }
          >
            교체 발송
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
        기존 수신자를 제외 처리하고, 신규 이메일로 문서를 다시 발송합니다.
      </div>
      <label className="t-caption">신규 이메일</label>
      <input
        className="gs-input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="successor@example.com"
        autoFocus
      />
      <label className="t-caption" style={{ marginTop: 8, display: 'block' }}>
        이름 (선택)
      </label>
      <input
        className="gs-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="t-caption" style={{ marginTop: 8, display: 'block' }}>
        교체 사유 (선택)
      </label>
      <input
        className="gs-input"
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="예: 퇴사로 인한 후임자 지정"
      />
    </ModalShell>
  );
}

// 수신자 제외 모달
interface ExcludeSubmit {
  reason: string;
}
interface ExcludeModalProps {
  recipient: Recipient;
  onSubmit: (payload: ExcludeSubmit) => void;
  onClose: () => void;
  pending: boolean;
}

function ExcludeModal({ recipient, onSubmit, onClose, pending }: ExcludeModalProps) {
  const [reason, setReason] = useState('');
  return (
    <ModalShell
      title={`${recipient.email} 제외`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            취소
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={pending}
            onClick={() => onSubmit({ reason: reason.trim() })}
          >
            제외 처리
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
        해당 수신자의 문서를 무효화하고 캠페인 집계에서 제외합니다. 모든 미완료 수신자가 종결되면
        캠페인이 자동 완료 처리됩니다.
      </div>
      <label className="t-caption">제외 사유 (선택)</label>
      <input
        className="gs-input"
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="예: 더 이상 서명이 필요 없음"
        autoFocus
      />
    </ModalShell>
  );
}

// 수신자 추가 모달 (CSV 미니 입력)
interface AddRecipientRow {
  email: string;
  name?: string;
}
interface AddRecipientsModalProps {
  onSubmit: (rows: AddRecipientRow[]) => void;
  onClose: () => void;
  pending: boolean;
}

function AddRecipientsModal({ onSubmit, onClose, pending }: AddRecipientsModalProps) {
  const [text, setText] = useState('');
  const parsed: AddRecipientRow[] = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, name] = line.split(',').map((s) => s?.trim());
      return { email: email ?? '', name: name || undefined };
    })
    .filter((r) => r.email && r.email.includes('@'));

  return (
    <ModalShell
      title="수신자 추가"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            취소
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || parsed.length === 0}
            onClick={() => onSubmit(parsed)}
          >
            {parsed.length}명 추가·발송
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        한 줄에 한 명씩, <code>email,이름</code> 형식으로 입력하세요. 추가 즉시 문서가
        생성·발송됩니다.
      </div>
      <textarea
        className="gs-input"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'alice@example.com,앨리스\nbob@example.com'}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
        autoFocus
      />
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
        유효 이메일 {parsed.length}건 인식됨
      </div>
    </ModalShell>
  );
}

export default function CampaignDashboardPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [excludeTarget, setExcludeTarget] = useState<Recipient | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<Recipient | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const { data } = await api.get<Campaign>(API_ENDPOINTS.campaigns.get(campaignId));
      return data;
    },
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'in_progress' ? 10000 : false;
    },
    enabled: !!campaignId,
  });

  const { data: recipients = [] } = useQuery<Recipient[]>({
    queryKey: ['campaign', campaignId, 'recipients'],
    queryFn: async () => {
      const { data } = await api.get<Recipient[]>(API_ENDPOINTS.campaigns.recipients(campaignId));
      return data;
    },
    refetchInterval: () => {
      const parent = queryClient.getQueryData<Campaign>(['campaign', campaignId]);
      return parent?.status === 'in_progress' ? 10000 : false;
    },
    enabled: !!campaignId,
  });

  // SSE — 캠페인 관련 이벤트면 리페치
  const handleSSE = useCallback(
    (event: SseEvent) => {
      if (!event) return;
      if (event.campaign_id === campaignId) {
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'recipients'] });
      }
    },
    [campaignId, queryClient],
  );
  useUserSSE(handleSSE);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'recipients'] });
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  };

  const cancelMut = useMutation({
    mutationFn: async () => {
      await api.patch(API_ENDPOINTS.campaigns.cancel(campaignId));
    },
    onSuccess: invalidateAll,
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      await api.post(API_ENDPOINTS.campaigns.complete(campaignId));
    },
    onSuccess: invalidateAll,
  });

  const resendMut = useMutation({
    mutationFn: async (recipientId: Recipient['id']) => {
      await api.post(API_ENDPOINTS.campaigns.recipientResend(campaignId, recipientId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'recipients'] });
    },
  });

  const excludeMut = useMutation({
    mutationFn: async ({
      recipientId,
      reason,
    }: {
      recipientId: Recipient['id'];
      reason: string;
    }) => {
      await api.patch(API_ENDPOINTS.campaigns.recipientExclude(campaignId, recipientId), {
        reason,
      });
    },
    onSuccess: () => {
      setExcludeTarget(null);
      invalidateAll();
    },
  });

  const replaceMut = useMutation({
    mutationFn: async ({
      recipientId,
      email,
      name,
      reason,
    }: {
      recipientId: Recipient['id'];
      email: string;
      name: string;
      reason: string;
    }) => {
      await api.post(API_ENDPOINTS.campaigns.recipientReplace(campaignId, recipientId), {
        email,
        name,
        reason,
      });
    },
    onSuccess: () => {
      setReplaceTarget(null);
      invalidateAll();
    },
  });

  const addMut = useMutation({
    mutationFn: async (rows: AddRecipientRow[]) => {
      await api.post(API_ENDPOINTS.campaigns.recipients(campaignId), { recipients: rows });
    },
    onSuccess: () => {
      setShowAdd(false);
      invalidateAll();
    },
  });

  const handleExportCsv = () => {
    api
      .get<Blob>(API_ENDPOINTS.campaigns.exportCsv(campaignId), { responseType: 'blob' })
      .then((res) => {
        const blob = new Blob([res.data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${campaign?.name ?? 'campaign'}_recipients.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err: unknown) => alert(errorMessage(err, 'CSV 다운로드 실패')));
  };

  const handleExportZip = () => {
    api
      .get<Blob>(API_ENDPOINTS.campaigns.exportZip(campaignId), { responseType: 'blob' })
      .then((res) => {
        const blob = new Blob([res.data], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${campaign?.name ?? 'campaign'}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.response.status === 404) {
          alert('아직 완료된 문서가 없습니다.');
        } else {
          alert(errorMessage(err, 'ZIP 다운로드 실패'));
        }
      });
  };

  if (isLoading || !campaign) {
    return (
      <div className="gs-page">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="gs-spinner" />
        </div>
      </div>
    );
  }

  const { stats } = campaign;
  const inProgress = campaign.status === 'in_progress';
  const canCancel = campaign.status === 'in_progress' || campaign.status === 'draft';
  const hasSigned = stats.signed > 0;
  const pendingCount = recipients.filter((r) => !TERMINAL.has(r.status)).length;
  const progressPct =
    stats.total > 0 ? Math.round(((stats.signed + stats.declined) / stats.total) * 100) : 0;

  // ── Recipient list columns ────────────────────────────
  const recipientColumns: Column<Recipient>[] = [
    {
      key: 'email',
      header: '이메일',
      width: 'minmax(0, 2fr)',
      render: (r) => <span className="truncate">{r.email}</span>,
    },
    {
      key: 'name',
      header: '이름',
      width: 'minmax(0, 1fr)',
      className: 't-caption',
      render: (r) => <span className="truncate">{r.name || '—'}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: 'minmax(0, 1.2fr)',
      render: (r) => (
        <div className="col" style={{ minWidth: 0 }}>
          <StatusBadge kind="recipient" status={r.status} />
          {r.error && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-danger)',
                marginTop: 2,
                maxWidth: 240,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={r.error}
            >
              {r.error}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'sent',
      header: '발송',
      width: '140px',
      className: 't-caption',
      render: (r) => <span>{formatDateTime(r.sent_at)}</span>,
    },
    {
      key: 'signed',
      header: '서명',
      width: '140px',
      className: 't-caption',
      render: (r) => <span>{formatDateTime(r.signed_at ?? r.declined_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '260px',
      align: 'end',
      stopPropagation: true,
      render: (r) => {
        const resendable = r.status === 'sent' || r.status === 'viewed';
        const isTerminal = TERMINAL.has(r.status);
        const canExclude = inProgress && !isTerminal;
        const canReplace = inProgress && r.status !== 'signed';
        return (
          <>
            {r.document_id && r.status === 'signed' && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigate(`/docs/${r.document_id}`)}
              >
                보기
              </button>
            )}
            {resendable && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  if (!confirm(`${r.email}에게 초대 메일을 다시 보냅니다.`)) return;
                  resendMut.mutate(r.id, {
                    onSuccess: () => alert('재발송 완료'),
                    onError: (err) => alert(errorMessage(err, '재발송 실패')),
                  });
                }}
                disabled={resendMut.isPending}
              >
                재발송
              </button>
            )}
            {canReplace && (
              <button className="btn btn-ghost btn-sm" onClick={() => setReplaceTarget(r)}>
                교체
              </button>
            )}
            {canExclude && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setExcludeTarget(r)}
                style={{ color: 'var(--color-danger)' }}
              >
                제외
              </button>
            )}
          </>
        );
      },
    },
  ];

  return (
    <div className="gs-page">
      <PageHeader
        title={campaign.name}
        subtitle={`템플릿: ${campaign.template?.name ?? '—'} · ${
          campaign.status === 'in_progress'
            ? '진행중'
            : campaign.status === 'completed'
              ? '완료'
              : campaign.status === 'cancelled'
                ? '취소됨'
                : '초안'
        }`}
      >
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/campaigns')}>
          ← 목록
        </button>
        {hasSigned && (
          <button className="btn btn-secondary btn-sm" onClick={handleExportZip}>
            완료 PDF 일괄 다운로드 (ZIP)
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
          CSV 내보내기
        </button>
        {inProgress && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(true)}>
            수신자 추가
          </button>
        )}
        {inProgress && pendingCount > 0 && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (
                !confirm(
                  `미응답 수신자 ${pendingCount}명의 문서를 만료 처리하고 캠페인을 완료합니다.\n계속하시겠습니까?`,
                )
              )
                return;
              completeMut.mutate(undefined, {
                onError: (err) => alert(errorMessage(err, '완료 처리 실패')),
              });
            }}
            disabled={completeMut.isPending}
          >
            수동 완료
          </button>
        )}
        {canCancel && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (
                !confirm('캠페인을 취소합니다.\n미응답 문서는 모두 무효화됩니다. 계속하시겠습니까?')
              )
                return;
              cancelMut.mutate();
            }}
            disabled={cancelMut.isPending}
            style={{ color: 'var(--color-danger)' }}
          >
            취소
          </button>
        )}
      </PageHeader>

      {campaign.message && (
        <InfoBanner variant="info" title="수신자 메시지" marginBottom={16}>
          {campaign.message}
        </InfoBanner>
      )}

      {/* 통계 카드 (compact 타일 row) */}
      <StatGrid variant="row">
        <StatCard compact label="전체" value={stats.total} valueColor="var(--color-text)" />
        <StatCard
          compact
          label="발송"
          value={stats.sent + stats.viewed}
          valueColor="var(--color-primary)"
        />
        <StatCard compact label="열람" value={stats.viewed} valueColor="#0ea5e9" />
        <StatCard
          compact
          label="서명 완료"
          value={stats.signed}
          valueColor="var(--color-success)"
        />
        <StatCard compact label="거절" value={stats.declined} valueColor="var(--color-danger)" />
        <StatCard
          compact
          label="제외"
          value={stats.excluded ?? 0}
          valueColor="var(--color-text-muted)"
        />
      </StatGrid>

      <div
        style={{
          padding: 16,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-surface)',
          marginBottom: 20,
        }}
      >
        <ProgressBar
          total={stats.total}
          height={10}
          caption={`진행률 ${progressPct}% (완료 + 거절)`}
          segments={[
            { value: stats.signed, color: 'var(--color-success)' },
            { value: stats.declined, color: 'var(--color-danger)' },
            { value: stats.viewed, color: '#0ea5e9' },
            { value: stats.sent, color: 'var(--color-primary)' },
          ]}
        />
      </div>

      {/* 수신자 목록 */}
      <ListTable<Recipient>
        columns={recipientColumns}
        rows={recipients}
        rowKey={(r) => r.id}
        empty={
          <EmptyState title="수신자가 없습니다" description="아직 등록된 수신자가 없습니다." />
        }
      />

      {excludeTarget && (
        <ExcludeModal
          recipient={excludeTarget}
          pending={excludeMut.isPending}
          onClose={() => setExcludeTarget(null)}
          onSubmit={({ reason }) =>
            excludeMut.mutate(
              { recipientId: excludeTarget.id, reason },
              {
                onError: (err) => alert(errorMessage(err, '제외 처리 실패')),
              },
            )
          }
        />
      )}

      {replaceTarget && (
        <ReplaceModal
          recipient={replaceTarget}
          pending={replaceMut.isPending}
          onClose={() => setReplaceTarget(null)}
          onSubmit={(payload) =>
            replaceMut.mutate(
              { recipientId: replaceTarget.id, ...payload },
              {
                onError: (err) => alert(errorMessage(err, '교체 실패')),
              },
            )
          }
        />
      )}

      {showAdd && (
        <AddRecipientsModal
          pending={addMut.isPending}
          onClose={() => setShowAdd(false)}
          onSubmit={(rows) =>
            addMut.mutate(rows, {
              onError: (err) => alert(errorMessage(err, '수신자 추가 실패')),
            })
          }
        />
      )}
    </div>
  );
}
