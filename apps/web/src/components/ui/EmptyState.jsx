/**
 * EmptyState — centred empty-list placeholder.
 *
 * <EmptyState
 *   icon={<DocIcon />}
 *   title="문서가 없습니다"
 *   description="문서를 업로드하여 서명 요청을 시작하세요."
 *   action={<button>새 문서 요청</button>}
 * />
 */
export default function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{ padding: '56px 16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
      {icon && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, opacity: 0.4 }}>
          {icon}
        </div>
      )}
      <p
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          marginBottom: 4,
        }}
      >
        {title}
      </p>
      {description && <p style={{ fontSize: 13, marginBottom: 16 }}>{description}</p>}
      {action}
    </div>
  );
}
