'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FunnelSimpleIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type SyntheticEvent,
} from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  Button,
  InlineAlert,
  Input,
  Select,
  Skeleton,
  StatusChip,
  formatVnd,
} from '@/components/ui';
import {
  listBackofficeOrders,
  type BackofficeOrderListItem,
  type BackofficeOrderListQuery,
} from '@/lib/fulfillment-api';
import { OperationsPageHeader } from '../operations-primitives';
import {
  focusQueueReadError,
  isCurrentQueueRequest,
  queuePageWithinTotal,
  queueReadPresentation,
} from '../queue-read-model';
import { OperationsShell } from '../operations-shell';
import {
  DEFAULT_ORDER_FILTERS,
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  formatOrderDateTime,
  orderDraftFromQuery,
  orderListHref,
  orderQueryFromDraft,
  orderSortDirectionLabels,
  orderStatusLabel,
  orderStatusTone,
  parseOrderListQuery,
  paymentStatusLabel,
  paymentStatusTone,
  type OrderFilterDraft,
} from './order-presenter';
import styles from './orders.module.css';

interface PaginationState {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

const EMPTY_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

export function OrderListView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const query = useMemo(() => parseOrderListQuery(searchParams), [queryKey, searchParams]);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [draft, setDraft] = useState<OrderFilterDraft>(() => orderDraftFromQuery(query));
  const [orders, setOrders] = useState<BackofficeOrderListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const listRequestRef = useRef(0);
  const pendingFocusIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDraft(orderDraftFromQuery(query));
  }, [query]);

  useEffect(() => {
    if (error !== null) focusQueueReadError(errorRef.current);
  }, [error]);

  useEffect(() => {
    if (loading || pendingFocusIdRef.current === null) return;
    const focusId = pendingFocusIdRef.current;
    pendingFocusIdRef.current = null;
    window.requestAnimationFrame(() => {
      document.getElementById(focusId)?.focus({ preventScroll: true });
    });
  }, [loading]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    const request = ++listRequestRef.current;
    setLoading(true);
    setError(null);
    void listBackofficeOrders(client, query)
      .then((result) => {
        if (!isCurrentQueueRequest(request, listRequestRef.current)) return;
        const authoritativePage = queuePageWithinTotal(query.page, result.pagination.totalPages);
        if (authoritativePage !== query.page) {
          router.replace(orderListHref({ ...query, page: authoritativePage }), { scroll: false });
          return;
        }
        setOrders(result.data);
        setPagination(result.pagination);
        setHasLoaded(true);
        setLoadedQueryKey(queryKey);
      })
      .catch((caught: unknown) => {
        if (!isCurrentQueueRequest(request, listRequestRef.current)) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải danh sách đơn hàng.');
      })
      .finally(() => {
        if (isCurrentQueueRequest(request, listRequestRef.current)) setLoading(false);
      });
    return () => {
      if (isCurrentQueueRequest(request, listRequestRef.current)) listRequestRef.current += 1;
    };
  }, [client, isStaff, query, queryKey, reloadKey, router, status]);

  function navigate(next: BackofficeOrderListQuery) {
    rememberQueueFocus();
    const href = orderListHref(next);
    if (`${pathname}${queryKey === '' ? '' : `?${queryKey}`}` === href) {
      setReloadKey((current) => current + 1);
      return;
    }
    router.push(href, { scroll: false });
  }

  function rememberQueueFocus() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.id.startsWith('order-')) {
      pendingFocusIdRef.current = active.id;
    }
  }

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(orderQueryFromDraft(draft));
  }

  function resetFilters() {
    setDraft(DEFAULT_ORDER_FILTERS);
    navigate(orderQueryFromDraft(DEFAULT_ORDER_FILTERS));
  }

  const readPresentation = queueReadPresentation(loading, error, queryKey, loadedQueryKey);
  const updating = readPresentation.updating;
  return (
    <OperationsShell breadcrumbs={[{ label: 'Vận hành' }, { label: 'Đơn hàng' }]}>
      <div className={styles.page}>
        <OperationsPageHeader
          description="Theo dõi đơn nhận tại cửa hàng và giao tận nơi trong cùng một hàng chờ."
          title="Đơn hàng"
        />

        <OrderFilters
          draft={draft}
          loading={loading}
          setDraft={setDraft}
          onReset={resetFilters}
          onSubmit={applyFilters}
        />

        {error === null ? null : (
          <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa tải được đơn hàng" tone="danger">
            <div className={styles.alertContent}>
              <span>
                {error}
                {readPresentation.retainedSnapshotNotice === null
                  ? null
                  : ` ${readPresentation.retainedSnapshotNotice}`}
              </span>
              <Button
                disabled={loading}
                id="order-list-retry"
                size="compact"
                variant="secondary"
                onClick={() => {
                  rememberQueueFocus();
                  setReloadKey((current) => current + 1);
                }}
              >
                Thử lại
              </Button>
            </div>
          </InlineAlert>
        )}

        <div className={styles.queueSummary} aria-live="polite">
          <div>
            <strong>{hasLoaded ? `${String(pagination.totalItems)} đơn hàng` : 'Đang tải'}</strong>
            <span>
              Trang {pagination.page}/{Math.max(pagination.totalPages, 1)}
            </span>
          </div>
          {updating ? <span className={styles.updating}>Đang cập nhật danh sách…</span> : null}
        </div>

        {readPresentation.initialLoading ? <OrderListSkeleton /> : null}
        {hasLoaded && orders.length === 0 && !readPresentation.initialLoading ? (
          <section className={styles.emptyState}>
            <h2>Không có đơn phù hợp</h2>
            <p>Hãy thử thay đổi từ khóa hoặc bộ lọc.</p>
            <Button variant="secondary" onClick={resetFilters}>
              Xóa bộ lọc
            </Button>
          </section>
        ) : null}
        {hasLoaded && orders.length > 0 ? <OrderQueue orders={orders} updating={updating} /> : null}

        {hasLoaded && pagination.totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="Phân trang đơn hàng">
            <Button
              disabled={loading || pagination.page <= 1}
              id="order-page-previous"
              iconLeading={<ArrowLeftIcon aria-hidden="true" size={18} />}
              variant="secondary"
              onClick={() => {
                navigate({ ...query, page: pagination.page - 1 });
              }}
            >
              Trang trước
            </Button>
            <span>
              Trang <strong>{pagination.page}</strong> / {pagination.totalPages}
            </span>
            <Button
              disabled={loading || pagination.page >= pagination.totalPages}
              id="order-page-next"
              iconTrailing={<ArrowRightIcon aria-hidden="true" size={18} />}
              variant="secondary"
              onClick={() => {
                navigate({ ...query, page: pagination.page + 1 });
              }}
            >
              Trang sau
            </Button>
          </nav>
        ) : null}
      </div>
    </OperationsShell>
  );
}

