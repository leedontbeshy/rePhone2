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

export function CommerceProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, status, user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const mergedCustomer = useRef<string | null>(null);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());

  const refreshCart = useCallback(async () => {
    if (status === 'loading') return;
    if (status === 'authenticated' && user?.role !== 'CUSTOMER') {
      setCart(null);
      setCartLoading(false);
      return;
    }
    setCartLoading(true);
    const result = await client.GET('/api/v1/cart');
    if (result.data === undefined) {
      setCartError(errorMessage(result.error, 'Không thể tải giỏ hàng.'));
      setCartLoading(false);
      return;
    }
    setCart(result.data.data);
    setCartError(null);
    setCartLoading(false);
  }, [client, status, user?.role]);

  const merge = useCallback(async () => {
    const result = await client.POST('/api/v1/cart/merge', {});
    if (result.data === undefined) {
      const message = errorMessage(result.error, 'Không thể gộp giỏ hàng khách vào tài khoản.');
      setMergeError(message);
      throw new Error(message);
    }
    setCart(result.data.data);
    setCartError(null);
    setMergeError(null);
  }, [client]);

  useEffect(() => {
    if (status === 'anonymous') {
      mergedCustomer.current = null;
      void refreshCart();
      return;
    }
    if (status === 'authenticated' && user?.role === 'CUSTOMER') {
      if (mergedCustomer.current === user.id) return;
      mergedCustomer.current = user.id;
      setCartLoading(true);
      void merge()
        .catch(() => undefined)
        .finally(() => {
          setCartLoading(false);
        });
      return;
    }
    if (status === 'authenticated') {
      setCart(null);
      setCartLoading(false);
    }
  }, [merge, refreshCart, status, user]);

  const enqueueCartMutation = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const pending = mutationQueue.current.then(work, work);
    mutationQueue.current = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }, []);

  const addIphone = useCallback(
    (inventoryCode: string) =>
      enqueueCartMutation(async () => {
        const result = await client.POST('/api/v1/cart/items', {
          params: { header: CSRF_HEADER },
          body: { itemType: 'IPHONE', inventoryCode },
        });
        if (result.data === undefined) {
          throw new Error(errorMessage(result.error, 'Không thể thêm iPhone vào giỏ hàng.'));
        }
        setCart(result.data.data);
        setCartError(null);
      }),
    [client, enqueueCartMutation],
  );

  const addAccessory = useCallback(
    (variantId: string, quantity: number) =>
      enqueueCartMutation(async () => {
        const result = await client.POST('/api/v1/cart/items', {
          params: { header: CSRF_HEADER },
          body: { itemType: 'ACCESSORY', variantId, quantity },
        });
        if (result.data === undefined) {
          throw new Error(errorMessage(result.error, 'Không thể thêm phụ kiện vào giỏ hàng.'));
        }
        setCart(result.data.data);
        setCartError(null);
      }),
    [client, enqueueCartMutation],
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      const result = await client.PATCH('/api/v1/cart/items/{itemId}', {
        params: { path: { itemId }, header: CSRF_HEADER },
        body: { quantity },
      });
      if (result.data === undefined) {
        throw new Error(errorMessage(result.error, 'Không thể cập nhật số lượng.'));
      }
      setCart(result.data.data);
      setCartError(null);
    },
    [client],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const result = await client.DELETE('/api/v1/cart/items/{itemId}', {
        params: { path: { itemId }, header: CSRF_HEADER },
      });
      if (result.response.status !== 204) {
        throw new Error(errorMessage(result.error, 'Không thể xóa sản phẩm khỏi giỏ hàng.'));
      }
      setCart((current) =>
        current === null
          ? null
          : {
              ...current,
              items: current.items.filter((item) => item.id !== itemId),
            },
      );
      await refreshCart();
    },
    [client, refreshCart],
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

  const totalQuantity = useMemo(
    () => cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
    [cart],
  );
  const value = useMemo<CommerceContextValue>(
    () => ({
      cart,
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
      cart,
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
