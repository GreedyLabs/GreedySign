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
import ShareModal from '../components/ShareModal';
import PageHeader from '../components/ui/PageHeader';

// ─── Icons ────────────────────────────────────────────────
const SearchIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    style={{
      position: 'absolute',
      left: 10,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--color-text-muted)',
      pointerEvents: 'none',
    }}
  >
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);

// ─── Stat card ────────────────────────────────────────────
function StatCard({ label, value, delta, deltaClass = '', icon, iconColor }) {
  return (
    <div className="gs-stat">
      {icon && (
        <div style={{ color: iconColor ?? 'var(--color-primary)', marginBottom: 4, opacity: 0.65 }}>
          {icon}
        </div>
      )}
      <div className="gs-stat-label">{label}</div>
      <div className="gs-stat-value">{value}</div>
      {delta != null && (
        <div className={`gs-stat-delta${deltaClass ? ' ' + deltaClass : ''}`}>{delta}</div>
      )}
    </div>
  );
}

// ─── Dashboard stat cards (mode="mine" only) ──────────────
function DashboardStats({ docs }) {
  const owned = docs.filter((d) => d.is_owner);
  const shared = docs.filter((d) => !d.is_owner);

  const frozen = owned.filter((d) => d.status === 'completed').length;
  const inProgress = owned.filter((d) => d.status === 'in_progress').length;
  const drafts = owned.filter((d) => d.status === 'draft').length;
  const pendingMySign = shared.filter(
    (d) => d.invite_status === 'accepted' && d.my_signing_status !== 'completed'
  ).length;

  return (
    <div className="gs-stats">
      <StatCard
        label="전체 요청"
        value={owned.length}
        delta={drafts > 0 ? `초안 ${drafts}건` : '모두 발송됨'}
        deltaClass={drafts > 0 ? 'is-warn' : ''}
        iconColor="var(--color-primary)"
        icon={
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
        }
      />
      <StatCard
        label="서명 진행중"
        value={inProgress}
        delta={inProgress > 0 ? '서명 대기 중' : '진행 없음'}
        deltaClass={inProgress > 0 ? 'is-warn' : ''}
        iconColor="var(--color-warning)"
        icon={
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
        }
      />
      <StatCard
        label="서명 확정"
        value={frozen}
        delta={frozen > 0 ? '전원 완료·잠금됨' : '완료 없음'}
        iconColor="var(--color-success)"
        icon={
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
        }
      />
      <StatCard
        label="내 서명 대기"
        value={pendingMySign}
        delta={pendingMySign > 0 ? '서명이 필요합니다' : '모두 완료'}
        deltaClass={pendingMySign > 0 ? 'is-warn' : ''}
        iconColor="var(--color-danger)"
        icon={
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
        }
      />
    </div>
  );
}

// ─── DocsPage ─────────────────────────────────────────────
export default function DocsPage({ mode = 'mine' }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: docs = [], isLoading } = useDocs();
  useDocsSSESync();

  const [shareDoc, setShareDoc] = useState(null); // {id, status, ...}
  const [search, setSearch] = useState('');

  const isShared = mode === 'shared';
  const raw = docs.filter((d) => (isShared ? !d.is_owner : d.is_owner));
  const filtered = search.trim()
    ? raw.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : raw;

  const pendingCount = docs.filter((d) => !d.is_owner && d.invite_status === 'pending').length;

  // ── Mutations ─────────────────────────────────────────
  const handleDelete = async (id) => {
    const doc = docs.find((d) => d.id === id);
    const n = doc?.share_count ?? 0;
    const msg =
      n > 0
        ? `이 문서는 ${n}명에게 공유되어 있습니다.\n삭제하면 공유자도 더 이상 접근할 수 없습니다.\n정말 삭제하시겠습니까?`
        : '문서를 삭제하시겠습니까?';
    if (!confirm(msg)) return;
    await api.delete(`/documents/${id}`);
    queryClient.setQueryData(DOCS_QUERY_KEY, (prev) => prev?.filter((d) => d.id !== id) ?? []);
  };

  const handleAccept = async (docId) => {
    await api.patch(`/documents/${docId}/participants/me/accept`);
    queryClient.invalidateQueries({ queryKey: DOCS_QUERY_KEY });
  };

  const handleDecline = async (docId) => {
    if (!confirm('초대를 거절하시겠습니까?')) return;
    await api.patch(`/documents/${docId}/participants/me/decline`);
    queryClient.setQueryData(DOCS_QUERY_KEY, (prev) => prev?.filter((d) => d.id !== docId) ?? []);
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
      {!isShared && !isLoading && <DashboardStats docs={docs} />}

      {/* 공유 수락 대기 배너 */}
      {isShared && pendingCount > 0 && (
        <div
          style={{
            padding: '11px 16px',
            background: 'var(--color-warning-subtle)',
            border: '1px solid var(--color-warning)',
            borderRadius: 'var(--radius-card)',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
          }}
        >
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
          <span style={{ color: 'var(--color-warning)', fontWeight: 500 }}>
            서명 초대 {pendingCount}건이 수락 대기 중입니다.
          </span>
        </div>
      )}

      {/* 검색 + 건수 */}
      <div className="gs-toolbar">
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <SearchIcon />
          <input
            className="input"
            placeholder="문서 이름 검색"
            style={{ paddingLeft: 32 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="t-caption" style={{ marginLeft: 'auto' }}>
          {filtered.length}건
        </span>
      </div>

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
          docStatus={shareDoc.status}
          onClose={() => setShareDoc(null)}
        />
      )}
    </div>
  );
}
