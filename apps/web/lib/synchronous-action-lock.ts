export interface SynchronousActionLock<TKey> {
  run: (key: TKey, work: () => Promise<void>) => Promise<void>;
}

export function createSynchronousActionLock<TKey>(): SynchronousActionLock<TKey> {
  const active = new Set<TKey>();
  return {
    async run(key, work) {
      if (active.has(key)) return;
      active.add(key);
      try {
        await work();
      } finally {
        active.delete(key);
      }
    },
  };
}
