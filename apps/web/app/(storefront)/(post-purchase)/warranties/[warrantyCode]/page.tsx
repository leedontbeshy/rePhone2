'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  CollectionLoading,
  EmptyState,
  ErrorState,
  SafeNotFoundState,
} from '@/components/post-purchase';
import { WarrantyDetail } from '@/components/post-purchase/warranties/warranty-detail';
import { WarrantyDetailStateHeader } from '@/components/post-purchase/warranties/warranty-detail-state-header';
import styles from '@/components/post-purchase/warranties/warranties.module.css';
import {
  clearWarrantyGuestCredential,
  getCustomerWarranty,
  resolveWarrantyGuestCredential,
  warrantyAccessKey,
  WarrantyCustomerError,
  type WarrantyDetail as WarrantyDetailDto,
} from '@/lib/warranty-api';

export default function CustomerWarrantyDetailPage() {
  return (
    <Suspense
      fallback={
        <>
          <WarrantyDetailStateHeader />
          <CollectionLoading label="Đang tải chi tiết bảo hành…" />
        </>
      }
    >
      <CustomerWarrantyDetailContent />
    </Suspense>
  );
}

function CustomerWarrantyDetailContent() {
  const params = useParams<{ warrantyCode: string }>();
  const searchParams = useSearchParams();
  const warrantyCode = decodeURIComponent(params.warrantyCode);
  const orderNumber = searchParams.get('orderNumber');
  const { client, status, user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const accessKey = warrantyAccessKey(status, user?.id, orderNumber, warrantyCode);
  const [access, setAccess] = useState<{
    key: string;
    guestCredential: string | undefined;
  } | null>(null);
  const [detail, setDetail] = useState<WarrantyDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<WarrantyCustomerError | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const accessMatchesContext = access?.key === accessKey;
  const visibleDetail = accessMatchesContext ? detail : null;
  const visibleError = accessMatchesContext ? error : null;

  useEffect(() => {
    setAccess(null);
    setDetail(null);
    setError(null);
    setLoading(false);
    if (status === 'loading') return;
    setAccess({
      key: accessKey,
      guestCredential: resolveWarrantyGuestCredential(status, orderNumber, sessionStorage),
    });
  }, [accessKey, orderNumber, status]);

  useEffect(() => {
    if (access?.key !== accessKey || status === 'loading' || isStaff) return;
    let active = true;
    setLoading(true);
    setDetail(null);
    setError(null);
    const guestCredential = status === 'anonymous' ? access.guestCredential : undefined;
    void getCustomerWarranty(client, warrantyCode, guestCredential)
      .then((next) => {
        if (!active) return;
        setDetail(next);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        const nextError =
          caught instanceof WarrantyCustomerError
            ? caught
            : new WarrantyCustomerError('Không thể mở bảo hành này.', 'unknown');
        if (nextError.kind === 'not-found' && status === 'anonymous') {
          clearWarrantyGuestCredential(orderNumber, sessionStorage);
        }
        setError(nextError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [access, accessKey, client, isStaff, orderNumber, reloadVersion, status, warrantyCode]);

  return (
    <section className={styles.page}>
      <nav className={styles.breadcrumbs} aria-label="Đường dẫn">
        <Link
          href={
            isCustomer
              ? '/warranties'
              : orderNumber
                ? `/orders/${encodeURIComponent(orderNumber)}`
                : '/'
          }
        >
          {isCustomer ? 'Bảo hành' : 'Đơn hàng'}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{visibleDetail?.warrantyCode ?? warrantyCode}</span>
      </nav>
      {visibleDetail === null ? <WarrantyDetailStateHeader /> : null}
      {status === 'loading' || (!isStaff && !accessMatchesContext) || loading ? (
        <CollectionLoading label="Đang tải chi tiết bảo hành…" />
      ) : null}
      {isStaff ? (
        <EmptyState
          title="Khu vực dành cho khách hàng"
          description="Tài khoản nhân viên sử dụng khu vực quản lý bảo hành riêng."
          actionHref="/backoffice/warranties"
          actionLabel="Mở khu vực quản lý"
        />
      ) : null}
      {visibleError?.kind === 'not-found' ? <SafeNotFoundState /> : null}
      {visibleError !== null && visibleError.kind !== 'not-found' ? (
        <ErrorState
          message={visibleError.message}
          onRetry={() => {
            setReloadVersion((value) => value + 1);
          }}
        />
      ) : null}
      {!loading && visibleError === null && visibleDetail !== null ? (
        <WarrantyDetail detail={visibleDetail} />
      ) : null}
    </section>
  );
}
