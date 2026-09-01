export interface QueueReadPresentation {
  readonly initialLoading: boolean;
  readonly retainedSnapshotNotice: string | null;
  readonly updating: boolean;
}

export function focusQueueReadError(target: Pick<HTMLElement, 'focus'> | null): void {
  target?.focus({ preventScroll: true });
}

export function queuePageWithinTotal(page: number, totalPages: number): number {
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const normalizedTotalPages = Number.isFinite(totalPages)
    ? Math.max(1, Math.trunc(totalPages))
    : 1;
  return Math.min(normalizedPage, normalizedTotalPages);
}

export function isCurrentQueueRequest(request: number, latestRequest: number): boolean {
  return request === latestRequest;
}

export function queueReadPresentation(
  loading: boolean,
  error: string | null,
  currentQueryKey: string,
  loadedQueryKey: string | null,
): QueueReadPresentation {
  const hasSnapshot = loadedQueryKey !== null;
  return {
    initialLoading: loading && !hasSnapshot,
    updating: loading && hasSnapshot,
    retainedSnapshotNotice:
      error === null || !hasSnapshot
        ? null
        : loadedQueryKey === currentQueryKey
          ? 'Danh sách bên dưới là dữ liệu đã tải gần nhất và có thể chưa phải mới nhất.'
          : 'Danh sách bên dưới vẫn là kết quả của bộ lọc hoặc trang trước đó.',
  };
}
