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
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RowContextMenu, type RowContextMenuItem } from "@/components/shared/row-context-menu";

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
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

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
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-4 py-3 text-left text-[11px] font-mono font-semibold",
                      "text-muted-foreground uppercase tracking-wider whitespace-nowrap",
                      header.column.getCanSort() && "cursor-pointer select-none"
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <Icon name="arrow-up-down" tone="muted" className="size-3" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`}>
                  {columns.map((_, cIdx) => (
                    <td key={`skeleton-cell-${cIdx}`} className="px-4 py-3.5">
                      <Skeleton className={cn("h-4", cIdx === 0 ? "w-2/3" : "w-1/2")} />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Icon name="layers" tone="muted" className="size-8 opacity-40" />
                    <span className="font-medium font-sans">No records found</span>
                    {globalFilter && (
                      <span className="text-xs text-muted-foreground/70 font-sans">
                        No results matching &ldquo;{globalFilter}&rdquo;
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const highlight = highlightRow?.(row.original);
                const contextItems = getRowContextMenu?.(row.original) ?? [];
                const tr = (
                  <tr
                    key={row.id}
                    className={cn(
                      "transition-colors duration-150",
                      onRowClick && "cursor-pointer hover:bg-secondary",
                      highlight
                    )}
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3 text-sm text-foreground font-mono tabular-nums"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
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
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 text-xs font-mono text-muted-foreground bg-secondary rounded border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 text-xs font-mono text-muted-foreground bg-secondary rounded border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
