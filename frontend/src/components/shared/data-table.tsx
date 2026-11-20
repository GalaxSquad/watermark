import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RowContextMenu, type RowContextMenuItem } from "@/components/shared/row-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { useDensity } from "@/hooks/use-density";

/** Column meta supported by DataTable. Set `meta: { align: "right" }` on
 *  numeric columns (partitions, size, lag, offsets…) — numbers are
 *  right-aligned with tabular figures so magnitudes compare down a column.
 *  See DESIGN.md §4. */
export type DataTableColumnMeta = { align?: "left" | "right" | "center" };

function columnAlign(column: { columnDef: ColumnDef<unknown, unknown> }): "left" | "right" | "center" {
  const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
  return meta?.align ?? "left";
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  onRowClick?: (row: T) => void;
  highlightRow?: (row: T) => string | undefined;
  globalFilter?: string;
  pageSize?: number;
  className?: string;
  getRowContextMenu?: (row: T) => RowContextMenuItem[];
  isLoading?: boolean;
  /** Custom empty state (defaults to a generic EmptyState). Rendered
   *  inside the table when there are no rows and not loading. */
  emptyState?: ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  highlightRow,
  globalFilter,
  pageSize = 50,
  className,
  getRowContextMenu,
  isLoading = false,
  emptyState,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const { rowHeight, cellPadding } = useDensity();

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className={cn("glass-panel overflow-hidden", className)}>
      <div className="overflow-auto max-h-[calc(100vh-320px)]">
        <table className="w-full">
          {/* No position:sticky — avoids WKWebView text-corruption bug.
              Pagination keeps tables short enough that sticky is unnecessary. */}
          <thead className="bg-card">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const align = columnAlign(header.column as unknown as { columnDef: ColumnDef<unknown, unknown> });
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-4 text-[11px] font-mono font-semibold",
                        "text-muted-foreground uppercase tracking-wider whitespace-nowrap tabular-nums",
                        cellPadding,
                        align === "right" && "text-right",
                        align === "center" && "text-center",
                        header.column.getCanSort() && "cursor-pointer select-none"
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-1",
                          align === "right" && "justify-end",
                          align === "center" && "justify-center"
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <Icon name="arrow-up-down" tone="muted" className="size-3" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`} style={{ height: rowHeight }}>
                  {columns.map((_, cIdx) => (
                    <td key={`skeleton-cell-${cIdx}`} className={cn("px-4", cellPadding)}>
                      <Skeleton className={cn("h-4", cIdx === 0 ? "w-2/3" : "w-1/2")} />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-0">
                  {emptyState ?? (
                    <EmptyState
                      icon="layers"
                      title="No records found"
                      description={
                        globalFilter
                          ? <>No results matching &ldquo;{globalFilter}&rdquo;</>
                          : undefined
                      }
                    />
                  )}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const highlight = highlightRow?.(row.original);
                const contextItems = getRowContextMenu?.(row.original) ?? [];
                const tr = (
                  <tr
                    key={row.id}
                    style={{ height: rowHeight }}
                    className={cn(
                      "transition-colors duration-150",
                      onRowClick && "cursor-pointer hover:bg-secondary",
                      highlight
                    )}
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const align = columnAlign(cell.column as unknown as { columnDef: ColumnDef<unknown, unknown> });
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-4 text-sm text-foreground font-mono tabular-nums",
                            cellPadding,
                            align === "right" && "text-right",
                            align === "center" && "text-center"
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
                return contextItems.length > 0 ? (
                  <RowContextMenu key={row.id} items={contextItems}>
                    {tr}
                  </RowContextMenu>
                ) : tr;
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            Showing {table.getState().pagination.pageIndex * pageSize + 1}-
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * pageSize,
              table.getFilteredRowModel().rows.length
            )}{" "}
            of {table.getFilteredRowModel().rows.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="font-mono text-xs"
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="font-mono text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
