/**
 * DocTable — owner/shared 문서 리스트 공용 테이블.
 * ListTable / StatusBadge / ProgressBar 위에 얹어 시각 언어 통일.
 */
import Avatar from './ui/Avatar';
import EmptyState from './ui/EmptyState';
import ListTable, { type Column } from './ui/ListTable';
import StatusBadge, { type StatusKind } from './ui/StatusBadge';
import ProgressBar from './ui/ProgressBar';
import { TrashIcon } from './ui/Icon';
import { formatSize, formatRelativeDate } from '../lib/format';

/** 소유자/참여자 시점을 모두 커버하는 느슨한 shape. */
export interface DocRow {
  id: number | string;
  name: string;
  status?: string;
  is_owner?: boolean;
  page_count?: number;
  size_bytes?: number;
  share_count?: number;
  completed_count?: number;
  updated_at?: string | number | Date | null;
  owner_name?: string | null;
  my_participant_status?: string;
  my_signing_status?: string;
  invite_status?: string;
}

/** 참여자는 통합 my_participant_status 우선, 없으면 구 API shape 로 fallback. */
function getStatusProps(doc: DocRow): { kind: StatusKind; status: string } {
  if (doc.is_owner) return { kind: 'document', status: doc.status ?? 'in_progress' };
  const unified = doc.my_participant_status;
  if (unified) return { kind: 'participant', status: unified };
  if (doc.invite_status === 'declined') return { kind: 'participant', status: 'declined' };
  if (doc.invite_status === 'pending') return { kind: 'participant', status: 'pending' };
  return { kind: 'participant', status: doc.my_signing_status ?? 'not_started' };
}

// 기존 외부 consumer 호환용 re-export.
export { formatSize };
export const formatDate = formatRelativeDate;

const DocFileIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
    <path d="M10 2v3h3M5 7h6M5 9.5h4" />
  </svg>
);
const ShareIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <circle cx="5" cy="8" r="2" />
    <circle cx="13" cy="4" r="1.5" />
    <circle cx="13" cy="12" r="1.5" />
    <path d="m7 6.8 4.5-2M7 9.2l4.5 2" />
  </svg>
);
const DocEmptyIcon = () => (
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
    <path d="M30 6v10h10M16 22h16M16 30h12" />
  </svg>
);

function NameCell({ doc }: { doc: DocRow }) {
  return (
    <div className="gs-doc-cell">
      <div className="gs-doc-icon">
        <DocFileIcon />
      </div>
      <div className="col" style={{ minWidth: 0 }}>
        <div className="gs-doc-title truncate">{doc.name}</div>
        <div className="gs-doc-sub">
          {doc.page_count}p · {formatSize(doc.size_bytes ?? 0)}
          {!doc.is_owner && doc.owner_name && ` · ${doc.owner_name}`}
        </div>
      </div>
    </div>
  );
}

function SignerStackCell({ doc }: { doc: DocRow }) {
  const shareCount = doc.share_count ?? 0;
  if (shareCount <= 0) return <span className="t-caption">—</span>;
  return (
    <div className="gs-avatar-stack">
      {Array.from({ length: Math.min(shareCount, 4) }, (_, i) => (
        <Avatar
          key={i}
          name={String(i + 1)}
          color={`hsl(${i * 60 + 200},55%,45%)`}
          size="sm"
          style={{ border: '2px solid var(--color-surface)' }}
        />
      ))}
      {shareCount > 4 && (
        <Avatar
          name={`+${shareCount - 4}`}
          size="sm"
          color="var(--color-bg-muted)"
          style={{ color: 'var(--color-text-secondary)' }}
        />
      )}
    </div>
  );
}

interface ActionsCellProps {
  doc: DocRow;
  onAccept: (id: DocRow['id']) => void;
  onDecline: (id: DocRow['id']) => void;
  onShare: (doc: DocRow) => void;
  onDelete: (id: DocRow['id']) => void;
}

