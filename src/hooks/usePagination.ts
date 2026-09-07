import { useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;

/**
 * Client-side pagination over an already filtered and sorted list.
 */
export function usePagination<T>(
  items: T[],
  initialPageSize: number = DEFAULT_PAGE_SIZE
) {
  const [requestedPage, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const total = items.length;

  const totalPages = useMemo(
    () => (total <= 0 ? 1 : Math.max(1, Math.ceil(total / pageSize))),
    [total, pageSize]
  );

  // Clamped during render rather than corrected in an effect, so a list that
  // shrinks under the current page (a filter change, a resolved request) never
  // renders an empty page first.
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [items, page, pageSize]
  );

  const setPageSize = (next: number) => {
    const size = Number(next);
    if (!Number.isFinite(size) || size < 1) return;

    setPageSizeState(size);
    setPage(1);
  };

  return { page, setPage, pageSize, setPageSize, total, totalPages, pageItems };
}