function OrderFilters({
  draft,
  loading,
  onReset,
  onSubmit,
  setDraft,
}: Readonly<{
  draft: OrderFilterDraft;
  loading: boolean;
  onReset: () => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  setDraft: Dispatch<SetStateAction<OrderFilterDraft>>;
}>) {
  const hasAdvancedFilters =
    draft.fulfillmentStatus !== '' ||
    draft.paymentStatus !== '' ||
    draft.pickupOverdue !== '' ||
    draft.sortBy !== 'placedAt' ||
    draft.sortOrder !== 'desc';
  const sortDirectionLabels = orderSortDirectionLabels(draft.sortBy);

  return (
    <form className={styles.filters} onSubmit={onSubmit}>
      <div className={styles.filterGrid}>
        <Input
          containerClassName={styles.searchField ?? ''}
          id="order-search"
          label="Tìm đơn hàng"
          maxLength={100}
          placeholder="Mã đơn, tên, email hoặc số điện thoại"
          value={draft.q}
          onChange={(event) => {
            setDraft((current) => ({ ...current, q: event.target.value }));
          }}
        />
        <Select
          id="order-fulfillment-type"
          label="Cách nhận hàng"
          value={draft.fulfillmentType}
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              fulfillmentType: event.target.value as OrderFilterDraft['fulfillmentType'],
              pickupOverdue: event.target.value === 'SHIPPING' ? '' : current.pickupOverdue,
              sortBy:
                event.target.value === 'SHIPPING' && current.sortBy === 'pickupHoldUntil'
                  ? 'placedAt'
                  : current.sortBy,
            }));
          }}
        >
          <option value="">Tất cả</option>
          <option value="PICKUP">Nhận tại cửa hàng</option>
          <option value="SHIPPING">Giao tận nơi</option>
        </Select>
        <Select
          id="order-status"
          label="Trạng thái đơn"
          value={draft.status}
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              status: event.target.value as OrderFilterDraft['status'],
            }));
          }}
        >
          <option value="">Tất cả</option>
          <option value="PLACED">Đã đặt hàng</option>
          <option value="CONFIRMED">Đã xác nhận</option>
          <option value="PROCESSING">Đang xử lý</option>
          <option value="COMPLETED">Đã hoàn tất</option>
          <option value="CANCELLED">Đã hủy</option>
        </Select>
      </div>

      <details className={styles.advancedFilters} open={hasAdvancedFilters || undefined}>
        <summary>
          <FunnelSimpleIcon aria-hidden="true" size={18} />
          Bộ lọc nâng cao
        </summary>
        <div className={styles.advancedGrid}>
          <Select
            id="order-fulfillment-status"
            label="Tình trạng giao nhận"
            value={draft.fulfillmentStatus}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                fulfillmentStatus: event.target.value as OrderFilterDraft['fulfillmentStatus'],
              }));
            }}
          >
            <option value="">Tất cả</option>
            <option value="PENDING">Chờ xử lý</option>
            <option value="PREPARING">Đang chuẩn bị</option>
            <option value="READY">Sẵn sàng nhận</option>
            <option value="IN_TRANSIT">Đang giao hàng</option>
            <option value="COMPLETED">Đã giao hàng</option>
            <option value="FAILED">Giao hàng thất bại</option>
            <option value="RETURNED">Đã nhận hàng hoàn</option>
            <option value="CANCELLED">Đã hủy</option>
          </Select>
          <Select
            id="order-payment-status"
            label="Tình trạng thanh toán"
            value={draft.paymentStatus}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                paymentStatus: event.target.value as OrderFilterDraft['paymentStatus'],
              }));
            }}
          >
            <option value="">Tất cả</option>
            <option value="UNPAID">Chưa thanh toán</option>
            <option value="PARTIALLY_PAID">Đã thanh toán một phần</option>
            <option value="PAID">Đã thanh toán</option>
            <option value="PARTIALLY_REFUNDED">Đã hoàn một phần</option>
            <option value="REFUNDED">Đã hoàn tiền</option>
          </Select>
          <Select
            disabled={draft.fulfillmentType === 'SHIPPING'}
            id="order-pickup-overdue"
            label="Hạn giữ tại cửa hàng"
            value={draft.pickupOverdue}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                pickupOverdue: event.target.value as OrderFilterDraft['pickupOverdue'],
              }));
            }}
          >
            <option value="">Tất cả</option>
            <option value="true">Đã quá hạn</option>
            <option value="false">Còn hạn</option>
          </Select>
          <Select
            id="order-sort-by"
            label="Sắp xếp theo"
            value={draft.sortBy}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                sortBy: event.target.value as OrderFilterDraft['sortBy'],
              }));
            }}
          >
            <option value="placedAt">Thời gian đặt</option>
            <option value="updatedAt">Cập nhật gần nhất</option>
            <option value="grandTotal">Tổng tiền</option>
            {draft.fulfillmentType === 'SHIPPING' ? null : (
              <option value="pickupHoldUntil">Hạn giữ hàng</option>
            )}
          </Select>
          <Select
            id="order-sort-order"
            label="Thứ tự"
            value={draft.sortOrder}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                sortOrder: event.target.value as OrderFilterDraft['sortOrder'],
              }));
            }}
          >
            <option value="desc">{sortDirectionLabels.desc}</option>
            <option value="asc">{sortDirectionLabels.asc}</option>
          </Select>
        </div>
      </details>

      <div className={styles.filterActions}>
        <Button
          disabled={loading}
          id="order-filter-submit"
          iconLeading={<MagnifyingGlassIcon aria-hidden="true" size={18} />}
          type="submit"
        >
          Lọc đơn hàng
        </Button>
        <Button
          disabled={loading}
          id="order-filter-reset"
          type="button"
          variant="secondary"
          onClick={onReset}
        >
          Đặt lại
        </Button>
      </div>
    </form>
  );
}

