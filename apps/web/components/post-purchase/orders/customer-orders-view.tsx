'use client';
import { LoginRedirect } from '@/components/auth/login-redirect';

import { PackageIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  CollectionLoading,
  CollectionSurface,
  EmptyState,
  ErrorState,
  Pagination,
  PostPurchasePageHeader,
  ProductTextSummary,
  StatusPill,
} from '@/components/post-purchase';
import {
  listCustomerOrders,
  type CustomerOrderListQuery,
  type CustomerOrderListResult,
} from '@/lib/customer-orders-api';
import {
  formatCustomerDateTime,
  formatCustomerMoney,
  fulfillmentTypeLabel,
  orderStatusLabel,
  paymentSummaryLabel,
  statusTone,
} from '@/lib/customer-order-presenters';
import styles from './orders.module.css';

const PAGE_SIZE = 10;

export function CustomerOrdersView() {
  const { client, status, user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = parseCustomerOrderQuery(searchParams);
  const isCustomer = status === 'authenticated' && user?.role === 'CUSTOMER';
  const ownerKey = isCustomer ? user.id : '';
  const [snapshot, setSnapshot] = useState<{
    listKey: string;
    ownerKey: string;
    result: CustomerOrderListResult;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const listKey = `${status}\u0000${user?.id ?? ''}\u0000${query.status ?? ''}\u0000${query.fulfillmentType ?? ''}\u0000${String(query.page)}\u0000${query.sortBy}\u0000${query.sortOrder}`;
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    if (!isCustomer) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listCustomerOrders(client, query);
      if (requestGeneration.current !== generation) return;
      const finalPage = Math.max(1, result.pagination.totalPages);
      if (query.page > finalPage) {
        router.replace(customerOrdersHref({ ...query, page: finalPage }), { scroll: false });
        return;
      }
      setSnapshot({ listKey, ownerKey, result });
    } catch (caught) {
      if (requestGeneration.current !== generation) return;
      setError({
        key: listKey,
        message: caught instanceof Error ? caught.message : 'Không thể tải danh sách đơn hàng.',
      });
    } finally {
      if (requestGeneration.current === generation) setLoading(false);
    }
  }, [
    client,
    isCustomer,
    listKey,
    ownerKey,
    query.fulfillmentType,
    query.page,
    query.sortBy,
    query.sortOrder,
    query.status,
    router,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownedSnapshot = snapshot?.ownerKey === ownerKey ? snapshot : null;
  const contextReady = ownedSnapshot?.listKey === listKey;
  const visibleError = error?.key === listKey ? error.message : null;
  const visibleOrders = ownedSnapshot?.result.data ?? [];
  const visiblePagination = ownedSnapshot
    ? ownedSnapshot.result.pagination
    : { page: query.page, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 0 };
  const initialLoading = isCustomer && loading && ownedSnapshot === null;
  const updating = isCustomer && ownedSnapshot !== null && (loading || !contextReady);

  const update = (
    values: Partial<Omit<CustomerOrderListQuery, 'status' | 'fulfillmentType'>> & {
      status?: CustomerOrderListQuery['status'] | undefined;
      fulfillmentType?: CustomerOrderListQuery['fulfillmentType'] | undefined;
    },
  ) => {
    const next: CustomerOrderListQuery = { ...query };
    if (values.page !== undefined) next.page = values.page;
    if (values.pageSize !== undefined) next.pageSize = values.pageSize;
    if (values.sortBy !== undefined) next.sortBy = values.sortBy;
    if (values.sortOrder !== undefined) next.sortOrder = values.sortOrder;
    if ('status' in values) {
      if (values.status === undefined) delete next.status;
      else next.status = values.status;
    }
    if ('fulfillmentType' in values) {
      if (values.fulfillmentType === undefined) delete next.fulfillmentType;
      else next.fulfillmentType = values.fulfillmentType;
    }
    router.push(customerOrdersHref(next), { scroll: false });
  };

  return (
    <section className={styles.page}>
      <PostPurchasePageHeader
        title="Đơn hàng của bạn"
        description="Theo dõi thanh toán, nhận hàng và các hỗ trợ liên quan đến từng đơn."
      />
      {status === 'loading' ? <CollectionLoading label="Đang tải đơn hàng…" /> : null}
      {status === 'anonymous' ? <LoginRedirect returnTo="/orders" /> : null}
      {status === 'authenticated' && user?.role !== 'CUSTOMER' ? (
        <EmptyState
          title="Không thể mở danh sách này"
          description="Danh sách đơn hàng chỉ dành cho tài khoản khách hàng."
          actionHref="/"
          actionLabel="Về trang chủ"
        />
      ) : null}
      {isCustomer ? (
        <>
          <div className={styles.filters} aria-label="Lọc và sắp xếp đơn hàng">
            <label>
              Trạng thái
              <select
                value={query.status ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  update(
                    value
                      ? { status: value as NonNullable<CustomerOrderListQuery['status']>, page: 1 }
                      : { page: 1, status: undefined },
                  );
                }}
              >
                <option value="">Tất cả</option>
                <option value="PLACED">Đã đặt hàng</option>
                <option value="CONFIRMED">Đã xác nhận</option>
                <option value="PROCESSING">Đang xử lý</option>
                <option value="COMPLETED">Đã hoàn tất</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            </label>
            <label>
              Cách nhận hàng
              <select
                value={query.fulfillmentType ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  update(
                    value
                      ? {
                          fulfillmentType: value as NonNullable<
                            CustomerOrderListQuery['fulfillmentType']
                          >,
                          page: 1,
                        }
                      : { page: 1, fulfillmentType: undefined },
                  );
                }}
              >
                <option value="">Tất cả</option>
                <option value="PICKUP">Nhận tại cửa hàng</option>
                <option value="SHIPPING">Giao tận nơi</option>
              </select>
            </label>
            <label>
              Sắp xếp
              <select
                value={`${query.sortBy}:${query.sortOrder}`}
                onChange={(event) => {
                  const [sortBy, sortOrder] = event.target.value.split(':');
                  update({
                    sortBy: sortBy as CustomerOrderListQuery['sortBy'],
                    sortOrder: sortOrder as CustomerOrderListQuery['sortOrder'],
                    page: 1,
                  });
                }}
              >
                <option value="placedAt:desc">Mới nhất</option>
                <option value="placedAt:asc">Cũ nhất</option>
                <option value="grandTotal:desc">Giá trị cao nhất</option>
                <option value="grandTotal:asc">Giá trị thấp nhất</option>
                <option value="status:asc">Theo trạng thái</option>
              </select>
            </label>
          </div>
          {initialLoading ? <CollectionLoading label="Đang tải đơn hàng…" /> : null}
          {visibleError ? <ErrorState message={visibleError} onRetry={() => void load()} /> : null}
          {visibleOrders.length === 0 && !visibleError && !updating ? (
            <EmptyState
              title="Chưa có đơn hàng phù hợp"
              description="Bạn có thể đổi bộ lọc hoặc xem các sản phẩm đang có sẵn."
              actionHref="/products"
              actionLabel="Xem sản phẩm"
            />
          ) : visibleOrders.length > 0 ? (
            <CollectionSurface
              ariaLabel="Danh sách đơn hàng"
              busy={updating}
              footer={
                <Pagination
                  page={visiblePagination.page}
                  totalPages={visiblePagination.totalPages}
                  buildHref={(page) => customerOrdersHref({ ...query, page })}
                />
              }
            >
              {visibleOrders.map((order) => (
                <article className={styles.row} key={order.orderNumber}>
                  <ProductTextSummary
                    icon={<PackageIcon size={26} />}
                    name={order.firstItemName}
                    secondary={
                      <>
                        {order.totalItemQuantity > 1
                          ? `và ${String(order.totalItemQuantity - 1)} sản phẩm khác · `
                          : ''}
                        {fulfillmentTypeLabel(order.fulfillmentType)}
                      </>
                    }
                  />
                  <div className={styles.rowFacts}>
                    <span>
                      Mã đơn<strong title={order.orderNumber}>{order.orderNumber}</strong>
                    </span>
                    <span>
                      Ngày đặt<strong>{formatCustomerDateTime(order.placedAt)}</strong>
                    </span>
                    <span>
                      Tổng tiền<strong>{formatCustomerMoney(order.grandTotal)} ₫</strong>
                    </span>
                  </div>
                  <div className={styles.rowAction}>
                    <StatusPill tone={statusTone(order.status)}>
                      {orderStatusLabel(order.status)}
                    </StatusPill>
                    <small>{paymentSummaryLabel(order.paymentStatus)}</small>
                    <Link
                      aria-label={`Xem chi tiết đơn ${order.orderNumber}`}
                      href={`/orders/${encodeURIComponent(order.orderNumber)}`}
                    >
                      Xem chi tiết
                    </Link>
                  </div>
                </article>
              ))}
            </CollectionSurface>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function parseCustomerOrderQuery(
  params: Pick<URLSearchParams, 'get'>,
): CustomerOrderListQuery {
  const status = params.get('status');
  const fulfillmentType = params.get('fulfillmentType');
  const sortBy = params.get('sortBy');
  const sortOrder = params.get('sortOrder');
  const rawPage = Number(params.get('page'));
  return {
    ...(['PLACED', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'].includes(status ?? '')
      ? { status: status as NonNullable<CustomerOrderListQuery['status']> }
      : {}),
    ...(['PICKUP', 'SHIPPING'].includes(fulfillmentType ?? '')
      ? {
          fulfillmentType: fulfillmentType as NonNullable<
            CustomerOrderListQuery['fulfillmentType']
          >,
        }
      : {}),
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: PAGE_SIZE,
    sortBy: ['placedAt', 'grandTotal', 'status'].includes(sortBy ?? '')
      ? (sortBy as CustomerOrderListQuery['sortBy'])
      : 'placedAt',
    sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
  };
}

export function customerOrdersHref(query: CustomerOrderListQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.fulfillmentType) params.set('fulfillmentType', query.fulfillmentType);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.sortBy !== 'placedAt') params.set('sortBy', query.sortBy);
  if (query.sortOrder !== 'desc') params.set('sortOrder', query.sortOrder);
  const value = params.toString();
  return value ? `/orders?${value}` : '/orders';
}
