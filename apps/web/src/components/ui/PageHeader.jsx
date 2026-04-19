/**
 * PageHeader — consistent page-level title block.
 *
 * <PageHeader title="내 문서" subtitle="총 12개">
 *   <button>새 문서</button>   ← optional action slot (right side)
 * </PageHeader>
 */
export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="gs-page-header">
      <div>
        <h1 className="gs-page-title">{title}</h1>
        {subtitle && <p className="gs-page-desc">{subtitle}</p>}
      </div>
      {children && <div className="row gap-2">{children}</div>}
    </div>
  );
}
