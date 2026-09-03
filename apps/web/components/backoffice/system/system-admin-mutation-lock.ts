import {
  createSynchronousActionLock,
  type SynchronousActionLock,
} from '@/lib/synchronous-action-lock';

const SYSTEM_ADMIN_MUTATION = 'system-admin-mutation' as const;

export type SystemAdminMutationLock = SynchronousActionLock<typeof SYSTEM_ADMIN_MUTATION>;

export function createSystemAdminMutationLock(): SystemAdminMutationLock {
  return createSynchronousActionLock<typeof SYSTEM_ADMIN_MUTATION>();
}

export function runSystemAdminMutation(
  lock: SystemAdminMutationLock,
  work: () => Promise<void>,
): Promise<void> {
  return lock.run(SYSTEM_ADMIN_MUTATION, work);
}
