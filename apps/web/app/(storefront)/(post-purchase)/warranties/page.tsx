'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  CollectionLoading,
  EmptyState,
  ErrorState,
  PostPurchasePageHeader,
} from '@/components/post-purchase';
import { WarrantyList } from '@/components/post-purchase/warranties/warranty-list';
import { parseWarrantyPage } from '@/components/post-purchase/warranties/warranty-presenters';
import styles from '@/components/post-purchase/warranties/warranties.module.css';
import { listCustomerWarranties, type Pagination, type WarrantyListItem } from '@/lib/warranty-api';

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
  const page = parseWarrantyPage(searchParams.get('page'));
  const { client, status, user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const [warranties, setWarranties] = useState<WarrantyListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const listKey = `${status}\u0000${user?.id ?? ''}\u0000${String(page)}\u0000${String(reloadKey)}`;
  const [stateKey, setStateKey] = useState('');

  useEffect(() => {
    let active = true;
    setWarranties([]);
    setPagination({ ...EMPTY_PAGE, page });
    setError(null);
    setStateKey('');
    if (status !== 'authenticated' || !isCustomer) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    void listCustomerWarranties(client, { page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setWarranties(result.data);
        setPagination(result.pagination);
        setStateKey(listKey);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Không thể tải bảo hành.');
          setStateKey(listKey);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isCustomer, listKey, page, reloadKey, status, user?.id]);

  const contextReady = stateKey === listKey;
  const visibleError = contextReady ? error : null;
  const visibleWarranties = contextReady ? warranties : [];
  const visiblePagination = contextReady ? pagination : { ...EMPTY_PAGE, page };
  const contextLoading = status === 'authenticated' && isCustomer && (!contextReady || loading);

  return (
    <section className={styles.page}>
      <PostPurchasePageHeader
        title="Bảo hành của bạn"
        description="Xem thời hạn và điều khoản đã ghi nhận khi đơn hàng hoàn tất."
        status={
          status === 'authenticated' && isCustomer && contextReady && !loading ? (
            <span className={styles.count}>{visiblePagination.totalItems} bảo hành</span>
          ) : undefined
        }
      />
      {status === 'loading' ? <CollectionLoading label="Đang kiểm tra tài khoản…" /> : null}
      {status === 'anonymous' ? (
        <EmptyState
          title="Đăng nhập để xem bảo hành"
          description="Danh sách bảo hành chỉ hiển thị cho tài khoản đã mua hàng."
          actionHref="/login?returnTo=%2Fwarranties"
          actionLabel="Đăng nhập"
        />
      ) : null}
      {status === 'authenticated' && !isCustomer ? (
        <EmptyState
          title="Khu vực dành cho khách hàng"
          description="Tài khoản nhân viên sử dụng khu vực quản lý riêng."
          actionHref="/backoffice/orders"
          actionLabel="Mở khu vực quản lý"
        />
      ) : null}
      {contextLoading ? <CollectionLoading label="Đang tải bảo hành…" /> : null}
      {status === 'authenticated' && isCustomer && visibleError !== null ? (
        <ErrorState
          message={visibleError}
          onRetry={() => {
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
      {status === 'authenticated' &&
      isCustomer &&
      !contextLoading &&
      visibleError === null &&
      visibleWarranties.length === 0 ? (
        <EmptyState
          title="Chưa có bảo hành"
          description="Bảo hành sẽ xuất hiện tại đây sau khi đơn hàng đủ điều kiện được hoàn tất."
          actionHref="/products?productType=IPHONE&inStock=true"
          actionLabel="Xem máy đang bán"
        />
      ) : null}
      {status === 'authenticated' &&
      isCustomer &&
      !contextLoading &&
      visibleError === null &&
      visibleWarranties.length > 0 ? (
        <WarrantyList
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