export function OrderQueue({
  orders,
  updating = false,
}: Readonly<{ orders: readonly BackofficeOrderListItem[]; updating?: boolean }>) {
  return (
    <section
      aria-busy={updating}
      className={styles.queue}
      data-updating={updating || undefined}
      aria-label="Danh sách đơn hàng"
    >
      <div className={styles.queueHeader} aria-hidden="true">
        <span>Đơn hàng và khách</span>
        <span>Giao nhận</span>
        <span>Tài chính</span>
        <span>Trạng thái</span>
      </div>
      <ol className={styles.orderRows}>
        {orders.map((order) => (
          <li key={order.id}>
            <NextLink
              className={styles.orderRow}
              href={`/backoffice/orders/${encodeURIComponent(order.id)}`}
            >
              <div className={styles.orderIdentity}>
                <span className="rp-visually-hidden">Đơn hàng và khách: </span>
                <span className={styles.orderNumber}>{order.orderNumber}</span>
                <strong>{order.firstItemName}</strong>
                <span>{order.contactName}</span>
                <small>
                  {String(order.totalItemQuantity)} sản phẩm · {formatOrderDateTime(order.placedAt)}
                </small>
              </div>
              <div className={styles.fulfillmentSummary}>
                <span className="rp-visually-hidden">Giao nhận: </span>
                <strong>
                  {order.fulfillmentType === 'PICKUP' ? 'Nhận tại cửa hàng' : 'Giao tận nơi'}
                </strong>
                {order.fulfillmentType === 'PICKUP' ? (
                  <span>
                    Giữ đến{' '}
                    {order.pickupHoldUntil === null
                      ? '—'
                      : formatOrderDateTime(order.pickupHoldUntil)}
                  </span>
                ) : (
                  <span>{order.location?.name ?? 'Chưa xác định nơi xuất hàng'}</span>
                )}
                {order.pickupOverdue ? <StatusChip label="Đã quá hạn" tone="danger" /> : null}
              </div>
              <div className={styles.financeSummary}>
                <span className="rp-visually-hidden">Tài chính: </span>
                <strong>{formatVnd(order.grandTotal)}</strong>
                <span>Còn thu {formatVnd(order.balanceDue)}</span>
              </div>
              <div className={styles.rowStatuses}>
                <span className="rp-visually-hidden">Trạng thái đơn hàng: </span>
                <StatusChip
                  label={orderStatusLabel(order.status)}
                  tone={orderStatusTone(order.status)}
                />
                <span className="rp-visually-hidden">Tình trạng giao nhận: </span>
                <StatusChip
                  label={fulfillmentStatusLabel(order.fulfillmentStatus)}
                  tone={fulfillmentStatusTone(order.fulfillmentStatus)}
                />
                <span className="rp-visually-hidden">Tình trạng thanh toán: </span>
                <StatusChip
                  label={paymentStatusLabel(order.paymentStatus)}
                  tone={paymentStatusTone(order.paymentStatus)}
                />
              </div>
            </NextLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OrderListSkeleton() {
  return (
    <section className={styles.queue} aria-label="Đang tải danh sách đơn hàng" role="status">
      <span className="rp-visually-hidden">Đang tải danh sách đơn hàng…</span>
      <div className={styles.skeletonRows} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div className={styles.skeletonRow} key={index}>
            <Skeleton height="1rem" width="30%" />
            <Skeleton height="1rem" width="22%" />
            <Skeleton height="1rem" width="18%" />
            <Skeleton height="1.75rem" width="8rem" />
          </div>
        ))}
      </div>
    </section>
  );
}
