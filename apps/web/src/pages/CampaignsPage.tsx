/**
 * CampaignsPage — 대량 배포 캠페인 목록.
 * 캠페인은 템플릿 기반으로 생성되며, 발송 후 수신자 응답 집계 대시보드(/campaigns/:id)로 이동.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { API_ENDPOINTS } from '../services/endpoints';
import { useNavigate } from '../lib/router';
import { formatDate } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import ListTable from '../components/ui/ListTable';
import type { Column } from '../components/ui/ListTable';
import StatusBadge from '../components/ui/StatusBadge';
import ProgressBar from '../components/ui/ProgressBar';
import EmptyState from '../components/ui/EmptyState';

interface Campaign {
  id: number | string;
  name: string;
  message?: string | null;
  template_name?: string | null;
  status: string;
  signed_count?: number;
  declined_count?: number;
  recipient_count?: number;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

const CAMPAIGNS_QUERY_KEY = ['campaigns'] as const;

const CampaignEmptyIcon = () => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
  >
    <path d="M6 24a18 18 0 1 0 36 0 18 18 0 0 0-36 0Z" />
    <path d="m42 6-18 18" />
    <path d="M42 6h-9v9" />
  </svg>
);

export default function CampaignsPage() {
  const navigate = useNavigate();

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: CAMPAIGNS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<Campaign[]>(API_ENDPOINTS.campaigns.list);
      return data;
    },
  });

  const inProgressCount = campaigns.filter((c) => c.status === 'in_progress').length;

  // ── Columns ────────────────────────────────────────────
  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      header: '이름',
      width: 'minmax(0, 2.2fr)',
      render: (c) => (
        <div className="col" style={{ minWidth: 0 }}>
          <div className="gs-doc-title truncate">{c.name}</div>
          {c.message && <div className="gs-doc-sub truncate">{c.message}</div>}
        </div>
      ),
    },
    {
      key: 'template',
      header: '템플릿',
      width: 'minmax(0, 1.2fr)',
      className: 't-caption',
      render: (c) => <span className="truncate">{c.template_name}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      render: (c) => <StatusBadge kind="campaign" status={c.status} />,
    },
    {
      key: 'progress',
      header: '진행률',
      width: 'minmax(0, 1.2fr)',
      render: (c) => (
        <ProgressBar
          value={c.signed_count ?? 0}
          declined={c.declined_count ?? 0}
          total={c.recipient_count ?? 0}
        />
      ),
    },
    {
      key: 'started',
      header: '시작',
      width: '110px',
      className: 't-caption',
      render: (c) => <span>{formatDate(c.started_at)}</span>,
    },
    {
      key: 'completed',
      header: '완료',
      width: '110px',
      className: 't-caption',
      render: (c) => <span>{formatDate(c.completed_at ?? c.cancelled_at)}</span>,
    },
  ];

  return (
    <div className="gs-page">
      <PageHeader
        title="캠페인"
        subtitle={`${campaigns.length}개 · 진행중 ${inProgressCount}개`}
      >
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/templates')}>
          템플릿 보기
        </button>
      </PageHeader>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="gs-spinner" />
        </div>
      ) : (
        <ListTable<Campaign>
          columns={columns}
          rows={campaigns}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/campaigns/${c.id}`)}
          empty={
            <EmptyState
              icon={<CampaignEmptyIcon />}
              title="아직 캠페인이 없습니다"
              description="템플릿을 만들고 수신자 목록을 붙여넣으면 한 번에 일괄 발송할 수 있습니다."
              action={
                <button className="btn btn-primary" onClick={() => navigate('/templates')}>
                  템플릿 보기
                </button>
              }
            />
          }
        />
      )}
    </div>
  );
}
