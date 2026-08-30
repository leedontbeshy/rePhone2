import { shouldRefetchAfterSales, type AfterSalesDetail } from '@/lib/after-sales-backoffice-api';

export type AfterSalesCommandResult =
  { detail: AfterSalesDetail; error: null } | { detail: null; error: string };

export async function executeAfterSalesCommand(
  command: () => Promise<AfterSalesDetail>,
  reload: () => Promise<void>,
  fallback: string,
): Promise<AfterSalesCommandResult> {
  try {
    return { detail: await command(), error: null };
  } catch (caught) {
    if (shouldRefetchAfterSales(caught)) {
      try {
        await reload();
      } catch {
        // Keep the original command error when refreshing the authoritative state also fails.
      }
    }
    return {
      detail: null,
      error: caught instanceof Error ? caught.message : fallback,
    };
  }
}
