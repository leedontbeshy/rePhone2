import { describe, expect, it, vi } from 'vitest';
import { AfterSalesCommandError, type AfterSalesDetail } from '@/lib/after-sales-backoffice-api';
import { executeAfterSalesCommand } from './after-sales-command-runner';

describe('executeAfterSalesCommand', () => {
  it('reloads authoritative detail after a concurrent command conflict', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const conflict = new AfterSalesCommandError(
      'Hồ sơ vừa được xử lý ở phiên khác. Hãy tải lại.',
      'CONCURRENT_MODIFICATION',
    );

    const result = await executeAfterSalesCommand(
      vi.fn().mockRejectedValue(conflict),
      reload,
      'Không thể cập nhật hồ sơ.',
    );

    expect(reload).toHaveBeenCalledOnce();
    expect(result).toEqual({ detail: null, error: conflict.message });
  });

  it('does not reload for ordinary validation errors', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const result = await executeAfterSalesCommand(
      vi.fn().mockRejectedValue(new Error('Ghi chú chưa hợp lệ.')),
      reload,
      'Không thể cập nhật hồ sơ.',
    );

    expect(reload).not.toHaveBeenCalled();
    expect(result).toEqual({ detail: null, error: 'Ghi chú chưa hợp lệ.' });
  });

  it('returns the fresh command projection on success', async () => {
    const detail = { id: 'case-1' } as AfterSalesDetail;
    const result = await executeAfterSalesCommand(
      vi.fn().mockResolvedValue(detail),
      vi.fn(),
      'Không thể cập nhật hồ sơ.',
    );

    expect(result).toEqual({ detail, error: null });
  });
});
