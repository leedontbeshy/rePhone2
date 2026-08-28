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

  const loadWarranties = useCallback(async () => {
    const options = await listCatalogWarrantyOptions(client);
    setWarranties(
      options.map((option) => ({
        id: option.value,
        name: option.name,
        defaultDays: option.defaultDays,
      })),
    );
  }, [client]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    void loadWarranties().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Không thể tải chính sách bảo hành.');
    });
  }, [isStaff, loadWarranties, status]);

  async function create(input: CatalogProductInput) {
    setPending(true);
    setError(null);
    try {
      const product = await createCatalogProduct(client, adapterCreateInput(input));
      router.push(`/backoffice/catalog/products/${product.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tạo sản phẩm.');
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
