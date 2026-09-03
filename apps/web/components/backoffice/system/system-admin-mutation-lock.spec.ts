import { describe, expect, it, vi } from 'vitest';
import {
  createSystemAdminMutationLock,
  runSystemAdminMutation,
} from './system-admin-mutation-lock';

const CRITICAL_MUTATIONS = [
  'tạo nhân viên',
  'cập nhật nhân viên',
  'gửi lại lời mời nhân viên',
  'đổi trạng thái nhân viên',
  'đổi trạng thái khách hàng',
  'lưu cấu hình cửa hàng',
  'tải ảnh QR chuyển khoản',
] as const;

describe('system admin mutation lock', () => {
  it.each(CRITICAL_MUTATIONS)(
    'chỉ gửi một request khi thao tác %s bị submit lặp trong cùng frame',
    async () => {
      const lock = createSystemAdminMutationLock();
      const response = deferred<undefined>();
      const request = vi.fn(() => response.promise);

      const first = runSystemAdminMutation(lock, request);
      const duplicate = runSystemAdminMutation(lock, request);

      expect(request).toHaveBeenCalledOnce();
      await expect(duplicate).resolves.toBeUndefined();

      response.resolve(undefined);
      await expect(first).resolves.toBeUndefined();

      await expect(runSystemAdminMutation(lock, request)).resolves.toBeUndefined();
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['nhân viên', 'khách hàng', 'cấu hình và QR'] as const)(
    'mở khóa thao tác %s sau khi request lỗi',
    async () => {
      const lock = createSystemAdminMutationLock();
      const response = deferred<undefined>();
      const request = vi
        .fn<() => Promise<void>>()
        .mockImplementationOnce(() => response.promise)
        .mockResolvedValueOnce(undefined);

      const first = runSystemAdminMutation(lock, request);
      const duplicate = runSystemAdminMutation(lock, request);

      expect(request).toHaveBeenCalledOnce();
      response.reject(new Error('provider unavailable'));
      await expect(first).rejects.toThrow('provider unavailable');
      await expect(duplicate).resolves.toBeUndefined();

      await expect(runSystemAdminMutation(lock, request)).resolves.toBeUndefined();
      expect(request).toHaveBeenCalledTimes(2);
    },
  );
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}
