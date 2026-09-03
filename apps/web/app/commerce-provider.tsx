'use client';

import type { components } from '@rephone/api-client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { customerApiError } from '../lib/order-access';
import { useAuth } from './auth-provider';

export type Cart = components['schemas']['CartDto'];
export type CartItem = components['schemas']['CartItemDto'];
type WishlistItem = components['schemas']['WishlistItemDto'];

interface CommerceContextValue {
  cart: Cart | null;
  cartLoading: boolean;
  cartError: string | null;
  mergeError: string | null;
  totalQuantity: number;
  refreshCart: () => Promise<void>;
  retryMerge: () => Promise<void>;
  addIphone: (inventoryCode: string) => Promise<void>;
  addAccessory: (variantId: string, quantity: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  addWishlistIphone: (inventoryCode: string) => Promise<WishlistItem>;
  addWishlistAccessory: (variantId: string) => Promise<WishlistItem>;
}

const CommerceContext = createContext<CommerceContextValue | null>(null);
const CSRF_HEADER = { 'X-Rephone-CSRF': '1' } as const;

export interface SerializedTaskQueue {
  enqueue: <T>(work: () => Promise<T>) => Promise<T>;
  whenIdle: () => Promise<void>;
}

export function createSerializedTaskQueue(startAfter?: Promise<void>): SerializedTaskQueue {
  let tail: Promise<void> = startAfter ?? Promise.resolve();
  return {
    enqueue<T>(work: () => Promise<T>): Promise<T> {
      const pending = tail.then(work, work);
      tail = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    whenIdle() {
      return tail;
    },
  };
}

export function enqueueSessionTask(
  queue: SerializedTaskQueue,
  tracker: SessionRevisionTracker,
  work: (revision: number) => Promise<void>,
): Promise<void> {
  const revision = tracker.capture();
  return queue.enqueue(async () => {
    if (!tracker.isCurrent(revision)) return;
    await work(revision);
  });
}

export interface SessionRevisionTracker {
  capture: () => number;
  isCurrent: (revision: number) => boolean;
  sync: (identity: string) => boolean;
}

export function createSessionRevisionTracker(initialIdentity: string): SessionRevisionTracker {
  let identity = initialIdentity;
  let revision = 0;
  return {
    capture: () => revision,
    isCurrent: (expectedRevision) => revision === expectedRevision,
    sync(nextIdentity) {
      if (nextIdentity === identity) return false;
      identity = nextIdentity;
      revision += 1;
      return true;
    },
  };
}

export function currentSessionValue<T>(
  value: T,
  ownerRevision: number,
  tracker: SessionRevisionTracker,
): T | null {
  return tracker.isCurrent(ownerRevision) ? value : null;
}

export interface KeyedSingleFlight<TKey> {
  clear: () => void;
  run: <T>(key: TKey, work: () => Promise<T>) => Promise<T>;
}

export function createKeyedSingleFlight<TKey>(): KeyedSingleFlight<TKey> {
  let current: { key: TKey; promise: Promise<unknown> } | undefined;
  return {
    clear() {
      current = undefined;
    },
    run<T>(key: TKey, work: () => Promise<T>): Promise<T> {
      if (current !== undefined && Object.is(current.key, key)) {
        return current.promise as Promise<T>;
      }
      const promise = work().finally(() => {
        if (current?.promise === promise) current = undefined;
      });
      current = { key, promise };
      return promise;
    },
  };
}

export function CommerceProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, status, user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const cartOwnerRevision = useRef(0);
  const mergedCustomer = useRef<string | null>(null);
  const sessionIdentity = `${status}:${user?.role ?? 'NONE'}:${user?.id ?? 'NONE'}`;
  const previousSessionIdentity = useRef(sessionIdentity);
  const sessionTracker = useRef<SessionRevisionTracker | null>(null);
  const mutationQueue = useRef<SerializedTaskQueue | null>(null);
  const mergeSingleFlight = useRef<KeyedSingleFlight<number> | null>(null);
  if (sessionTracker.current === null) {
    sessionTracker.current = createSessionRevisionTracker(sessionIdentity);
    mutationQueue.current = createSerializedTaskQueue();
    mergeSingleFlight.current = createKeyedSingleFlight<number>();
  } else if (sessionTracker.current.sync(sessionIdentity)) {
    const priorIdentity = previousSessionIdentity.current;
    const priorQueue = mutationQueue.current;
    const waitForGuestMutations =
      priorIdentity.startsWith('anonymous:') &&
      status === 'authenticated' &&
      user?.role === 'CUSTOMER';
    mutationQueue.current = createSerializedTaskQueue(
      waitForGuestMutations && priorQueue !== null ? priorQueue.whenIdle() : Promise.resolve(),
    );
    mergeSingleFlight.current?.clear();
    mergedCustomer.current = null;
  }
  previousSessionIdentity.current = sessionIdentity;

  const enqueueCartTask = useCallback(
    (work: (revision: number) => Promise<void>): Promise<void> => {
      const tracker = sessionTracker.current;
      const queue = mutationQueue.current;
      if (tracker === null || queue === null)
        return Promise.reject(new Error('Commerce unavailable'));
      return enqueueSessionTask(queue, tracker, work);
    },
    [],
  );

  const isCurrentSession = useCallback(
    (revision: number) => sessionTracker.current?.isCurrent(revision) === true,
    [],
  );

  const refreshCart = useCallback(async () => {
    if (status === 'loading') return;
    if (status === 'authenticated' && user?.role !== 'CUSTOMER') {
      setCart(null);
      setCartLoading(false);
      return;
    }
    setCartLoading(true);
    await enqueueCartTask(async (revision) => {
      try {
        const result = await client.GET('/api/v1/cart');
        if (!isCurrentSession(revision)) return;
        if (result.data === undefined) {
          setCartError(errorMessage(result.error, 'Không thể tải giỏ hàng.'));
          return;
        }
        cartOwnerRevision.current = revision;
        setCart(result.data.data);
        setCartError(null);
      } catch {
        if (isCurrentSession(revision)) {
          setCartError('Không thể kết nối để tải giỏ hàng. Vui lòng thử lại.');
        }
      } finally {
        if (isCurrentSession(revision)) setCartLoading(false);
      }
    });
  }, [client, enqueueCartTask, isCurrentSession, status, user?.role]);

  const merge = useCallback(async () => {
    if (status !== 'authenticated' || user?.role !== 'CUSTOMER') return;
    const customerId = user.id;
    const tracker = sessionTracker.current;
    const singleFlight = mergeSingleFlight.current;
    if (tracker === null || singleFlight === null) return;
    const revision = tracker.capture();
    return singleFlight.run(revision, () =>
      enqueueCartTask(async (queuedRevision) => {
        let result;
        try {
          result = await client.POST('/api/v1/cart/merge', {});
        } catch {
          const message = 'Không thể cập nhật giỏ hàng. Vui lòng thử lại.';
          if (isCurrentSession(queuedRevision)) setMergeError(message);
          throw new Error(message);
        }
        if (!isCurrentSession(queuedRevision)) return;
        if (result.data === undefined) {
          const message = errorMessage(
            result.error,
            'Không thể cập nhật giỏ hàng sau khi đăng nhập.',
          );
          setMergeError(message);
          throw new Error(message);
        }
        cartOwnerRevision.current = queuedRevision;
        setCart(result.data.data);
        setCartError(null);
        setMergeError(null);
        mergedCustomer.current = customerId;
      }),
    );
  }, [client, enqueueCartTask, isCurrentSession, status, user?.id, user?.role]);

  useEffect(() => {
    setCart(null);
    setCartError(null);
    setMergeError(null);
    if (status === 'anonymous') {
      void refreshCart();
      return;
    }
    if (status === 'authenticated' && user?.role === 'CUSTOMER') {
      if (mergedCustomer.current === user.id) return;
      const revision = sessionTracker.current?.capture();
      setCartLoading(true);
      void merge()
        .catch(() => undefined)
        .finally(() => {
          if (revision !== undefined && isCurrentSession(revision)) setCartLoading(false);
        });
      return;
    }
    if (status === 'authenticated') {
      setCart(null);
      setCartLoading(false);
    }
  }, [isCurrentSession, merge, refreshCart, sessionIdentity, status, user?.id, user?.role]);

  const addIphone = useCallback(
    (inventoryCode: string) =>
      enqueueCartTask(async (revision) => {
        const result = await client.POST('/api/v1/cart/items', {
          params: { header: CSRF_HEADER },
          body: { itemType: 'IPHONE', inventoryCode },
        });
        if (result.data === undefined) {
          throw new Error(errorMessage(result.error, 'Không thể thêm iPhone vào giỏ hàng.'));
        }
        if (!isCurrentSession(revision)) return;
        cartOwnerRevision.current = revision;
        setCart(result.data.data);
        setCartError(null);
      }),
    [client, enqueueCartTask, isCurrentSession],
  );

  const addAccessory = useCallback(
    (variantId: string, quantity: number) =>
      enqueueCartTask(async (revision) => {
        const result = await client.POST('/api/v1/cart/items', {
          params: { header: CSRF_HEADER },
          body: { itemType: 'ACCESSORY', variantId, quantity },
        });
        if (result.data === undefined) {
          throw new Error(errorMessage(result.error, 'Không thể thêm phụ kiện vào giỏ hàng.'));
        }
        if (!isCurrentSession(revision)) return;
        cartOwnerRevision.current = revision;
        setCart(result.data.data);
        setCartError(null);
      }),
    [client, enqueueCartTask, isCurrentSession],
  );

  const updateQuantity = useCallback(
    (itemId: string, quantity: number) =>
      enqueueCartTask(async (revision) => {
        const result = await client.PATCH('/api/v1/cart/items/{itemId}', {
          params: { path: { itemId }, header: CSRF_HEADER },
          body: { quantity },
        });
        if (result.data === undefined) {
          throw new Error(errorMessage(result.error, 'Không thể cập nhật số lượng.'));
        }
        if (!isCurrentSession(revision)) return;
        cartOwnerRevision.current = revision;
        setCart(result.data.data);
        setCartError(null);
      }),
    [client, enqueueCartTask, isCurrentSession],
  );

  const removeItem = useCallback(
    (itemId: string) =>
      enqueueCartTask(async (revision) => {
        const result = await client.DELETE('/api/v1/cart/items/{itemId}', {
          params: { path: { itemId }, header: CSRF_HEADER },
        });
        if (result.response.status !== 204) {
          throw new Error(errorMessage(result.error, 'Không thể xóa sản phẩm khỏi giỏ hàng.'));
        }
        const refreshed = await client.GET('/api/v1/cart');
        if (!isCurrentSession(revision)) return;
        if (refreshed.data === undefined) {
          setCartError(errorMessage(refreshed.error, 'Không thể tải lại giỏ hàng.'));
          return;
        }
        cartOwnerRevision.current = revision;
        setCart(refreshed.data.data);
        setCartError(null);
      }),
    [client, enqueueCartTask, isCurrentSession],
  );

  const addWishlistIphone = useCallback(
    async (inventoryCode: string) => {
      const result = await client.POST('/api/v1/wishlist/items', {
        body: { itemType: 'IPHONE', inventoryCode },
      });
      if (result.data === undefined) {
        throw new Error(errorMessage(result.error, 'Không thể lưu sản phẩm.'));
      }
      return result.data.data;
    },
    [client],
  );

  const addWishlistAccessory = useCallback(
    async (variantId: string) => {
      const result = await client.POST('/api/v1/wishlist/items', {
        body: { itemType: 'ACCESSORY', variantId },
      });
      if (result.data === undefined) {
        throw new Error(errorMessage(result.error, 'Không thể lưu sản phẩm.'));
      }
      return result.data.data;
    },
    [client],
  );

  const visibleCart = currentSessionValue(cart, cartOwnerRevision.current, sessionTracker.current);
  const totalQuantity = useMemo(
    () => visibleCart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
    [visibleCart],
  );
  const value = useMemo<CommerceContextValue>(
    () => ({
      cart: visibleCart,
      cartLoading,
      cartError,
      mergeError,
      totalQuantity,
      refreshCart,
      retryMerge: merge,
      addIphone,
      addAccessory,
      updateQuantity,
      removeItem,
      addWishlistIphone,
      addWishlistAccessory,
    }),
    [
      addAccessory,
      addIphone,
      addWishlistAccessory,
      addWishlistIphone,
      visibleCart,
      cartError,
      cartLoading,
      merge,
      mergeError,
      refreshCart,
      removeItem,
      totalQuantity,
      updateQuantity,
    ],
  );

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce(): CommerceContextValue {
  const context = useContext(CommerceContext);
  if (context === null) throw new Error('useCommerce must be used inside CommerceProvider');
  return context;
}

function errorMessage(value: unknown, fallback: string): string {
  return customerApiError(value, fallback);
}
