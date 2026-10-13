import type { components, createApiClient } from '@rephone/api-client';
import { BACKOFFICE_TASKS_CHANGED } from './backoffice-task-events';

export type PendingTaskCounts = components['schemas']['PendingTaskCountsDto'];

export async function getBackofficePendingTasks(
  client: ReturnType<typeof createApiClient>,
  signal: AbortSignal,
): Promise<PendingTaskCounts> {
  const result = await client.GET('/api/v1/backoffice/overview/pending-tasks', {
    cache: 'no-store',
    signal,
  });
  if (result.data === undefined) throw new Error('Không thể tải số việc chờ xử lý.');
  return result.data.data.counts;
}

/** One poller per backoffice layout; requests are cancelled on navigation or account changes. */
export function watchBackofficePendingTasks(
  load: (signal: AbortSignal) => Promise<PendingTaskCounts>,
  publish: (counts: PendingTaskCounts | null) => void,
): () => void {
  let disposed = false;
  const isActive = () => !disposed;
  let activeRequest: AbortController | undefined;
  let queued = false;
  let mutationTimer: ReturnType<typeof setTimeout> | undefined;

  async function refresh() {
    if (!isActive() || document.visibilityState === 'hidden') return;
    if (activeRequest !== undefined) {
      queued = true;
      return;
    }
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10_000);
    try {
      const counts = await load(controller.signal);
      if (isActive() && !queued) publish(counts);
    } catch {
      // An unavailable count must not look like a verified zero or a current stale count.
      if (isActive()) publish(null);
    } finally {
      clearTimeout(timeout);
      activeRequest = undefined;
      if (queued && isActive()) {
        queued = false;
        void refresh();
      }
    }
  }

  const onVisible = () => void refresh();
  const onMutation = () => {
    if (activeRequest !== undefined) {
      queued = true;
      return;
    }
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => void refresh(), 150);
  };
  const interval = setInterval(onVisible, 30_000);
  window.addEventListener('focus', onVisible);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(BACKOFFICE_TASKS_CHANGED, onMutation);
  void refresh();

  return () => {
    disposed = true;
    clearInterval(interval);
    clearTimeout(mutationTimer);
    activeRequest?.abort();
    window.removeEventListener('focus', onVisible);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener(BACKOFFICE_TASKS_CHANGED, onMutation);
  };
}
