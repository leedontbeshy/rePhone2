import { describe, expect, it } from 'vitest';
import {
  isCurrentQueueRequest,
  queuePageWithinTotal,
  queueReadPresentation,
} from './queue-read-model';

describe('authoritative operations queue reads', () => {
  it('rejects a late response after a newer queue request starts', async () => {
    let latestRequest = 0;
    const applied: string[] = [];
    const firstRequest = ++latestRequest;
    const first = deferred('first');
    const secondRequest = ++latestRequest;
    const second = deferred('second');

    second.resolve();
    await second.promise;
    if (isCurrentQueueRequest(secondRequest, latestRequest)) applied.push('second');
    first.resolve();
    await first.promise;
    if (isCurrentQueueRequest(firstRequest, latestRequest)) applied.push('first');

    expect(applied).toEqual(['second']);
  });

  it('labels retained rows according to whether the failed read changed query', () => {
    expect(queueReadPresentation(false, 'Lỗi tải', 'status=NEW', 'status=OLD')).toEqual({
      initialLoading: false,
      retainedSnapshotNotice: 'Danh sách bên dưới vẫn là kết quả của bộ lọc hoặc trang trước đó.',
      updating: false,
    });
    expect(queueReadPresentation(false, 'Lỗi tải', 'status=NEW', 'status=NEW')).toMatchObject({
      retainedSnapshotNotice:
        'Danh sách bên dưới là dữ liệu đã tải gần nhất và có thể chưa phải mới nhất.',
    });
    expect(queueReadPresentation(false, 'Lỗi tải', 'status=NEW', null)).toMatchObject({
      retainedSnapshotNotice: null,
    });
  });

  it('keeps a loaded snapshot visible during local refresh instead of restoring a skeleton', () => {
    expect(queueReadPresentation(true, null, 'page=2', 'page=1')).toEqual({
      initialLoading: false,
      retainedSnapshotNotice: null,
      updating: true,
    });
    expect(queueReadPresentation(true, null, 'page=1', null)).toMatchObject({
      initialLoading: true,
      updating: false,
    });
  });

  it('clamps an out-of-range page to the latest authoritative total', () => {
    expect(queuePageWithinTotal(8, 3)).toBe(3);
    expect(queuePageWithinTotal(2, 0)).toBe(1);
    expect(queuePageWithinTotal(Number.NaN, 4)).toBe(1);
  });
});

function deferred(value: string) {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve, value };
}
