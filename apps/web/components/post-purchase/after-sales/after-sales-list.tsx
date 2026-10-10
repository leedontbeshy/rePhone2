'use client';
import { LoginRedirect } from '@/components/auth/login-redirect';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  CollectionLoading,
  CollectionSurface,
  EmptyState,
  ErrorState,
  Pagination,
  PostPurchasePageHeader,
  StatusPill,
} from '@/components/post-purchase';
import {
  listCustomerAfterSalesRequests,
  type AfterSalesListItem,
  type AfterSalesPage,
  type AfterSalesStatus,
  type AfterSalesType,
} from '@/lib/after-sales-api';
import {
  afterSalesStatus,
  afterSalesTypeLabel,
  formatCustomerDate,
} from '@/lib/after-sales-presenter';
import styles from './after-sales.module.css';
import { AfterSalesProductSummary } from './product-summary';

const PAGE_SIZE = 10;

export function AfterSalesList() {
  const { client, status, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = positiveInt(searchParams.get('page'));
  const type = allowedType(searchParams.get('type'));
  const requestStatus = allowedStatus(searchParams.get('status'));
  const [snapshot, setSnapshot] = useState<{
    key: string;
    ownerKey: string;
    result: AfterSalesPage;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const listKey = `${status}\u0000${user?.id ?? ''}\u0000${String(page)}\u0000${type}\u0000${requestStatus}\u0000${String(reloadKey)}`;
  const isCustomer = status === 'authenticated' && user?.role === 'CUSTOMER';
  const ownerKey = isCustomer ? user.id : '';

  useEffect(() => {
    setError(null);
    if (!isCustomer) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void listCustomerAfterSalesRequests(client, {
      page,
      pageSize: PAGE_SIZE,
      status: requestStatus,
      type,
    })
      .then((next) => {
        if (active) {
          const finalPage = Math.max(1, next.pagination.totalPages);
          if (page > finalPage) {
            router.replace(
              buildAfterSalesListHref({ type, status: requestStatus, page: finalPage }, pathname),
              { scroll: false },
            );
            return;
          }
          setSnapshot({ key: listKey, ownerKey, result: next });
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError({
            key: listKey,
            message: caught instanceof Error ? caught.message : 'Không thể tải yêu cầu hỗ trợ.',
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    client,
    isCustomer,
    listKey,
    ownerKey,
    page,
    pathname,
    reloadKey,
    requestStatus,
    router,
    type,
  ]);

  const ownedSnapshot = snapshot?.ownerKey === ownerKey ? snapshot : null;
  const contextReady = ownedSnapshot?.key === listKey;
  const visibleResult = ownedSnapshot?.result ?? null;
  const visibleError = error?.key === listKey ? error.message : null;
  const initialLoading = isCustomer && loading && ownedSnapshot === null;
  const updating = isCustomer && ownedSnapshot !== null && (loading || !contextReady);

  const updateQuery = (key: 'status' | 'type', value: string) => {
    const nextType = key === 'type' ? allowedType(value) : type;
    const nextStatus = key === 'status' ? allowedStatus(value) : requestStatus;
    router.replace(
      buildAfterSalesListHref({ type: nextType, status: nextStatus, page: 1 }, pathname),
      { scroll: false },
    );
  };

  return (
    <div className={styles.page}>
      <PostPurchasePageHeader
        title="Hỗ trợ sau mua"
        description="Theo dõi các yêu cầu bảo hành, đổi hoặc trả sản phẩm."
        action={isCustomer ? <AfterSalesOrderPickerLink /> : undefined}
      />

      {status === 'loading' ? <CollectionLoading label="Đang kiểm tra tài khoản…" /> : null}
      {status === 'anonymous' ? <LoginRedirect returnTo="/after-sales" /> : null}
      {status === 'authenticated' && !isCustomer ? (
        <ErrorState message="Tài khoản này không sử dụng khu vực hỗ trợ dành cho khách hàng." />
      ) : null}

      {isCustomer ? (
        <>
          <div className={styles.filters} aria-label="Lọc yêu cầu hỗ trợ">
            <label className={styles.filter}>
              Loại yêu cầu
              <select
                value={type}
                onChange={(event) => {
                  updateQuery('type', event.target.value);
                }}
              >
                <option value="">Tất cả</option>
                <option value="WARRANTY">Bảo hành</option>
                <option value="RETURN">Trả sản phẩm</option>
                <option value="EXCHANGE">Đổi sản phẩm</option>
              </select>
            </label>
            <label className={styles.filter}>
              Trạng thái
              <select
                value={requestStatus}
                onChange={(event) => {
                  updateQuery('status', event.target.value);
                }}
              >
                <option value="">Tất cả</option>
                <option value="REQUESTED">Đã gửi yêu cầu</option>
                <option value="RECEIVED">Đã tiếp nhận</option>
                <option value="INSPECTING">Đang kiểm tra</option>
                <option value="APPROVED">Đã chấp nhận</option>
                <option value="REJECTED">Không thể hỗ trợ</option>
                <option value="RESOLVED">Đã hoàn tất</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            </label>
          </div>
          {visibleError ? (
            <ErrorState
              message={visibleError}
              onRetry={() => {
                setReloadKey((value) => value + 1);
              }}
            />
          ) : null}
          {initialLoading ? <CollectionLoading label="Đang tải yêu cầu hỗ trợ…" /> : null}
          {!initialLoading && !visibleError && visibleResult?.data.length === 0 ? (
            <EmptyState
              title="Chưa có yêu cầu hỗ trợ"
              description="Hãy chọn một sản phẩm từ đơn hàng đã hoàn tất để bắt đầu."
              actionHref="/after-sales/new"
              actionLabel="Chọn sản phẩm"
            />
          ) : null}
          {visibleResult && visibleResult.data.length > 0 ? (
            <CollectionSurface
              ariaLabel="Danh sách yêu cầu hỗ trợ"
              busy={updating}
              footer={
                <Pagination
                  page={visibleResult.pagination.page}
                  totalPages={visibleResult.pagination.totalPages}
                  buildHref={(nextPage) =>
                    buildAfterSalesListHref(
                      { type, status: requestStatus, page: nextPage },
                      pathname,
                    )
                  }
                />
              }
            >
              {visibleResult.data.map((item) => (
                <AfterSalesRow item={item} key={item.requestNumber} />
              ))}
            </CollectionSurface>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function AfterSalesOrderPickerLink() {
  return (
    <Link className={styles.primaryLink} href="/after-sales/new">
      Chọn sản phẩm từ đơn hàng
    </Link>
  );
}

export function AfterSalesRow({ item }: Readonly<{ item: AfterSalesListItem }>) {
  const status = afterSalesStatus(item.status);
  return (
    <article className={styles.row}>
      <AfterSalesProductSummary
        name={item.orderItem.productName}
        secondary={item.orderItem.variantName}
      />
      <div className={styles.requestMeta}>
        <strong>{afterSalesTypeLabel(item.type)}</strong>
        <span>{item.requestNumber}</span>
        <small>Gửi ngày {formatCustomerDate(item.requestedAt)}</small>
      </div>
      <div className={styles.update}>
        <span>Cập nhật {formatCustomerDate(item.updatedAt)}</span>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <Link
        className={styles.rowAction}
        href={`/after-sales/${encodeURIComponent(item.requestNumber)}?orderNumber=${encodeURIComponent(item.orderItem.orderNumber)}`}
      >
        Xem tiến độ
      </Link>
    </article>
  );
}

function positiveInt(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function allowedType(value: string | null): AfterSalesType | '' {
  return value === 'WARRANTY' || value === 'RETURN' || value === 'EXCHANGE' ? value : '';
}

function allowedStatus(value: string | null): AfterSalesStatus | '' {
  return value === 'REQUESTED' ||
    value === 'RECEIVED' ||
    value === 'INSPECTING' ||
    value === 'APPROVED' ||
    value === 'REJECTED' ||
    value === 'RESOLVED' ||
    value === 'CANCELLED'
    ? value
    : '';
}

export function buildAfterSalesListHref(
  query: { type?: string; status?: string; page?: number },
  pathname = '/after-sales',
): string {
  const next = new URLSearchParams();
  const type = allowedType(query.type ?? null);
  const status = allowedStatus(query.status ?? null);
  const page = positiveInt(query.page === undefined ? null : String(query.page));
  if (type) next.set('type', type);
  if (status) next.set('status', status);
  if (page <= 1) next.delete('page');
  else next.set('page', String(page));
  return `${pathname}${next.size ? `?${next.toString()}` : ''}`;
}
