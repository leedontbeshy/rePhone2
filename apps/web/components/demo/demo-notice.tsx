'use client';

import { useEffect, useState } from 'react';
import styles from './demo.module.css';

export function DemoNotice() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'waiting' | 'ready' | 'offline'>('waiting');
  useEffect(() => {
    const controller = new AbortController();
    const deadline = Date.now() + 90_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function probe() {
      try {
        const response = await fetch('/health/ready', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        const body = (await response.json()) as { status?: string };
        if (response.ok && body.status === 'ok') {
          setState('ready');
          return;
        }
      } catch {
        /* A sleeping free instance is expected. */
      }
      if (controller.signal.aborted) return;
      if (Date.now() >= deadline) setState('offline');
      else
        timer = setTimeout(() => {
          void probe();
        }, 3_000);
    }
    void probe();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [attempt]);
  return (
    <aside className={styles.notice} aria-label="Thông tin bản demo">
      <strong>DEMO — Chỉ thử nghiệm, không thanh toán hoặc giao hàng thật.</strong>
      <span>Email và tác vụ nền đang tắt. Vui lòng dùng thông tin giả để kiểm thử.</span>
      {state === 'waiting' ? (
        <span role="status">
          API có thể đang thức dậy trên gói free, vui lòng chờ tối đa 90 giây.
        </span>
      ) : null}
      {state === 'offline' ? (
        <span role="status">
          API chưa sẵn sàng.{' '}
          <button
            type="button"
            onClick={() => {
              setState('waiting');
              setAttempt((value) => value + 1);
            }}
          >
            Kiểm tra lại
          </button>
        </span>
      ) : null}
    </aside>
  );
}
