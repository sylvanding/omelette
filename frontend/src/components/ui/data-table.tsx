import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Pagination } from "./pagination"
import { Skeleton } from "./skeleton"

export interface DataTableColumn<T> {
  id: string
  header: string
  accessorKey?: keyof T & string
  accessorFn?: (row: T) => React.ReactNode
  cell?: (props: { row: T; value: unknown }) => React.ReactNode
  sortable?: boolean
  width?: number | string
  className?: string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  getRowId: (row: T) => string | number
  isLoading?: boolean
  pagination?: { page: number; pageSize: number; total: number }
  onPaginationChange?: (page: number, pageSize: number) => void
  onRowClick?: (row: T) => void
  sortBy?: string
  sortOrder?: "asc" | "desc"
  onSort?: (columnId: string) => void
  selectedRows?: Set<string | number>
  onSelectionChange?: (selected: Set<string | number>) => void
  emptyMessage?: string
  className?: string
  /** When provided, adds an expand column and renders expanded content below each row */
  expandedRowId?: string | number | null
  onExpandChange?: (rowId: string | number | null) => void
  expandableRowRender?: (row: T) => React.ReactNode
}

function DataTable<T>({
  columns,
  data,
  getRowId,
  isLoading = false,
  pagination,
  onPaginationChange,
  onRowClick,
  sortBy,
  sortOrder,
  onSort,
  selectedRows,
  onSelectionChange,
  emptyMessage = "No data",
  className,
  expandedRowId,
  onExpandChange,
  expandableRowRender,
}: DataTableProps<T>) {
  const hasSelection = !!onSelectionChange
  const hasExpandable = !!expandableRowRender && !!onExpandChange
  const allSelected =
    hasSelection && data.length > 0 && data.every((row) => selectedRows?.has(getRowId(row)))

  function toggleAll() {
    if (!onSelectionChange) return
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(data.map(getRowId)))
    }
  }

  function toggleRow(id: string | number) {
    if (!onSelectionChange || !selectedRows) return
    const next = new Set(selectedRows)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onSelectionChange(next)
  }

  function getCellValue(row: T, col: DataTableColumn<T>): unknown {
    if (col.accessorFn) return col.accessorFn(row)
    if (col.accessorKey) return (row as Record<string, unknown>)[col.accessorKey]
    return null
  }

  function renderCell(row: T, col: DataTableColumn<T>) {
    const value = getCellValue(row, col)
    if (col.cell) return col.cell({ row, value })
    if (value === null || value === undefined) return "—"
    return String(value)
  }

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {hasExpandable && (
                <th className="w-10 px-3 py-3" aria-label="Expand" />
              )}
              {hasSelection && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-input accent-primary"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    "px-4 py-3 text-left font-medium text-muted-foreground",
                    col.sortable && "cursor-pointer select-none hover:text-foreground",
                    col.className
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable && onSort ? () => onSort(col.id) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortBy === col.id && (
                      <span className="text-primary">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasSelection ? 1 : 0) + (hasExpandable ? 1 : 0)}
                  className="py-12 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.flatMap((row) => {
                const rowId = getRowId(row)
                const isSelected = selectedRows?.has(rowId)
                const isExpanded = expandedRowId === rowId
                return [
                  <tr
                    key={rowId}
                    className={cn(
                      "border-b transition-colors hover:bg-muted/30",
                      isSelected && "bg-primary/5",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {hasExpandable && (
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onExpandChange?.(isExpanded ? null : rowId)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      </td>
                    )}
                    {hasSelection && (
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(rowId)}
                          className="rounded border-input accent-primary"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.id} className={cn("px-4 py-3", col.className)}>
                        {renderCell(row, col)}
                      </td>
                    ))}
                  </tr>,
                  ...(isExpanded && expandableRowRender
                    ? [
                        <tr key={`${rowId}-expanded`} className="bg-muted/20">
                          <td
                            colSpan={columns.length + (hasSelection ? 1 : 0) + (hasExpandable ? 1 : 0)}
                            className="px-4 py-4"
                          >
                            {expandableRowRender(row)}
                          </td>
                        </tr>,
                      ]
                    : []),
                ]
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && onPaginationChange && (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={(p) => onPaginationChange(p, pagination.pageSize)}
          onPageSizeChange={(ps) => onPaginationChange(1, ps)}
        />
      )}
    </div>
  )
}

export { DataTable }
export type { DataTableProps }
