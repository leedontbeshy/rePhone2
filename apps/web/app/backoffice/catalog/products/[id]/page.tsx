'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { CatalogVoucherShell } from '@/components/backoffice';
import {
  CatalogDetailView,
  type CatalogMediaMetadataInput,
  type CatalogProductDetailRecord,
  type CatalogProductUpdateInput,
  type CatalogVariantInput,
} from '@/components/backoffice/catalog/catalog-detail-view';
import type { CatalogWarrantyChoice } from '@/components/backoffice/catalog/catalog-product-form';
import {
  activateCatalogVariant,
  archiveCatalogProduct,
  archiveCatalogVariant,
  createCatalogVariant,
  deleteCatalogProductMedia,
  getCatalogProduct,
  listCatalogWarrantyOptions,
  publishCatalogProduct,
  updateCatalogProduct,
  updateCatalogProductMedia,
  updateCatalogVariant,
  uploadCatalogProductMedia,
  uploadCatalogVariantMedia,
  BackofficeCatalogError,
  type CatalogProductDetail,
  type CatalogVariantInput as AdapterVariantInput,
  type UpdateCatalogProductInput,
} from '@/lib/backoffice-catalog-api';
import styles from '@/components/backoffice/catalog/catalog.module.css';

export default function CatalogProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [product, setProduct] = useState<CatalogProductDetailRecord | null>(null);
  const [warranties, setWarranties] = useState<CatalogWarrantyChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetDialogsVersion, setResetDialogsVersion] = useState(0);

  const load = useCallback(async () => {
    const [detail, warrantyOptions] = await Promise.all([
      getCatalogProduct(client, productId),
      listCatalogWarrantyOptions(client),
    ]);
    setProduct(presentDetail(detail));
    setWarranties(
      warrantyOptions.map((option) => ({
        id: option.value,
        name: option.name,
        defaultDays: option.defaultDays,
      })),
    );
  }, [client, productId]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let current = true;
    setLoading(true);
    setError(null);
    void load()
      .catch((caught: unknown) => {
        if (current) {
          setError(caught instanceof Error ? caught.message : 'Không thể mở chi tiết sản phẩm.');
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isStaff, load, status]);

  async function run(key: string, operation: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      try {
        await load();
      } catch {
        setError('Thao tác đã hoàn tất nhưng chưa tải được thông tin mới. Hãy tải lại trang.');
      }
    } catch (caught) {
      if (caught instanceof BackofficeCatalogError && caught.requiresRefetch) {
        try {
          await load();
          setResetDialogsVersion((value) => value + 1);
          setError(
            'Dữ liệu sản phẩm vừa thay đổi. Đã tải lại thông tin mới nhất; hãy kiểm tra rồi thao tác lại.',
          );
        } catch {
          setError(
            'Dữ liệu sản phẩm vừa thay đổi nhưng chưa tải lại được. Hãy tải lại trang trước khi tiếp tục.',
          );
        }
      } else {
        setError(caught instanceof Error ? caught.message : 'Chưa thể hoàn tất thao tác.');
      }
      throw caught;
    } finally {
      setBusy(null);
    }
  }

  const breadcrumbs = [
    { label: 'Vận hành' },
    { href: '/backoffice/catalog/products', label: 'Danh mục' },
    { label: product?.name ?? 'Chi tiết sản phẩm' },
  ];

  return (
    <CatalogVoucherShell breadcrumbs={breadcrumbs}>
      {loading && product === null ? (
        <section className={styles.loadingState} role="status">
          <h1>Đang tải sản phẩm</h1>
          <p>Thông tin mới nhất sẽ xuất hiện trong giây lát.</p>
        </section>
      ) : null}
      {!loading && product === null ? (
        <section className={styles.emptyState}>
          <h1>Chưa thể mở sản phẩm</h1>
          <p>{error ?? 'Không tìm thấy sản phẩm hoặc sản phẩm vừa được thay đổi.'}</p>
          <button className={styles.secondaryLink} type="button" onClick={() => void load()}>
            Tải lại
          </button>
        </section>
      ) : null}
      {product === null ? null : (
        <CatalogDetailView
          busy={busy}
          error={error}
          notice={notice}
          product={product}
          resetDialogsVersion={resetDialogsVersion}
          warranties={warranties}
          onActivateVariant={(variantId) =>
            run(
              `activate-variant:${variantId}`,
              () => activateCatalogVariant(client, variantId),
              'Đã mở bán biến thể.',
            )
          }
          onArchiveProduct={(reason) =>
            run(
              'archive-product',
              () => archiveCatalogProduct(client, productId, reason),
              'Đã lưu trữ sản phẩm.',
            )
          }
          onArchiveVariant={(variantId, reason) =>
            run(
              `archive-variant:${variantId}`,
              () => archiveCatalogVariant(client, variantId, reason),
              'Đã lưu trữ biến thể.',
            )
          }
          onCreateVariant={(input) =>
            run(
              'create-variant',
              () => createCatalogVariant(client, productId, adapterVariantInput(input)),
              'Đã thêm biến thể.',
            )
          }
          onDeleteMedia={(mediaId) =>
            run(
              `delete-media:${mediaId}`,
              () => deleteCatalogProductMedia(client, mediaId),
              'Đã xóa hình ảnh.',
            )
          }
          onPublish={() =>
            run(
              'publish-product',
              () => publishCatalogProduct(client, productId),
              'Sản phẩm đã được mở bán.',
            )
          }
          onUpdateMedia={(mediaId, input) =>
            run(
              `update-media:${mediaId}`,
              () => updateCatalogProductMedia(client, mediaId, input),
              'Đã cập nhật hình ảnh.',
            )
          }
          onUpdateProduct={(input) =>
            run(
              'update-product',
              () => updateCatalogProduct(client, productId, adapterProductUpdate(input)),
              'Đã cập nhật sản phẩm.',
            )
          }
          onUpdateVariant={(variantId, input) =>
            run(
              `update-variant:${variantId}`,
              () => updateCatalogVariant(client, variantId, adapterVariantInput(input)),
              'Đã cập nhật biến thể.',
            )
          }
          onUploadMedia={(owner, ownerId, file, input) =>
            run(
              `upload-media:${ownerId}`,
              () =>
                owner === 'product'
                  ? uploadCatalogProductMedia(client, ownerId, adapterMediaUpload(file, input))
                  : uploadCatalogVariantMedia(client, ownerId, adapterMediaUpload(file, input)),
              'Đã tải hình ảnh lên.',
            )
          }
        />
      )}
    </CatalogVoucherShell>
  );
}

