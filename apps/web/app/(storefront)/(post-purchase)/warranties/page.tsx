'use client';
import { LoginRedirect } from '@/components/auth/login-redirect';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  CollectionLoading,
  EmptyState,
  ErrorState,
  PostPurchasePageHeader,
} from '@/components/post-purchase';
import { WarrantyList } from '@/components/post-purchase/warranties/warranty-list';
import {
  parseWarrantyPage,
  warrantyPageHref,
} from '@/components/post-purchase/warranties/warranty-presenters';
import styles from '@/components/post-purchase/warranties/warranties.module.css';
import {
  listCustomerWarranties,
  type Pagination,
  type WarrantyListItem,
  type WarrantyPage,
} from '@/lib/warranty-api';

const PAGE_SIZE = 12;
const EMPTY_PAGE: Pagination = { page: 1, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 0 };

export default function CustomerWarrantiesPage() {
  return (
    <Suspense fallback={<CollectionLoading label="Đang tải bảo hành…" />}>
      <CustomerWarrantiesContent />
    </Suspense>
  );
}

function CustomerWarrantiesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const page = parseWarrantyPage(searchParams.get('page'));
  const { client, status, user } = useAuth();
  const isCustomer = status === 'authenticated' && user?.role === 'CUSTOMER';
  const ownerKey = isCustomer ? user.id : '';
  const [snapshot, setSnapshot] = useState<{
    key: string;
    ownerKey: string;
    result: WarrantyPage<WarrantyListItem>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const listKey = `${status}\u0000${user?.id ?? ''}\u0000${String(page)}\u0000${String(reloadKey)}`;

  useEffect(() => {
    let active = true;
    setError(null);
    if (!isCustomer) {
      setSnapshot(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    void listCustomerWarranties(client, { page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        const finalPage = Math.max(1, result.pagination.totalPages);
        if (page > finalPage) {
          router.replace(warrantyPageHref(finalPage), { scroll: false });
          return;
        }
        setSnapshot({ key: listKey, ownerKey, result });
      })
      .catch((caught: unknown) => {
        if (active) {
          setError({
            key: listKey,
            message: caught instanceof Error ? caught.message : 'Không thể tải bảo hành.',
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isCustomer, listKey, ownerKey, page, reloadKey, router]);

  const ownedSnapshot = snapshot?.ownerKey === ownerKey ? snapshot : null;
  const contextReady = ownedSnapshot?.key === listKey;
  const visibleError = error?.key === listKey ? error.message : null;
  const visibleWarranties = ownedSnapshot?.result.data ?? [];
  const visiblePagination = ownedSnapshot?.result.pagination ?? { ...EMPTY_PAGE, page };
  const initialLoading = isCustomer && loading && ownedSnapshot === null;
  const updating = isCustomer && ownedSnapshot !== null && (loading || !contextReady);

  return (
    <section className={styles.page}>
      <PostPurchasePageHeader
        title="Bảo hành của bạn"
        description="Xem thời hạn và điều khoản đã ghi nhận khi đơn hàng hoàn tất."
        status={
          isCustomer && ownedSnapshot !== null ? (
            <span className={styles.count}>{visiblePagination.totalItems} bảo hành</span>
          ) : undefined
        }
      />
      {status === 'loading' ? <CollectionLoading label="Đang kiểm tra tài khoản…" /> : null}
      {status === 'anonymous' ? <LoginRedirect returnTo="/warranties" /> : null}
      {status === 'authenticated' && !isCustomer ? (
        <EmptyState
          title="Khu vực dành cho khách hàng"
          description="Tài khoản nhân viên sử dụng khu vực quản lý riêng."
          actionHref="/backoffice/orders"
          actionLabel="Mở khu vực quản lý"
        />
      ) : null}
      {initialLoading ? <CollectionLoading label="Đang tải bảo hành…" /> : null}
      {isCustomer && visibleError !== null ? (
        <ErrorState
          message={visibleError}
          onRetry={() => {
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
      {status === 'authenticated' &&
      isCustomer &&
      !initialLoading &&
      visibleError === null &&
      visibleWarranties.length === 0 ? (
        <EmptyState
          title="Chưa có bảo hành"
          description="Bảo hành sẽ xuất hiện tại đây sau khi đơn hàng đủ điều kiện được hoàn tất."
          actionHref="/products?productType=IPHONE&inStock=true"
          actionLabel="Xem máy đang bán"
        />
      ) : null}
      {isCustomer && visibleWarranties.length > 0 ? (
        <WarrantyList
          busy={updating}
          items={visibleWarranties}
          page={visiblePagination.page}
          totalPages={visiblePagination.totalPages}
        />
      ) : null}
      <p className={styles.helpLink}>
        Cần hỗ trợ về sản phẩm? <Link href="/orders">Chọn sản phẩm từ đơn hàng</Link>.
      </p>
    </section>
  );
}
