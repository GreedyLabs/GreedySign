/**
 * DocTable — reusable document list table.
 * Handles both owner-view and shared-view rows.
 */
import Avatar from './ui/Avatar';
import EmptyState from './ui/EmptyState';

// ─── Helpers ─────────────────────────────────────────────
const STATUS_MAP = {
  // doc.status 기반 (소유자 뷰)
  doc_draft: { label: '초안', cls: 'badge-neutral' },
  doc_in_progress: { label: '서명 진행중', cls: 'badge-primary' },
  doc_completed: { label: '✓ 서명 완료', cls: 'badge-success' },
  doc_voided: { label: '무효화됨', cls: 'badge-danger' },
  // 참여자 뷰
  pending: { label: '초대 대기', cls: 'badge-neutral' },
  not_started: { label: '서명 대기', cls: 'badge-warning' },
  in_progress: { label: '서명 진행중', cls: 'badge-primary' },
  completed: { label: '✓ 서명 완료', cls: 'badge-success' },
  declined: { label: '거부됨', cls: 'badge-danger' },
};

function getStatus(doc) {
  if (doc.is_owner) {
    return STATUS_MAP[`doc_${doc.status}`] ?? STATUS_MAP.doc_in_progress;
  }
  // 참여자 뷰
  if (doc.invite_status === 'declined') return STATUS_MAP.declined;
  if (doc.invite_status === 'pending') return STATUS_MAP.pending;
  return STATUS_MAP[doc.my_signing_status] ?? STATUS_MAP.not_started;
}

export const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export const formatDate = (s) => {
  const d = new Date(s),
    diff = (Date.now() - d) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 172800) return '어제';
  return d.toLocaleDateString('ko-KR');
};

// ─── Icons ────────────────────────────────────────────────
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
const TrashIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10" />
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

// ─── DocRow ───────────────────────────────────────────────
function DocRow({ doc, onOpen, onShare, onDelete, onAccept, onDecline }) {
  const st = getStatus(doc);
  const isPending = !doc.is_owner && doc.invite_status === 'pending';
  const isDeclined = !doc.is_owner && doc.invite_status === 'declined';
  const shareCount = doc.share_count ?? 0;
  const doneCount = doc.completed_count ?? 0;
  const progress =
    shareCount > 0 ? doneCount / shareCount : doc.my_signing_status === 'completed' ? 1 : 0;

  return (
    <div
      className="gs-table-row"
      style={{
        opacity: isDeclined ? 0.55 : 1,
        cursor: isPending || isDeclined ? 'default' : 'pointer',
      }}
      onClick={() => !isPending && !isDeclined && onOpen(doc.id)}
    >
      {/* 문서명 */}
      <div className="gs-doc-cell">
        <div className="gs-doc-icon">
          <DocFileIcon />
        </div>
        <div className="col" style={{ minWidth: 0 }}>
          <div className="gs-doc-title truncate">{doc.name}</div>
          <div className="gs-doc-sub">
            {doc.page_count}p · {formatSize(doc.size_bytes)}
            {!doc.is_owner && doc.owner_name && ` · ${doc.owner_name}`}
          </div>
        </div>
      </div>

      {/* 서명자 아바타 */}
      <div className="gs-avatar-stack">
        {shareCount > 0 ? (
          <>
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
          </>
        ) : (
          <span className="t-caption">—</span>
        )}
      </div>

      {/* 진행률 */}
      <div className="gs-progress">
        <div className="gs-progress-track">
          <div
            className={`gs-progress-fill${progress >= 1 ? ' is-complete' : ''}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className="t-num" style={{ minWidth: 32, textAlign: 'right', fontSize: 12 }}>
          {Math.round(progress * 100)}%
        </span>
      </div>

      {/* 상태 */}
      <div>
        <span className={`badge badge-dot ${st.cls}`}>{st.label}</span>
      </div>

      {/* 업데이트 */}
      <div className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>
        {formatDate(doc.updated_at)}
      </div>

      {/* 액션 — CSS가 flex + justify-end 처리 */}
      <div onClick={(e) => e.stopPropagation()}>
        {isPending ? (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => onAccept(doc.id)}>
              수락
            </button>
            <button className="btn btn-danger  btn-sm" onClick={() => onDecline(doc.id)}>
              거절
            </button>
          </>
        ) : (
          <>
            {doc.is_owner && (
              <button className="icon-btn" onClick={() => onShare(doc)} title="참여자 관리">
                <ShareIcon />
              </button>
            )}
            {doc.is_owner && (
              <button
                className="icon-btn"
                onClick={() => onDelete(doc.id)}
                title="삭제"
                style={{ color: 'var(--color-danger)' }}
              >
                <TrashIcon />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── DocTable ─────────────────────────────────────────────
export default function DocTable({
  docs,
  onOpen,
  onShare,
  onDelete,
  onAccept,
  onDecline,
  onComplete,
  emptyMessage,
}) {
  return (
    <div className="gs-table">
      <div className="gs-table-head">
        <div>문서</div>
        <div>서명자</div>
        <div>진행률</div>
        <div>상태</div>
        <div>업데이트</div>
        <div />
      </div>

      {docs.length === 0 ? (
        <EmptyState icon={<DocEmptyIcon />} title="문서가 없습니다" description={emptyMessage} />
      ) : (
        docs.map((doc) => (
          <DocRow
            key={doc.id}
            doc={doc}
            onOpen={doc.status === 'completed' ? (id) => onComplete?.(id) ?? onOpen(id) : onOpen}
            onShare={onShare}
            onDelete={onDelete}
            onAccept={onAccept}
            onDecline={onDecline}
          />
        ))
      )}
    </div>
  );
}
