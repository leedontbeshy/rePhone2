'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { CatalogVoucherShell, VOUCHERS_ROOT } from '@/components/backoffice';
import { Button, InlineAlert, Link } from '@/components/ui';
import { createVoucher, type CreateVoucherInput } from '@/lib/backoffice-voucher-api';
import { VoucherEditor } from './voucher-editor';
import styles from './voucher-admin.module.css';

const FORM_ID = 'create-voucher-form';

export function VoucherCreateView() {
  const { client } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationInFlightRef = useRef(false);

  function submit(input: CreateVoucherInput) {
    if (pending || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setPending(true);
    setError(null);
    void createVoucher(client, input)
      .then((voucher) => {
        router.push(`${VOUCHERS_ROOT}/${encodeURIComponent(voucher.id)}?created=1`);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught, 'Không thể tạo mã ưu đãi.'));
      })
      .finally(() => {
        operationInFlightRef.current = false;
        setPending(false);
      });
  }

  return (
    <CatalogVoucherShell
      breadcrumbs={[{ href: VOUCHERS_ROOT, label: 'Mã ưu đãi' }, { label: 'Tạo mã ưu đãi' }]}
    >
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headingCopy}>
            <h1>Tạo mã ưu đãi</h1>
            <p>Thiết lập điều kiện rõ ràng trước khi áp dụng cho khách hàng.</p>
          </div>
        </header>

        {error === null ? null : (
          <InlineAlert title="Chưa tạo được mã ưu đãi" tone="danger">
            {error}
          </InlineAlert>
        )}

        <VoucherEditor formId={FORM_ID} pending={pending} onSubmit={submit} />
        <footer className={styles.formActions} aria-label="Thao tác tạo mã ưu đãi">
          <Link className={styles.secondaryLink} href={VOUCHERS_ROOT}>
            Hủy
          </Link>
          <Button form={FORM_ID} loading={pending} loadingLabel="Đang lưu bản nháp" type="submit">
            Lưu bản nháp
          </Button>
        </footer>
      </div>
    </CatalogVoucherShell>
  );
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
