/**
 * ListTable — shared grid-based list table built on .gs-table / .gs-table-row.
 *
 * Consolidates three previously divergent list UIs (documents, templates,
 * campaigns) into one primitive with column-driven rendering.
 *
 * Usage:
 *   <ListTable<Doc>
 *     columns={[
 *       { key: 'name', header: '이름', render: r => r.name },
 *       ...
 *     ]}
 *     rows={items}
 *     rowKey={r => r.id}
 *   />
 */
import type { CSSProperties, ReactNode } from 'react';

export type ColumnAlign = 'start' | 'end' | 'center';

export interface Column<Row> {
  key: string;
  header?: ReactNode;
  /** CSS grid-template-columns 값. 기본 'minmax(0, 1fr)'. */
  width?: string;
  render: (row: Row) => ReactNode;
  align?: ColumnAlign;
  className?: string;
  /** true 면 셀 내부 클릭이 row onClick 으로 버블하지 않는다. */
  stopPropagation?: boolean;
  /** 셀 내부 flex gap. */
  gap?: number | string;
}

interface ListTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey?: (row: Row) => string | number;
  onRowClick?: (row: Row) => void;
  rowClassName?: string | ((row: Row) => string | undefined);
  rowStyle?: CSSProperties | ((row: Row) => CSSProperties | undefined);
  empty?: ReactNode;
  className?: string;
}

function buildTemplate<Row>(columns: Column<Row>[]): string {
  return columns.map((c) => c.width ?? 'minmax(0, 1fr)').join(' ');
}

const JUSTIFY: Record<ColumnAlign, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
};

function Cell<Row>({ col, row }: { col: Column<Row>; row: Row }) {
  const align: ColumnAlign = col.align ?? 'start';
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: JUSTIFY[align],
    minWidth: 0,
    gap: col.gap ?? (align === 'end' ? 2 : undefined),
  };
  const handlers = col.stopPropagation
    ? { onClick: (e: React.MouseEvent) => e.stopPropagation() }
    : undefined;
  return (
    <div className={col.className || undefined} style={style} {...handlers}>
      {col.render(row)}
    </div>
  );
}

export default function ListTable<Row extends { id?: string | number }>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  rowStyle,
  empty,
  className = '',
}: ListTableProps<Row>) {
  const gridTemplateColumns = buildTemplate(columns);

  return (
    <div className={`gs-table ${className}`.trim()}>
      <div className="gs-table-head" style={{ gridTemplateColumns }}>
        {columns.map((col) => (
          <div
            key={col.key}
            style={
              col.align && col.align !== 'start'
                ? { textAlign: col.align === 'end' ? 'right' : 'center' }
                : undefined
            }
          >
            {col.header ?? ''}
          </div>
        ))}
      </div>

      {rows.length === 0
        ? empty
        : rows.map((row) => {
            const extraStyle =
              typeof rowStyle === 'function' ? rowStyle(row) : rowStyle;
            const extraClass =
              typeof rowClassName === 'function' ? rowClassName(row) : rowClassName;
            const key = rowKey
              ? rowKey(row)
              : (row.id ?? JSON.stringify(row));
            return (
              <div
                key={key}
                className={`gs-table-row ${extraClass || ''}`.trim()}
                style={{
                  gridTemplateColumns,
                  cursor: onRowClick ? 'pointer' : undefined,
                  ...(extraStyle || {}),
                }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <Cell key={col.key} col={col} row={row} />
                ))}
              </div>
            );
          })}
    </div>
  );
}