function ActionsCell({ doc, onAccept, onDecline, onShare, onDelete }: ActionsCellProps) {
  const isPending = !doc.is_owner && doc.invite_status === 'pending';
  if (isPending) {
    return (
      <>
        <button className="btn btn-primary btn-sm" onClick={() => onAccept(doc.id)}>
          수락
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => onDecline(doc.id)}>
          거절
        </button>
      </>
    );
  }
  if (!doc.is_owner) return null;
  return (
    <>
      <button className="icon-btn" onClick={() => onShare(doc)} title="참여자 관리">
        <ShareIcon />
      </button>
      <button
        className="icon-btn"
        onClick={() => onDelete(doc.id)}
        title="삭제"
        style={{ color: 'var(--color-danger)' }}
      >
        <TrashIcon size={14} />
      </button>
    </>
  );
}

// ─── DocTable ─────────────────────────────────────────────
interface DocTableProps {
  docs: DocRow[];
  onOpen: (id: DocRow['id']) => void;
  onShare: (doc: DocRow) => void;
  onDelete: (id: DocRow['id']) => void;
  onAccept: (id: DocRow['id']) => void;
  onDecline: (id: DocRow['id']) => void;
  onComplete?: (id: DocRow['id']) => void;
  emptyMessage?: string;
}

export default function DocTable({
  docs,
  onOpen,
  onShare,
  onDelete,
  onAccept,
  onDecline,
  onComplete,
  emptyMessage,
}: DocTableProps) {
  const columns: Column<DocRow>[] = [
    {
      key: 'name',
      header: '문서',
      width: 'minmax(0, 2.4fr)',
      render: (doc) => <NameCell doc={doc} />,
    },
    {
      key: 'signers',
      header: '서명자',
      width: 'minmax(0, 1.2fr)',
      render: (doc) => <SignerStackCell doc={doc} />,
    },
    {
      key: 'progress',
      header: '진행률',
      width: 'minmax(0, 1fr)',
      render: (doc) => {
        const shareCount = doc.share_count ?? 0;
        const doneCount = doc.completed_count ?? 0;
        const percent =
          shareCount > 0
            ? doneCount / shareCount
            : doc.my_signing_status === 'completed'
              ? 1
              : 0;
        return <ProgressBar percent={percent} captionRight showText />;
      },
    },
    {
      key: 'status',
      header: '상태',
      width: 'minmax(0, 1.2fr)',
      render: (doc) => <StatusBadge {...getStatusProps(doc)} />,
    },
    {
      key: 'updated',
      header: '업데이트',
      width: '100px',
      className: 't-caption',
      render: (doc) => (
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {formatRelativeDate(doc.updated_at ?? null)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      align: 'end',
      stopPropagation: true,
      render: (doc) => (
        <ActionsCell
          doc={doc}
          onAccept={onAccept}
          onDecline={onDecline}
          onShare={onShare}
          onDelete={onDelete}
        />
      ),
    },
  ];

  const handleRowClick = (doc: DocRow) => {
    const isPending = !doc.is_owner && doc.invite_status === 'pending';
    const isDeclined = !doc.is_owner && doc.invite_status === 'declined';
    if (isPending || isDeclined) return;
    if (doc.status === 'completed' && onComplete) return onComplete(doc.id);
    onOpen(doc.id);
  };

  return (
    <ListTable<DocRow>
      columns={columns}
      rows={docs}
      rowKey={(doc) => doc.id}
      onRowClick={handleRowClick}
      rowStyle={(doc) => {
        const isDeclined = !doc.is_owner && doc.invite_status === 'declined';
        const isPending = !doc.is_owner && doc.invite_status === 'pending';
        return {
          opacity: isDeclined ? 0.55 : 1,
          cursor: isPending || isDeclined ? 'default' : 'pointer',
        };
      }}
      empty={
        <EmptyState
          icon={<DocEmptyIcon />}
          title="문서가 없습니다"
          description={emptyMessage}
        />
      }
    />
  );
}
