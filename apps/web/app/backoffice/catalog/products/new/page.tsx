'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { CatalogVoucherShell } from '@/components/backoffice';
import {
  CatalogProductForm,
  type CatalogWarrantyChoice,
} from '@/components/backoffice/catalog/catalog-product-form';
import type { CatalogProductInput } from '@/components/backoffice/catalog/catalog-presenter';
import {
  createCatalogProduct,
  listCatalogWarrantyOptions,
  type CreateCatalogProductInput,
} from '@/lib/backoffice-catalog-api';

export default function NewCatalogProductPage() {
  const router = useRouter();
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [warranties, setWarranties] = useState<CatalogWarrantyChoice[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warrantyLoading, setWarrantyLoading] = useState(false);
  const [warrantyLoadError, setWarrantyLoadError] = useState<string | null>(null);
  const [warrantyReloadVersion, setWarrantyReloadVersion] = useState(0);

  const loadWarranties = useCallback(
    async (signal: AbortSignal) => {
      const options = await listCatalogWarrantyOptions(client, undefined, { signal });
      return options.map((option) => ({
        id: option.value,
        name: option.name,
        defaultDays: option.defaultDays,
      }));
    },
    [client],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setWarranties([]);
    setWarrantyLoadError(null);
    if (status !== 'authenticated' || !isStaff) {
      setWarrantyLoading(false);
      return () => {
        controller.abort();
      };
    }
    setWarrantyLoading(true);
    void loadWarranties(controller.signal)
      .then((options) => {
        if (active && !controller.signal.aborted) setWarranties(options);
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted) return;
        setWarrantyLoadError(
          caught instanceof Error ? caught.message : 'Không thể tải chính sách bảo hành.',
        );
      })
      .finally(() => {
        if (active && !controller.signal.aborted) setWarrantyLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [isStaff, loadWarranties, status, user?.id, warrantyReloadVersion]);

  async function create(input: CatalogProductInput) {
    setPending(true);
    setError(null);
    try {
      const product = await createCatalogProduct(client, adapterCreateInput(input));
      router.push(`/backoffice/catalog/products/${product.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tạo sản phẩm.');
      throw caught;
    } finally {
      setPending(false);
    }
  }

  return (
    <CatalogVoucherShell
      breadcrumbs={[
        { label: 'Vận hành' },
        { href: '/backoffice/catalog/products', label: 'Danh mục' },
        { label: 'Thêm sản phẩm' },
      ]}
    >
      <CatalogProductForm
        error={error}
        pending={pending}
        warranties={warranties}
        warrantyLoading={warrantyLoading}
        warrantyLoadError={warrantyLoadError}
        onCancel={() => {
          router.push('/backoffice/catalog/products');
        }}
        onNavigateAway={(href) => {
          router.push(href);
        }}
        onRetryWarranties={() => {
          setWarrantyReloadVersion((value) => value + 1);
        }}
        onSubmit={create}
      />
    </CatalogVoucherShell>
  );
}

function adapterCreateInput(input: CatalogProductInput): CreateCatalogProductInput {
  return {
    ...input,
    type: input.type === 'IPHONE' ? 'iphone' : 'accessory',
  };
}