function presentDetail(product: CatalogProductDetail): CatalogProductDetailRecord {
  return {
    brand: product.brand,
    chipset: product.chipset,
    description: product.description,
    id: product.id,
    media: product.media,
    name: product.name,
    primaryMedia: product.primaryMedia,
    ramGb: product.ramGb,
    releaseYear: product.releaseYear,
    screenSizeInches: product.screenSizeInches,
    seoDescription: product.seoDescription,
    seoTitle: product.seoTitle,
    slug: product.slug,
    status: presentStatus(product.status),
    type: product.type === 'iphone' ? 'IPHONE' : 'ACCESSORY',
    updatedAt: product.updatedAt,
    variants: product.variants.map((variant) => ({
      attributes: variant.attributes,
      colorHex: variant.colorHex,
      colorName: variant.colorName,
      compareAtPrice: variant.compareAtPrice,
      displayName: variant.displayName,
      id: variant.id,
      inventoryMode: variant.inventoryMode === 'serialized' ? 'SERIALIZED' : 'QUANTITY',
      media: variant.media,
      salePrice: variant.salePrice,
      sku: variant.sku,
      status: presentStatus(variant.status),
      storageCapacityGb: variant.storageCapacityGb,
      warrantyPolicyId: variant.warrantyPolicyId,
    })),
    warrantyPolicyId: product.warrantyPolicyId,
  };
}

function presentStatus(status: CatalogProductDetail['status']): 'ACTIVE' | 'ARCHIVED' | 'DRAFT' {
  if (status === 'active') return 'ACTIVE';
  if (status === 'archived') return 'ARCHIVED';
  return 'DRAFT';
}

function adapterProductUpdate(input: CatalogProductUpdateInput): UpdateCatalogProductInput {
  return input;
}

function adapterVariantInput(input: CatalogVariantInput): AdapterVariantInput {
  const { attributes, ...fields } = input;
  return {
    ...fields,
    ...(attributes === undefined
      ? {}
      : { attributes: attributes.map((attribute) => ({ ...attribute })) }),
  };
}

function adapterMediaUpload(file: File, input: CatalogMediaMetadataInput) {
  return {
    file,
    ...(input.altText === null || input.altText === undefined || input.altText === ''
      ? {}
      : { altText: input.altText }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
  };
}
