export const BACKOFFICE_TASKS_CHANGED = 'rephone:backoffice-tasks-changed';

/** Used by the authenticated client, including requests replayed after a token refresh. */
export const fetchWithBackofficeTaskUpdates: typeof globalThis.fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = input instanceof Request ? input.url : String(input);
  if (
    typeof window !== 'undefined' &&
    response.ok &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
    new URL(url, window.location.origin).pathname.startsWith('/api/v1/backoffice/')
  ) {
    window.dispatchEvent(new Event(BACKOFFICE_TASKS_CHANGED));
  }
  return response;
};
