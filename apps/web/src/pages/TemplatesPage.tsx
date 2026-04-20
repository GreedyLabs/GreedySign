/**
 * TemplatesPage — 재사용 가능한 PDF 템플릿 목록.
 * 같은 서식을 1:1 반복 발송하거나 캠페인으로 대량 배포하기 위한 출발점.
 */
import { useRef, useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api, { ApiError } from '../services/api';
import { API_ENDPOINTS } from '../services/endpoints';
import { useNavigate } from '../lib/router';
import { formatDate } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import ListTable from '../components/ui/ListTable';
import type { Column } from '../components/ui/ListTable';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import InfoBanner from '../components/ui/InfoBanner';
import InstantiateTemplateDialog from '../components/templates/InstantiateTemplateDialog';
import type { TemplateSummary } from '../components/templates/InstantiateTemplateDialog';

// ─── Types ─────────────────────────────────────────────────
interface Template extends TemplateSummary {
  description?: string | null;
  status: string;
  field_count?: number;
  campaign_count?: number;
  updated_at?: string | null;
}

interface TemplateUploadResponse {
  id: number | string;
}

const TEMPLATES_QUERY_KEY = ['templates'] as const;

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.response.data as { error?: string } | undefined;
    return body?.error ?? err.message ?? fallback;
  }
  return fallback;
}

// ─── Icons ────────────────────────────────────────────────
const PlusIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  >
    <path d="M8 3v10M3 8h10" />
  </svg>
);

const TemplateEmptyIcon = () => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
  >
    <path d="M10 6h20l10 10v28a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    <path d="M30 6v10h10M14 22h20M14 28h20M14 34h14" />
  </svg>
);

export default function TemplatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [instantiateTarget, setInstantiateTarget] = useState<Template | null>(null);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: TEMPLATES_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<Template[]>(API_ENDPOINTS.templates.list);
      return data;
    },
  });

  const handleUpload = async (file: File) => {
    if (!file) return;
    setError('');
    setUploading(true);
    const form = new FormData();
    form.append('pdf', file);
    try {
      const { data } = await api.post<TemplateUploadResponse>(
        API_ENDPOINTS.templates.upload,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY });
      navigate(`/templates/${data.id}`);
    } catch (err) {
      setError(errorMessage(err, '업로드 실패'));
    } finally {
      setUploading(false);
    }
  };

  const deleteMut = useMutation({
    mutationFn: async (id: Template['id']) => {
      await api.delete(API_ENDPOINTS.templates.remove(id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY }),
  });

  const handleDelete = (tpl: Template) => {
    const msg =
      (tpl.campaign_count ?? 0) > 0
        ? `이 템플릿은 ${tpl.campaign_count}개의 캠페인에서 사용되었습니다.\n종료된 캠페인만 있다면 삭제할 수 있습니다.\n계속하시겠습니까?`
        : '이 템플릿을 삭제하시겠습니까?';
    if (!confirm(msg)) return;
    deleteMut.mutate(tpl.id, {
      onError: (err) => alert(errorMessage(err, '삭제 실패')),
    });
  };

  const readyCount = templates.filter((t) => t.status === 'ready').length;

  // ── Columns ────────────────────────────────────────────
  const columns: Column<Template>[] = [
    {
      key: 'name',
      header: '이름',
      width: 'minmax(0, 2.4fr)',
      render: (t) => (
        <div className="col" style={{ minWidth: 0 }}>
          <div className="gs-doc-title truncate">{t.name}</div>
          {t.description && <div className="gs-doc-sub truncate">{t.description}</div>}
        </div>
      ),
    },
    {
      key: 'status',
      header: '상태',
      width: '110px',
      render: (t) => <StatusBadge kind="template" status={t.status} />,
    },
    {
      key: 'fields',
      header: '필드',
      width: '80px',
      align: 'end',
      className: 't-num',
      render: (t) => <span>{t.field_count ?? 0}</span>,
    },
    {
      key: 'campaigns',
      header: '캠페인',
      width: '90px',
      align: 'end',
      className: 't-num',
      render: (t) => <span>{t.campaign_count ?? 0}</span>,
    },
    {
      key: 'updated',
      header: '수정일',
      width: '110px',
      className: 't-caption',
      render: (t) => <span>{formatDate(t.updated_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '170px',
      align: 'end',
      stopPropagation: true,
      render: (t) => (
        <>
          {t.status === 'ready' && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setInstantiateTarget(t)}
                style={{ marginRight: 6 }}
                title="이 템플릿으로 한 명에게 바로 보내기"
              >
                1:1 발송
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/campaigns/new?template=${t.id}`)}
                style={{ marginRight: 6 }}
              >
                캠페인 시작
              </button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(t)} title="삭제">
            삭제
          </button>
        </>
      ),
    },
  ];

  return (
    <div className="gs-page">
      <PageHeader
        title="템플릿"
        subtitle={`${templates.length}개 · 배포 가능 ${readyCount}개`}
      >
        <button
          className="btn btn-primary btn-sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <PlusIcon />
          {uploading ? '업로드 중…' : '새 템플릿'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (f) {
              handleUpload(f);
              e.target.value = '';
            }
          }}
        />
      </PageHeader>

      <InfoBanner variant="primary" title="템플릿이란?">
        하나의 PDF에 "이름·서명·날짜" 같은 필드를 한 번만 배치해두면, 이후 수신자 N명에게 같은
        문서를 일괄 발송할 수 있는 재사용 가능한 서식입니다.
      </InfoBanner>

      {error && (
        <InfoBanner variant="danger" marginBottom={16}>
          {error}
        </InfoBanner>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="gs-spinner" />
        </div>
      ) : (
        <ListTable<Template>
          columns={columns}
          rows={templates}
          rowKey={(t) => t.id}
          onRowClick={(t) => navigate(`/templates/${t.id}`)}
          empty={
            <EmptyState
              icon={<TemplateEmptyIcon />}
              title="아직 등록된 템플릿이 없습니다"
              description="한 번의 PDF + 필드 배치로 수십·수백 명에게 같은 계약서를 받을 수 있습니다."
              action={
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                  첫 템플릿 업로드
                </button>
              }
            />
          }
        />
      )}

      <InstantiateTemplateDialog
        template={instantiateTarget}
        open={!!instantiateTarget}
        onClose={() => setInstantiateTarget(null)}
      />
    </div>
  );
}
