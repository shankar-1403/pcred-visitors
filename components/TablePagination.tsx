"use client";

import { useTheme } from "@/src/context/ThemeContext";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface TablePaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

/** Footer bar for data tables: range text, page size, prev/next. */
export default function TablePagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const { theme } = useTheme();
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-navy-500/10 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-surface-dark-card">
      <p className="tabular-nums text-stone-500 dark:text-white/50">
        Showing <span className="font-medium text-navy-500 dark:text-white">{start}</span>–
        <span className="font-medium text-navy-500 dark:text-white">{end}</span> of{" "}
        <span className="font-medium text-navy-500 dark:text-white">{totalItems}</span>
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-stone-500 dark:text-white/50">
            <span className="text-xs">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{ colorScheme: theme }}
              className="min-h-11 cursor-pointer rounded-lg border border-navy-500/20 bg-white px-2 text-sm text-navy-500 dark:border-white/15 dark:bg-surface-dark-raised dark:text-white"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="min-h-11 cursor-pointer rounded-lg border border-navy-500/20 px-3 text-sm text-navy-500 transition-colors hover:bg-navy-500/6 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="min-h-11 cursor-pointer rounded-lg border border-navy-500/20 px-3 text-sm text-navy-500 transition-colors hover:bg-navy-500/6 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
