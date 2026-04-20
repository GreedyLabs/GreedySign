/**
 * DocsPage — 내 문서(/docs) 또는 공유받은 문서(/shared) 렌더링.
 * mode="mine" 일 때는 상단에 대시보드 통계 카드를 함께 표시한다.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useDocs, useDocsSSESync, DOCS_QUERY_KEY } from '../hooks/useDocs';
import { useNavigate } from '../lib/router';
import DocTable from '../components/DocTable';
import type { DocRow } from '../components/DocTable';
import ShareModal from '../components/ShareModal';
import PageHeader from '../components/ui/PageHeader';
import { StatCard, StatGrid } from '../components/ui/StatCard';
import ListToolbar from '../components/ui/ListToolbar';
import InfoBanner from '../components/ui/InfoBanner';

// ─── Stat-card icons ──────────────────────────────────────
const StatIcon = {
  doc: (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
      <path d="M10 2v3h3" />
    </svg>
  ),
  clock: (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v3.5L10 10" />
    </svg>
  ),
  check: (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="m5 8 2.5 2.5 4-4" />
    </svg>
  ),
  pen: (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="m11 2 3 3-9 9H2v-3L11 2Z" />
    </svg>
  ),
  warn: (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--color-warning)"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v3.5M8 11v.5" />
    </svg>
  ),
};

// ─── Dashboard stat cards (mode="mine" only) ──────────────
function DashboardStats({ docs }: { docs: DocRow[] }) {
  const owned = docs.filter((d) => d.is_owner);
  const shared = docs.filter((d) => !d.is_owner);

  const frozen = owned.filter((d) => d.status === 'completed').length;
  const inProgress = owned.filter((d) => d.status === 'in_progress').length;
  const drafts = owned.filter((d) => d.status === 'draft').length;
  const pendingMySign = shared.filter(
    (d) => d.invite_status === 'accepted' && d.my_signing_status !== 'completed',
  ).length;

  return (
    <StatGrid>
      <StatCard
        label="전체 요청"
        value={owned.length}
        delta={drafts > 0 ? `초안 ${drafts}건` : '모두 발송됨'}
        deltaTone={drafts > 0 ? 'warn' : undefined}
        icon={StatIcon.doc}
        iconColor="var(--color-primary)"
      />
      <StatCard
        label="서명 진행중"
        value={inProgress}
        delta={inProgress > 0 ? '서명 대기 중' : '진행 없음'}
        deltaTone={inProgress > 0 ? 'warn' : undefined}
        icon={StatIcon.clock}
        iconColor="var(--color-warning)"
      />
      <StatCard
        label="서명 확정"
        value={frozen}
        delta={frozen > 0 ? '전원 완료·잠금됨' : '완료 없음'}
        icon={StatIcon.check}
        iconColor="var(--color-success)"
      />
      <StatCard
        label="내 서명 대기"
        value={pendingMySign}
        delta={pendingMySign > 0 ? '서명이 필요합니다' : '모두 완료'}
        deltaTone={pendingMySign > 0 ? 'warn' : undefined}
        icon={StatIcon.pen}
        iconColor="var(--color-danger)"
      />
    </StatGrid>
  );
}

// ─── Types ─────────────────────────────────────────────────
interface DocsPageProps {
  mode?: 'mine' | 'shared';
  search?: string;
  onSearchChange?: (v: string) => void;
}

// ─── DocsPage ─────────────────────────────────────────────
export default function DocsPage({
  mode = 'mine',
  search: searchProp,
  onSearchChange,
}: DocsPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: docs = [], isLoading } = useDocs() as {
    data?: DocRow[];
    isLoading: boolean;
  };
  useDocsSSESync();

  const [shareDoc, setShareDoc] = useState<DocRow | null>(null);
  // F-6: search 는 기본적으로 URL(route validateSearch) 에서 온다.
  // 호출부(_auth.docs.jsx / _auth.shared.jsx) 에서 `search` + `onSearchChange`
  // prop 으로 넘겨 주며, 없으면 내부 state 로 폴백 — 독립 사용 가능성을 남김.
  const [localSearch, setLocalSearch] = useState('');
  const search = searchProp ?? localSearch;
  const setSearch = onSearchChange ?? setLocalSearch;

  const isShared = mode === 'shared';
  const docsList: DocRow[] = docs ?? [];
  const raw = docsList.filter((d) => (isShared ? !d.is_owner : d.is_owner));
  const filtered = search.trim()
    ? raw.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : raw;

  const pendingCount = docsList.filter(
    (d) => !d.is_owner && d.invite_status === 'pending',
  ).length;

  // ── Mutations ─────────────────────────────────────────
  const handleDelete = async (id: DocRow['id']) => {
    const doc = docsList.find((d) => d.id === id);
    const n = doc?.share_count ?? 0;
    const msg =
      n > 0
        ? `이 문서는 ${n}명에게 공유되어 있습니다.\n삭제하면 공유자도 더 이상 접근할 수 없습니다.\n정말 삭제하시겠습니까?`
        : '문서를 삭제하시겠습니까?';
    if (!confirm(msg)) return;
    await api.delete(`/documents/${id}`);
    queryClient.setQueryData<DocRow[]>(DOCS_QUERY_KEY, (prev) =>
      prev ? prev.filter((d) => d.id !== id) : [],
    );
  };

  const handleAccept = async (docId: DocRow['id']) => {
    await api.patch(`/documents/${docId}/participants/me/accept`);
    queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
  };

  const handleDecline = async (docId: DocRow['id']) => {
    if (!confirm('초대를 거절하시겠습니까?')) return;
    await api.patch(`/documents/${docId}/participants/me/decline`);
    queryClient.setQueryData<DocRow[]>(DOCS_QUERY_KEY, (prev) =>
      prev ? prev.filter((d) => d.id !== docId) : [],
    );
  };

  // ── Render ────────────────────────────────────────────
  const title = isShared ? '공유받은 문서' : '내 문서';
  const subtitle = isShared
    ? `${raw.length}개 공유됨${pendingCount > 0 ? ` · ${pendingCount}건 수락 대기` : ''}`
    : `총 ${raw.length}개`;

  return (
    <div className="gs-page">
      <PageHeader title={title} subtitle={subtitle} />

      {/* 대시보드 통계 카드 (내 문서 화면에서만) */}
      {!isShared && !isLoading && <DashboardStats docs={docsList} />}

      {/* 공유 수락 대기 배너 */}
      {isShared && pendingCount > 0 && (
        <InfoBanner variant="warning" icon={StatIcon.warn}>
          서명 초대 {pendingCount}건이 수락 대기 중입니다.
        </InfoBanner>
      )}

      {/* 검색 + 건수 */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="문서 이름 검색"
        count={filtered.length}
      />

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="gs-spinner" />
        </div>
      ) : (
        <DocTable
          docs={filtered}
          onOpen={(id) => navigate(`/docs/${id}`)}
          onComplete={(id) => navigate(`/docs/${id}/complete`)}
          onShare={setShareDoc}
          onDelete={handleDelete}
          onAccept={handleAccept}
          onDecline={handleDecline}
          emptyMessage={
            isShared ? '공유받은 문서가 없습니다.' : '문서를 업로드하여 서명 요청을 시작하세요.'
          }
        />
      )}

      {shareDoc && (
        <ShareModal
          docId={shareDoc.id}
          docStatus={shareDoc.status ?? 'draft'}
          onClose={() => setShareDoc(null)}
        />
      )}
    </div>
  );
}
