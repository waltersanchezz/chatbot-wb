import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'

export interface DataTableColumn<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyTitle?: string
  emptyDescription?: string
  onRowClick?: (row: T) => void
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = 'Sin datos',
  emptyDescription = 'Cuando haya información, aparecerá aquí.',
  onRowClick,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line text-ink-muted">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-3 font-medium ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={[
                'border-b border-line/80 last:border-0 hover:bg-surface/70',
                onRowClick ? 'cursor-pointer' : '',
              ].join(' ')}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-3 align-middle text-ink ${col.className ?? ''}`}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
