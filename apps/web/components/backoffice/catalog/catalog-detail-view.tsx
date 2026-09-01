'use client';

import {
  ArrowSquareOutIcon,
  CheckIcon,
  DotsThreeIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { BackofficeActionDialog, CatalogVoucherStatusChip } from '@/components/backoffice';
import { useModalDialogLifecycle } from '@/components/ui/modal-dialog-lifecycle';
import { validateCatalogMediaFile } from '@/lib/backoffice-catalog-api';
import { CatalogMediaImage, type CatalogMediaSource } from './catalog-media';
import type { CatalogWarrantyChoice } from './catalog-product-form';
import {
  catalogDisplayCode,
  catalogProductTypeLabel,
  catalogStatusLabel,
  formatCatalogDateTime,
  formatCatalogMoney,
  type CatalogProductType,
  type CatalogRecordStatus,
} from './catalog-presenter';
import styles from './catalog.module.css';

export { validateCatalogMediaFile } from '@/lib/backoffice-catalog-api';

export interface CatalogMediaRecord extends CatalogMediaSource {
  readonly id: string;
  readonly sortOrder: number;
}

export interface CatalogVariantRecord {
  readonly attributes: readonly CatalogAttributeRecord[];
  readonly colorHex?: string | null;
  readonly colorName?: string | null;
  readonly compareAtPrice?: string | null;
  readonly displayName: string;
  readonly id: string;
  readonly inventoryMode: 'QUANTITY' | 'SERIALIZED';
  readonly media: readonly CatalogMediaRecord[];
  readonly salePrice?: string | null;
  readonly sku: string;
  readonly status: CatalogRecordStatus;
  readonly storageCapacityGb?: number | null;
  readonly warrantyPolicyId?: string | null;
}

export interface CatalogAttributeRecord {
  readonly hidden?: boolean;
  readonly name: string;
  readonly originalName?: string;
  readonly originalValue?: unknown;
  readonly value: string;
}

export interface CatalogProductDetailRecord {
  readonly brand: string;
  readonly chipset?: string | null;
  readonly description?: string | null;
  readonly id: string;
  readonly media: readonly CatalogMediaRecord[];
  readonly name: string;
  readonly primaryMedia: CatalogMediaRecord | null;
  readonly ramGb?: number | null;
  readonly releaseYear?: number | null;
  readonly screenSizeInches?: string | null;
  readonly seoDescription?: string | null;
  readonly seoTitle?: string | null;
  readonly slug: string;
  readonly status: CatalogRecordStatus;
  readonly type: CatalogProductType;
  readonly updatedAt: string;
  readonly variants: readonly CatalogVariantRecord[];
  readonly warrantyPolicyId?: string | null;
}

export interface CatalogProductUpdateInput {
  readonly brand?: string;
  readonly chipset?: string;
  readonly description?: string;
  readonly name?: string;
  readonly ramGb?: number;
  readonly releaseYear?: number;
  readonly screenSizeInches?: string;
  readonly seoDescription?: string;
  readonly seoTitle?: string;
  readonly slug?: string;
  readonly warrantyPolicyId?: string;
}

export interface CatalogVariantInput {
  readonly attributes?: readonly CatalogAttributeRecord[];
  readonly colorHex?: string | null;
  readonly colorName?: string | null;
  readonly compareAtPrice?: string | null;
  readonly displayName: string;
  readonly salePrice?: string;
  readonly sku: string;
  readonly storageCapacityGb?: number;
  readonly warrantyPolicyId?: string | null;
}

export interface CatalogMediaMetadataInput {
  readonly altText?: string | null;
  readonly sortOrder?: number;
}

interface CatalogDetailViewProps {
  readonly busy?: string | null;
  readonly error?: string | null;
  readonly notice?: string | null;
  readonly resetDialogsVersion?: number;
  readonly product: CatalogProductDetailRecord;
  readonly warranties: readonly CatalogWarrantyChoice[];
  readonly onActivateVariant: (variantId: string) => Promise<void> | void;
  readonly onArchiveProduct: (reason: string) => Promise<void> | void;
  readonly onArchiveVariant: (variantId: string, reason: string) => Promise<void> | void;
  readonly onCreateVariant: (input: CatalogVariantInput) => Promise<void> | void;
  readonly onDeleteMedia: (mediaId: string) => Promise<void> | void;
  readonly onPublish: () => Promise<void> | void;
  readonly onUpdateMedia: (
    mediaId: string,
    input: CatalogMediaMetadataInput,
  ) => Promise<void> | void;
  readonly onUpdateProduct: (input: CatalogProductUpdateInput) => Promise<void> | void;
  readonly onUpdateVariant: (variantId: string, input: CatalogVariantInput) => Promise<void> | void;
  readonly onUploadMedia: (
    owner: 'product' | 'variant',
    ownerId: string,
    file: File,
    input: CatalogMediaMetadataInput,
  ) => Promise<void> | void;
}

type ActiveDialog =
  | { kind: 'activate-variant'; variant: CatalogVariantRecord }
  | { kind: 'archive-product' }
  | { kind: 'archive-variant'; variant: CatalogVariantRecord }
  | { kind: 'create-variant' }
  | { kind: 'delete-media'; media: CatalogMediaRecord }
  | { kind: 'edit-media'; media: CatalogMediaRecord }
  | { kind: 'edit-product' }
  | { kind: 'edit-variant'; variant: CatalogVariantRecord }
  | { kind: 'publish-product' }
  | null;

export function CatalogDetailView({
  busy = null,
  error = null,
  notice = null,
  resetDialogsVersion = 0,
  product,
  warranties,
  onActivateVariant,
  onArchiveProduct,
  onArchiveVariant,
  onCreateVariant,
  onDeleteMedia,
  onPublish,
  onUpdateMedia,
  onUpdateProduct,
  onUpdateVariant,
  onUploadMedia,
}: CatalogDetailViewProps) {
  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const productUploadRef = useRef<HTMLInputElement>(null);
  const ready = catalogPublishReadiness(product);
  const currentError = localError ?? error;

  useEffect(() => {
    setDialog(null);
    setReason('');
    setLocalError(null);
  }, [resetDialogsVersion]);

  async function upload(
    owner: 'product' | 'variant',
    ownerId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    const message = validateCatalogMediaFile(file);
    if (message !== null) {
      setLocalError(message);
      return;
    }
    setLocalError(null);
    const ownerMedia =
      owner === 'product'
        ? product.media
        : (product.variants.find((variant) => variant.id === ownerId)?.media ?? []);
    const sortOrder = nextCatalogMediaSortOrder(ownerMedia);
    try {
      await onUploadMedia(owner, ownerId, file, {
        sortOrder,
        ...(owner === 'product' ? { altText: product.name } : {}),
      });
    } catch {
      // The route projects the domain error into the page alert.
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.detailHero}>
        <div className={styles.detailIdentity}>
          <CatalogMediaImage
            className={styles.detailThumbnail}
            fallbackLabel={`Chưa có ảnh cho ${product.name}`}
            media={product.primaryMedia}
            priority
          />
          <div className={styles.detailTitleBlock}>
            <div className={styles.detailTitleRow}>
              <h1>{product.name}</h1>
              <CatalogVoucherStatusChip
                label={catalogStatusLabel(product.status)}
                status={product.status}
              />
            </div>
            <span className={styles.detailCode}>{catalogDisplayCode(product.slug)}</span>
            <p>Cập nhật thông tin, biến thể và hình ảnh sản phẩm.</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {product.status === 'ACTIVE' ? (
            <Link
              className={styles.secondaryLink}
              href={`/products/${product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Xem trên cửa hàng
              <ArrowSquareOutIcon aria-hidden="true" size={18} />
            </Link>
          ) : null}
          {product.status !== 'ARCHIVED' ? (
            <button
              className={styles.secondaryLink}
              disabled={busy !== null}
              type="button"
              onClick={() => {
                setDialog({ kind: 'edit-product' });
              }}
            >
              Lưu thay đổi
            </button>
          ) : null}
          {product.status === 'DRAFT' ? (
            <button
              className={styles.primaryLink}
              disabled={busy !== null || !ready.ready}
              type="button"
              onClick={() => {
                setDialog({ kind: 'publish-product' });
              }}
            >
              Mở bán
            </button>
          ) : null}
          {product.status !== 'ARCHIVED' ? (
            <button
              aria-label="Lưu trữ sản phẩm"
              className={styles.iconButton}
              disabled={busy !== null}
              type="button"
              onClick={() => {
                setReason('');
                setDialog({ kind: 'archive-product' });
              }}
            >
              <DotsThreeIcon aria-hidden="true" size={22} weight="bold" />
            </button>
          ) : null}
        </div>
      </header>

      {currentError === null ? null : (
        <div className={styles.errorBanner} role="alert">
          {currentError}
        </div>
      )}
      {notice === null ? null : (
        <div className={styles.noticeBanner} aria-live="polite" role="status">
          {notice}
        </div>
      )}

      <nav className={styles.detailTabs} aria-label="Nội dung sản phẩm">
        <a className={styles.detailTab} data-current="true" href="#product-information">
          Thông tin
        </a>
        <a className={styles.detailTab} href="#product-variants">
          Biến thể <span>{String(product.variants.length)}</span>
        </a>
        <a className={styles.detailTab} href="#product-media">
          Hình ảnh <span>{String(product.media.length)}</span>
        </a>
        <a className={styles.detailTab} href="#product-search-display">
          Hiển thị
        </a>
      </nav>

      <div className={styles.detailLayout}>
        <div className={styles.detailMain}>
          <section className={styles.panel} id="product-information">
            <div className={styles.sectionHeading}>
              <h2>Thông tin sản phẩm</h2>
              {product.status === 'ARCHIVED' ? null : (
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => {
                    setDialog({ kind: 'edit-product' });
                  }}
                >
                  Chỉnh sửa thông tin
                  <PencilSimpleIcon aria-hidden="true" size={16} />
                </button>
              )}
            </div>
            <dl className={styles.descriptionList}>
              <CatalogDescription label="Tên sản phẩm" value={product.name} />
              <CatalogDescription label="Năm ra mắt" value={optionalNumber(product.releaseYear)} />
              <CatalogDescription label="Đường dẫn" value={product.slug} />
              <CatalogDescription
                label="Dung lượng RAM"
                value={
                  product.ramGb === null || product.ramGb === undefined
                    ? 'Không áp dụng'
                    : `${String(product.ramGb)} GB`
                }
              />
              <CatalogDescription
                label="Loại sản phẩm"
                value={catalogProductTypeLabel(product.type)}
              />
              <CatalogDescription
                label="Kích thước màn hình"
                value={
                  product.screenSizeInches ? `${product.screenSizeInches} inch` : 'Không áp dụng'
                }
              />
              <CatalogDescription label="Thương hiệu" value={product.brand} />
              <CatalogDescription label="Bộ xử lý" value={product.chipset ?? 'Không áp dụng'} />
            </dl>
          </section>

          <section className={styles.panel} id="product-variants">
            <div className={styles.sectionHeading}>
              <h2>Biến thể</h2>
              {product.status === 'ARCHIVED' ? null : (
                <button
                  className={styles.outlineButton}
                  type="button"
                  onClick={() => {
                    setDialog({ kind: 'create-variant' });
                  }}
                >
                  <PlusIcon aria-hidden="true" size={16} />
                  Thêm biến thể
                </button>
              )}
            </div>
            {product.variants.length === 0 ? (
              <div className={styles.emptyState}>
                <h2>Chưa có biến thể</h2>
                <p>Thêm cấu hình đang bán trước khi mở bán sản phẩm.</p>
              </div>
            ) : (
              <div className={styles.variantList}>
                {product.variants.map((variant) => (
                  <CatalogVariantRow
                    busy={busy}
                    key={variant.id}
                    product={product}
                    variant={variant}
                    onActivate={() => {
                      setDialog({ kind: 'activate-variant', variant });
                    }}
                    onArchive={() => {
                      setReason('');
                      setDialog({ kind: 'archive-variant', variant });
                    }}
                    onEdit={() => {
                      setDialog({ kind: 'edit-variant', variant });
                    }}
                    onDeleteMedia={(media) => {
                      setDialog({ kind: 'delete-media', media });
                    }}
                    onEditMedia={(media) => {
                      setDialog({ kind: 'edit-media', media });
                    }}
                    onUpload={(event) => upload('variant', variant.id, event)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel} id="product-media">
            <div className={styles.mediaHeading}>
              <h2>Hình ảnh sản phẩm</h2>
              {product.status === 'ARCHIVED' ? null : (
                <button
                  className={styles.outlineButton}
                  disabled={busy !== null}
                  type="button"
                  onClick={() => productUploadRef.current?.click()}
                >
                  <UploadSimpleIcon aria-hidden="true" size={17} />
                  Tải ảnh
                </button>
              )}
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-hidden="true"
                className={styles.hiddenFileInput}
                ref={productUploadRef}
                tabIndex={-1}
                type="file"
                onChange={(event) => {
                  void upload('product', product.id, event);
                }}
              />
            </div>
            {product.media.length === 0 ? (
              <div className={styles.emptyState}>
                <h2>Chưa có hình ảnh</h2>
                <p>Tải ảnh rõ nét để khách hàng nhận diện đúng sản phẩm.</p>
              </div>
            ) : (
              <div className={styles.mediaGrid}>
                {product.media.map((media, index) => (
                  <article className={styles.mediaCard} data-primary={index === 0} key={media.id}>
                    <div className={styles.mediaFrame}>
                      {index === 0 ? <span className={styles.primaryBadge}>Ảnh chính</span> : null}
                      <CatalogMediaImage
                        className={styles.mediaThumbnail}
                        fallbackLabel={`Không tải được ảnh ${String(index + 1)}`}
                        media={media}
                      />
                    </div>
                    <div className={styles.mediaCopy}>
                      <strong>{media.altText?.trim() || `Ảnh ${String(index + 1)}`}</strong>
                      <span>Thứ tự {String(media.sortOrder + 1)}</span>
                    </div>
                    {product.status === 'ARCHIVED' ? null : (
                      <div className={styles.mediaActions}>
                        <button
                          className={styles.textButton}
                          type="button"
                          onClick={() => {
                            setDialog({ kind: 'edit-media', media });
                          }}
                        >
                          Sửa
                        </button>
                        <button
                          className={styles.textButton}
                          disabled={busy !== null}
                          type="button"
                          onClick={() => {
                            setDialog({ kind: 'delete-media', media });
                          }}
                        >
                          Xóa
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            <p className={styles.uploadHelp}>Nhận ảnh JPEG, PNG hoặc WebP, tối đa 8 MB.</p>
          </section>

          <section className={styles.panel} id="product-search-display">
            <div className={styles.sectionHeading}>
              <h2>Hiển thị trên trang tìm kiếm</h2>
            </div>
            <dl className={styles.descriptionList}>
              <CatalogDescription label="Tiêu đề" value={product.seoTitle ?? 'Chưa thiết lập'} />
              <CatalogDescription
                label="Mô tả"
                value={product.seoDescription ?? 'Chưa thiết lập'}
              />
            </dl>
          </section>
        </div>

        <aside className={styles.sideStack} aria-label="Trạng thái sản phẩm">
          {product.status === 'DRAFT' ? (
            <section className={styles.asideCard}>
              <h2>Sẵn sàng mở bán</h2>
              <ul className={styles.publishChecklist}>
                <PublishCheck complete={ready.hasActiveVariant}>Có biến thể đang bán</PublishCheck>
                <PublishCheck complete={ready.hasWarranty}>
                  Đã chọn chính sách bảo hành
                </PublishCheck>
                <PublishCheck complete={ready.hasMedia}>Có ảnh sản phẩm (nên có)</PublishCheck>
              </ul>
              <button
                className={styles.primaryLink}
                disabled={!ready.ready || busy !== null}
                type="button"
                onClick={() => {
                  setDialog({ kind: 'publish-product' });
                }}
              >
                Mở bán
              </button>
            </section>
          ) : null}

          <section className={styles.asideCard}>
            <h2>Trạng thái</h2>
            <CatalogVoucherStatusChip
              label={catalogStatusLabel(product.status)}
              status={product.status}
            />
            <p className={styles.statusDescription}>{catalogStatusDescription(product.status)}</p>
          </section>

          <section className={[styles.asideCard, styles.updatedCard].filter(Boolean).join(' ')}>
            <h2>Cập nhật gần nhất</h2>
            <time dateTime={product.updatedAt}>{formatCatalogDateTime(product.updatedAt)}</time>
            <span>Thông tin gần nhất đã được đồng bộ.</span>
          </section>

          {product.status === 'ARCHIVED' ? null : (
            <button
              className={styles.destructiveOutline}
              disabled={busy !== null}
              type="button"
              onClick={() => {
                setReason('');
                setDialog({ kind: 'archive-product' });
              }}
            >
              Lưu trữ sản phẩm
            </button>
          )}
        </aside>
      </div>

      <BackofficeActionDialog
        confirmLabel="Mở bán sản phẩm"
        description="Sản phẩm sẽ xuất hiện trên cửa hàng sau khi hệ thống xác nhận các điều kiện mở bán."
        error={dialog?.kind === 'publish-product' ? currentError : null}
        pending={busy === 'publish-product'}
        open={dialog?.kind === 'publish-product'}
        title={`Mở bán ${product.name}?`}
        onCancel={() => {
          setDialog(null);
        }}
        onConfirm={() => {
          closeDialogAfter(onPublish());
        }}
      />

      <BackofficeActionDialog
        confirmLabel="Lưu trữ sản phẩm"
        description="Sản phẩm sẽ ngừng hiển thị trên cửa hàng và không thể khôi phục trong giao diện này."
        destructive
        error={dialog?.kind === 'archive-product' ? currentError : null}
        pending={busy === 'archive-product'}
        open={dialog?.kind === 'archive-product'}
        reason={{ value: reason, onChange: setReason }}
        title={`Lưu trữ ${product.name}?`}
        onCancel={() => {
          setDialog(null);
          setReason('');
        }}
        onConfirm={() => {
          closeDialogAfter(onArchiveProduct(reason), true);
        }}
      />

      <BackofficeActionDialog
        confirmLabel="Lưu trữ biến thể"
        description="Biến thể này sẽ ngừng bán và không thể khôi phục trong giao diện này."
        destructive
        error={dialog?.kind === 'archive-variant' ? currentError : null}
        pending={
          dialog?.kind === 'archive-variant' && busy === `archive-variant:${dialog.variant.id}`
        }
        open={dialog?.kind === 'archive-variant'}
        reason={{ value: reason, onChange: setReason }}
        title={
          dialog?.kind === 'archive-variant'
            ? `Lưu trữ ${dialog.variant.displayName}?`
            : 'Lưu trữ biến thể?'
        }
        onCancel={() => {
          setDialog(null);
          setReason('');
        }}
        onConfirm={() => {
          if (dialog?.kind !== 'archive-variant') return;
          closeDialogAfter(onArchiveVariant(dialog.variant.id, reason), true);
        }}
      />

      <BackofficeActionDialog
        confirmLabel="Mở bán biến thể"
        description="Biến thể sẽ sẵn sàng để sử dụng trong sản phẩm đang bán."
        error={dialog?.kind === 'activate-variant' ? currentError : null}
        open={dialog?.kind === 'activate-variant'}
        pending={
          dialog?.kind === 'activate-variant' && busy === `activate-variant:${dialog.variant.id}`
        }
        title={
          dialog?.kind === 'activate-variant'
            ? `Mở bán ${dialog.variant.displayName}?`
            : 'Mở bán biến thể?'
        }
        onCancel={() => {
          setDialog(null);
        }}
        onConfirm={() => {
          if (dialog?.kind !== 'activate-variant') return;
          closeDialogAfter(onActivateVariant(dialog.variant.id));
        }}
      />

      <BackofficeActionDialog
        confirmLabel="Xóa hình ảnh"
        description="Hình ảnh sẽ bị gỡ khỏi sản phẩm và không thể khôi phục trong giao diện này."
        destructive
        error={dialog?.kind === 'delete-media' ? currentError : null}
        open={dialog?.kind === 'delete-media'}
        pending={dialog?.kind === 'delete-media' && busy === `delete-media:${dialog.media.id}`}
        title="Xóa hình ảnh này?"
        onCancel={() => {
          setDialog(null);
        }}
        onConfirm={() => {
          if (dialog?.kind !== 'delete-media') return;
          closeDialogAfter(onDeleteMedia(dialog.media.id));
        }}
      />

      {dialog?.kind === 'create-variant' || dialog?.kind === 'edit-variant' ? (
        <CatalogVariantDialog
          busy={busy !== null}
          operationError={currentError}
          product={product}
          variant={dialog.kind === 'edit-variant' ? dialog.variant : undefined}
          warranties={warranties}
          onCancel={() => {
            setDialog(null);
          }}
          onSubmit={(input) => {
            const operation =
              dialog.kind === 'edit-variant'
                ? onUpdateVariant(dialog.variant.id, input)
                : onCreateVariant(input);
            closeDialogAfter(operation);
          }}
        />
      ) : null}

      {dialog?.kind === 'edit-product' ? (
        <CatalogProductEditDialog
          busy={busy !== null}
          operationError={currentError}
          product={product}
          warranties={warranties}
          onCancel={() => {
            setDialog(null);
          }}
          onSubmit={(input) => {
            closeDialogAfter(onUpdateProduct(input));
          }}
        />
      ) : null}

      {dialog?.kind === 'edit-media' ? (
        <CatalogMediaEditDialog
          busy={busy !== null}
          media={dialog.media}
          operationError={currentError}
          onCancel={() => {
            setDialog(null);
          }}
          onSubmit={(input) => {
            closeDialogAfter(onUpdateMedia(dialog.media.id, input));
          }}
        />
      ) : null}
    </div>
  );

  function closeDialogAfter(operation: Promise<void> | void, clearReason = false) {
    void Promise.resolve(operation)
      .then(() => {
        setDialog(null);
        if (clearReason) setReason('');
      })
      .catch(() => {
        // Keep the dialog open so its inline message remains beside the attempted action.
      });
  }
}

function CatalogVariantRow({
  busy,
  product,
  variant,
  onActivate,
  onArchive,
  onEdit,
  onDeleteMedia,
  onEditMedia,
  onUpload,
}: Readonly<{
  busy: string | null;
  product: CatalogProductDetailRecord;
  variant: CatalogVariantRecord;
  onActivate: () => void;
  onArchive: () => void;
  onEdit: () => void;
  onDeleteMedia: (media: CatalogMediaRecord) => void;
  onEditMedia: (media: CatalogMediaRecord) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void> | void;
}>) {
  const fileId = `variant-media-${variant.id}`;
  return (
    <article className={styles.variantRow}>
      <div className={styles.variantIdentity}>
        <CatalogMediaImage
          className={styles.variantThumbnail}
          fallbackLabel={`Chưa có ảnh cho ${variant.displayName}`}
          media={variant.media[0] ?? null}
        />
        <div className={styles.variantCopy}>
          <h3>{variant.displayName}</h3>
          <span className={styles.variantCode}>{variant.sku}</span>
        </div>
      </div>
      <span className={styles.variantPrice}>
        {product.type === 'IPHONE' ? 'Theo từng máy' : formatCatalogMoney(variant.salePrice)}
      </span>
      <span className={styles.variantStatus}>
        <CatalogVoucherStatusChip
          label={catalogStatusLabel(variant.status)}
          status={variant.status}
        />
      </span>
      <div className={styles.variantActions}>
        {variant.status === 'DRAFT' ? (
          <button
            className={styles.textButton}
            disabled={busy !== null}
            type="button"
            onClick={onActivate}
          >
            Mở bán
          </button>
        ) : null}
        {variant.status === 'ARCHIVED' || product.status === 'ARCHIVED' ? null : (
          <>
            <button
              className={styles.iconButton}
              aria-label={`Sửa ${variant.displayName}`}
              type="button"
              onClick={onEdit}
            >
              <PencilSimpleIcon aria-hidden="true" size={17} />
            </button>
            <label
              className={[styles.iconButton, styles.uploadLabel].filter(Boolean).join(' ')}
              htmlFor={fileId}
            >
              <UploadSimpleIcon aria-hidden="true" size={17} />
              <span className="rp-visually-hidden">Tải ảnh cho {variant.displayName}</span>
            </label>
            <input
              accept="image/jpeg,image/png,image/webp"
              className={styles.hiddenFileInput}
              id={fileId}
              type="file"
              onChange={(event) => {
                void onUpload(event);
              }}
            />
            <button
              aria-label={`Lưu trữ ${variant.displayName}`}
              className={styles.iconButton}
              disabled={busy !== null}
              type="button"
              onClick={onArchive}
            >
              <DotsThreeIcon aria-hidden="true" size={20} weight="bold" />
            </button>
          </>
        )}
      </div>
      {variant.media.length === 0 ? null : (
        <div className={styles.variantMediaGrid} aria-label={`Hình ảnh ${variant.displayName}`}>
          {variant.media.map((media, index) => (
            <article className={styles.variantMediaCard} key={media.id}>
              <CatalogMediaImage
                className={styles.variantMediaThumbnail}
                fallbackLabel={`Không tải được ảnh ${String(index + 1)} của ${variant.displayName}`}
                media={media}
              />
              <div className={styles.variantMediaCopy}>
                <strong>{media.altText?.trim() || `Ảnh ${String(index + 1)}`}</strong>
                <span>Thứ tự {String(media.sortOrder + 1)}</span>
              </div>
              <div className={styles.mediaActions}>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => {
                    onEditMedia(media);
                  }}
                >
                  Sửa
                </button>
                <button
                  className={styles.textButton}
                  disabled={busy !== null}
                  type="button"
                  onClick={() => {
                    onDeleteMedia(media);
                  }}
                >
                  Xóa
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}

function CatalogVariantDialog({
  busy,
  operationError,
  product,
  variant,
  warranties,
  onCancel,
  onSubmit,
}: Readonly<{
  busy: boolean;
  operationError?: string | null;
  product: CatalogProductDetailRecord;
  variant?: CatalogVariantRecord | undefined;
  warranties: readonly CatalogWarrantyChoice[];
  onCancel: () => void;
  onSubmit: (input: CatalogVariantInput) => void;
}>) {
  const { dialogRef, onDialogClose } = useModalDialogLifecycle(true);
  const [draft, setDraft] = useState(() => variantDraftFrom(variant));
  const [error, setError] = useState<string | null>(null);
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = variantInputFromDraft(draft, product.type, variant);
    if (input instanceof Error) {
      setError(input.message);
      return;
    }
    onSubmit(input);
  }
  function updateAttribute(index: number, field: keyof CatalogAttributeRecord, value: string) {
    setDraft((current) => ({
      ...current,
      attributes: current.attributes.map((attribute, attributeIndex) =>
        attributeIndex === index ? { ...attribute, [field]: value } : attribute,
      ),
    }));
  }
  function addAttribute() {
    setDraft((current) => ({
      ...current,
      attributes: [...current.attributes, { name: '', value: '' }],
    }));
  }
  function removeAttribute(index: number) {
    setDraft((current) => ({
      ...current,
      attributes:
        current.attributes.filter((attribute) => attribute.hidden !== true).length === 1
          ? current.attributes.map((attribute, attributeIndex) =>
              attributeIndex === index ? { name: '', value: '' } : attribute,
            )
          : current.attributes.filter((_, attributeIndex) => attributeIndex !== index),
    }));
  }
  return (
    <dialog
      aria-labelledby="variant-dialog-title"
      className={styles.dialogPanel}
      ref={dialogRef}
      onClose={onDialogClose}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form onSubmit={submit}>
        <div className={styles.dialogHeading}>
          <h2 id="variant-dialog-title">
            {variant === undefined ? 'Thêm biến thể' : 'Chỉnh sửa biến thể'}
          </h2>
          <p>Nhập thông tin khách hàng cần thấy khi chọn cấu hình.</p>
        </div>
        {error === null ? null : (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}
        {operationError === null || operationError === undefined ? null : (
          <div className={styles.errorBanner} role="alert">
            {operationError}
          </div>
        )}
        <div className={styles.variantSections}>
          <section aria-labelledby="variant-identity-title" className={styles.variantFormSection}>
            <div className={styles.variantSectionHeading}>
              <h3 id="variant-identity-title">Nhận diện</h3>
              <p>Tên và mã giúp nhân viên tìm đúng biến thể khi vận hành.</p>
            </div>
            <div className={styles.fieldGrid}>
              <DialogField id="variant-name" label="Tên phiên bản *">
                <input
                  className={styles.nativeInput}
                  id="variant-name"
                  maxLength={255}
                  required
                  value={draft.displayName}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, displayName: event.target.value }));
                  }}
                />
              </DialogField>
              <DialogField id="variant-sku" label="Mã biến thể *">
                <input
                  className={styles.nativeInput}
                  id="variant-sku"
                  maxLength={64}
                  required
                  value={draft.sku}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, sku: event.target.value.toUpperCase() }));
                  }}
                />
              </DialogField>
            </div>
          </section>

          {product.type === 'IPHONE' ? (
            <section aria-labelledby="variant-config-title" className={styles.variantFormSection}>
              <div className={styles.variantSectionHeading}>
                <h3 id="variant-config-title">Cấu hình</h3>
                <p>Thông tin khách hàng dùng để phân biệt các phiên bản của cùng dòng máy.</p>
              </div>
              <div className={styles.fieldGrid}>
                <DialogField id="variant-storage" label="Dung lượng *">
                  <input
                    className={styles.nativeInput}
                    id="variant-storage"
                    inputMode="numeric"
                    min={1}
                    required
                    type="number"
                    value={draft.storageCapacityGb}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        storageCapacityGb: event.target.value,
                      }));
                    }}
                  />
                </DialogField>
                <DialogField id="variant-color" label="Tên màu *">
                  <input
                    className={styles.nativeInput}
                    id="variant-color"
                    maxLength={255}
                    required
                    value={draft.colorName}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, colorName: event.target.value }));
                    }}
                  />
                </DialogField>
                <DialogField
                  className={styles.wideField}
                  id="variant-color-hex"
                  label="Màu hiển thị"
                >
                  <div className={styles.colorControl}>
                    <input
                      aria-label="Chọn màu hiển thị"
                      className={styles.colorPicker}
                      type="color"
                      value={colorPickerValue(draft.colorHex)}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          colorHex: event.target.value.toUpperCase(),
                        }));
                      }}
                    />
                    <input
                      className={styles.nativeInput}
                      id="variant-color-hex"
                      pattern="#[0-9A-Fa-f]{6}"
                      placeholder="#A1A1A1"
                      value={draft.colorHex}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, colorHex: event.target.value }));
                      }}
                    />
                  </div>
                </DialogField>
              </div>
            </section>
          ) : (
            <>
              <section aria-labelledby="variant-sales-title" className={styles.variantFormSection}>
                <div className={styles.variantSectionHeading}>
                  <h3 id="variant-sales-title">Bán hàng</h3>
                  <p>Giá bán và màu sắc áp dụng cho biến thể phụ kiện này.</p>
                </div>
                <div className={styles.fieldGrid}>
                  <DialogField id="variant-price" label="Giá bán *">
                    <input
                      className={styles.nativeInput}
                      id="variant-price"
                      inputMode="numeric"
                      min={1}
                      required
                      type="number"
                      value={draft.salePrice}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, salePrice: event.target.value }));
                      }}
                    />
                  </DialogField>
                  <DialogField id="variant-compare-price" label="Giá niêm yết">
                    <input
                      className={styles.nativeInput}
                      id="variant-compare-price"
                      inputMode="numeric"
                      min={1}
                      type="number"
                      value={draft.compareAtPrice}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, compareAtPrice: event.target.value }));
                      }}
                    />
                  </DialogField>
                  <DialogField id="variant-color" label="Tên màu">
                    <input
                      className={styles.nativeInput}
                      id="variant-color"
                      maxLength={255}
                      value={draft.colorName}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, colorName: event.target.value }));
                      }}
                    />
                  </DialogField>
                  <DialogField id="variant-color-hex" label="Màu hiển thị">
                    <div className={styles.colorControl}>
                      <input
                        aria-label="Chọn màu phụ kiện"
                        className={styles.colorPicker}
                        type="color"
                        value={colorPickerValue(draft.colorHex)}
                        onChange={(event) => {
                          setDraft((current) => ({
                            ...current,
                            colorHex: event.target.value.toUpperCase(),
                          }));
                        }}
                      />
                      <input
                        className={styles.nativeInput}
                        id="variant-color-hex"
                        pattern="#[0-9A-Fa-f]{6}"
                        placeholder="#A1A1A1"
                        value={draft.colorHex}
                        onChange={(event) => {
                          setDraft((current) => ({ ...current, colorHex: event.target.value }));
                        }}
                      />
                    </div>
                  </DialogField>
                </div>
              </section>

              <section
                aria-labelledby="variant-attributes-title"
                className={styles.variantFormSection}
              >
                <div className={styles.variantSectionHeading}>
                  <h3 id="variant-attributes-title">Thông số phụ kiện</h3>
                  <p>Thêm các thông tin hữu ích như tương thích, chất liệu hoặc công suất.</p>
                </div>
                <datalist id="variant-attribute-suggestions">
                  <option value="Tương thích" />
                  <option value="Chất liệu" />
                  <option value="Đầu kết nối" />
                  <option value="Chiều dài" />
                  <option value="Công suất" />
                </datalist>
                <div className={styles.attributeRows}>
                  {draft.attributes.map((attribute, index) =>
                    attribute.hidden === true ? null : (
                      <div className={styles.attributeRow} key={`attribute-${index.toString()}`}>
                        <DialogField
                          id={`variant-attribute-name-${index.toString()}`}
                          label="Tên thông số"
                        >
                          <input
                            className={styles.nativeInput}
                            id={`variant-attribute-name-${index.toString()}`}
                            list="variant-attribute-suggestions"
                            maxLength={80}
                            placeholder="Ví dụ: Tương thích"
                            value={attribute.name}
                            onChange={(event) => {
                              updateAttribute(index, 'name', event.target.value);
                            }}
                          />
                        </DialogField>
                        <DialogField
                          id={`variant-attribute-value-${index.toString()}`}
                          label="Giá trị"
                        >
                          <input
                            className={styles.nativeInput}
                            id={`variant-attribute-value-${index.toString()}`}
                            maxLength={255}
                            placeholder="Ví dụ: iPhone 15 trở lên"
                            value={attribute.value}
                            onChange={(event) => {
                              updateAttribute(index, 'value', event.target.value);
                            }}
                          />
                        </DialogField>
                        <button
                          aria-label={`Xóa thông số ${(index + 1).toString()}`}
                          className={styles.removeAttributeButton}
                          type="button"
                          onClick={() => {
                            removeAttribute(index);
                          }}
                        >
                          <TrashIcon aria-hidden="true" size={19} />
                        </button>
                      </div>
                    ),
                  )}
                </div>
                <button className={styles.addAttributeButton} type="button" onClick={addAttribute}>
                  <PlusIcon aria-hidden="true" size={18} weight="bold" />
                  Thêm thông số
                </button>
              </section>
            </>
          )}

          <section aria-labelledby="variant-policy-title" className={styles.variantFormSection}>
            <div className={styles.variantSectionHeading}>
              <h3 id="variant-policy-title">Bảo hành và quản lý kho</h3>
              <p>Biến thể có thể dùng chính sách chung của sản phẩm hoặc một chính sách riêng.</p>
            </div>
            <div className={styles.fieldGrid}>
              <DialogField id="variant-warranty" label="Chính sách bảo hành">
                <select
                  className={styles.nativeSelect}
                  id="variant-warranty"
                  value={draft.warrantyPolicyId}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, warrantyPolicyId: event.target.value }));
                  }}
                >
                  <option value="">Dùng chính sách của sản phẩm</option>
                  {warranties.map((warranty) => (
                    <option key={warranty.id} value={warranty.id}>
                      {warranty.name}
                    </option>
                  ))}
                </select>
              </DialogField>
              <div className={styles.readOnlyField}>
                <span>Kiểu quản lý tồn kho</span>
                <strong>{product.type === 'IPHONE' ? 'Theo từng máy' : 'Theo số lượng'}</strong>
                <small>
                  {product.type === 'IPHONE'
                    ? 'Giá bán và tình trạng được quản lý riêng cho từng máy trong kho.'
                    : 'Số lượng được theo dõi chung cho biến thể phụ kiện này.'}
                </small>
              </div>
            </div>
          </section>
        </div>
        <div className={styles.dialogActions}>
          <button className={styles.secondaryLink} disabled={busy} type="button" onClick={onCancel}>
            Hủy
          </button>
          <button className={styles.primaryLink} disabled={busy} type="submit">
            {busy ? 'Đang lưu…' : variant === undefined ? 'Thêm biến thể' : 'Lưu biến thể'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function CatalogProductEditDialog({
  busy,
  operationError,
  product,
  warranties,
  onCancel,
  onSubmit,
}: Readonly<{
  busy: boolean;
  operationError?: string | null;
  product: CatalogProductDetailRecord;
  warranties: readonly CatalogWarrantyChoice[];
  onCancel: () => void;
  onSubmit: (input: CatalogProductUpdateInput) => void;
}>) {
  const { dialogRef, onDialogClose } = useModalDialogLifecycle(true);
  const [draft, setDraft] = useState(() => ({
    brand: product.brand,
    chipset: product.chipset ?? '',
    description: product.description ?? '',
    name: product.name,
    ramGb: product.ramGb === null || product.ramGb === undefined ? '' : String(product.ramGb),
    releaseYear:
      product.releaseYear === null || product.releaseYear === undefined
        ? ''
        : String(product.releaseYear),
    screenSizeInches: product.screenSizeInches ?? '',
    seoDescription: product.seoDescription ?? '',
    seoTitle: product.seoTitle ?? '',
    slug: product.slug,
    warrantyPolicyId: product.warrantyPolicyId ?? '',
  }));
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.name.trim() === '' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) return;
    onSubmit({
      brand: draft.brand.trim(),
      description: draft.description.trim(),
      name: draft.name.trim(),
      seoDescription: draft.seoDescription.trim(),
      seoTitle: draft.seoTitle.trim(),
      slug: draft.slug,
      ...(draft.warrantyPolicyId === '' ? {} : { warrantyPolicyId: draft.warrantyPolicyId }),
      ...(product.type === 'ACCESSORY'
        ? {}
        : {
            chipset: draft.chipset.trim(),
            ramGb: Number(draft.ramGb),
            releaseYear: Number(draft.releaseYear),
            screenSizeInches: draft.screenSizeInches,
          }),
    });
  }
  return (
    <dialog
      aria-labelledby="product-edit-title"
      className={styles.dialogPanel}
      ref={dialogRef}
      onClose={onDialogClose}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form onSubmit={submit}>
        <div className={styles.dialogHeading}>
          <h2 id="product-edit-title">Chỉnh sửa thông tin</h2>
          <p>Cập nhật thông tin chung và nội dung hiển thị của sản phẩm.</p>
        </div>
        {operationError === null || operationError === undefined ? null : (
          <div className={styles.errorBanner} role="alert">
            {operationError}
          </div>
        )}
        <div className={styles.fieldGrid}>
          <DialogField id="edit-product-name" label="Tên sản phẩm">
            <input
              className={styles.nativeInput}
              id="edit-product-name"
              maxLength={255}
              required
              value={draft.name}
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }));
              }}
            />
          </DialogField>
          <DialogField id="edit-product-slug" label="Đường dẫn">
            <input
              className={styles.nativeInput}
              id="edit-product-slug"
              maxLength={180}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
              value={draft.slug}
              onChange={(event) => {
                setDraft((current) => ({ ...current, slug: event.target.value.toLowerCase() }));
              }}
            />
          </DialogField>
          <DialogField id="edit-product-brand" label="Thương hiệu">
            <input
              className={styles.nativeInput}
              id="edit-product-brand"
              maxLength={255}
              required
              value={draft.brand}
              onChange={(event) => {
                setDraft((current) => ({ ...current, brand: event.target.value }));
              }}
            />
          </DialogField>
          <DialogField id="edit-product-warranty" label="Chính sách bảo hành">
            <select
              className={styles.nativeSelect}
              id="edit-product-warranty"
              required
              value={draft.warrantyPolicyId}
              onChange={(event) => {
                setDraft((current) => ({ ...current, warrantyPolicyId: event.target.value }));
              }}
            >
              <option value="">Chọn chính sách</option>
              {warranties.map((warranty) => (
                <option key={warranty.id} value={warranty.id}>
                  {warranty.name}
                </option>
              ))}
            </select>
          </DialogField>
          {product.type === 'IPHONE' ? (
            <>
              <DialogField id="edit-product-year" label="Năm ra mắt">
                <input
                  className={styles.nativeInput}
                  id="edit-product-year"
                  max={2100}
                  min={2007}
                  required
                  type="number"
                  value={draft.releaseYear}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, releaseYear: event.target.value }));
                  }}
                />
              </DialogField>
              <DialogField id="edit-product-ram" label="Dung lượng RAM">
                <input
                  className={styles.nativeInput}
                  id="edit-product-ram"
                  max={64}
                  min={1}
                  required
                  type="number"
                  value={draft.ramGb}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, ramGb: event.target.value }));
                  }}
                />
              </DialogField>
              <DialogField id="edit-product-screen" label="Kích thước màn hình">
                <input
                  className={styles.nativeInput}
                  id="edit-product-screen"
                  required
                  value={draft.screenSizeInches}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, screenSizeInches: event.target.value }));
                  }}
                />
              </DialogField>
              <DialogField id="edit-product-chipset" label="Bộ xử lý">
                <input
                  className={styles.nativeInput}
                  id="edit-product-chipset"
                  maxLength={255}
                  required
                  value={draft.chipset}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, chipset: event.target.value }));
                  }}
                />
              </DialogField>
            </>
          ) : null}
          <DialogField className={styles.wideField} id="edit-product-description" label="Mô tả">
            <textarea
              className={styles.nativeTextarea}
              id="edit-product-description"
              rows={4}
              value={draft.description}
              onChange={(event) => {
                setDraft((current) => ({ ...current, description: event.target.value }));
              }}
            />
          </DialogField>
          <DialogField id="edit-product-seo-title" label="Tiêu đề tìm kiếm">
            <input
              className={styles.nativeInput}
              id="edit-product-seo-title"
              maxLength={255}
              value={draft.seoTitle}
              onChange={(event) => {
                setDraft((current) => ({ ...current, seoTitle: event.target.value }));
              }}
            />
          </DialogField>
          <DialogField id="edit-product-seo-description" label="Mô tả tìm kiếm">
            <textarea
              className={styles.nativeTextarea}
              id="edit-product-seo-description"
              rows={3}
              value={draft.seoDescription}
              onChange={(event) => {
                setDraft((current) => ({ ...current, seoDescription: event.target.value }));
              }}
            />
          </DialogField>
        </div>
        <div className={styles.dialogActions}>
          <button className={styles.secondaryLink} disabled={busy} type="button" onClick={onCancel}>
            Hủy
          </button>
          <button className={styles.primaryLink} disabled={busy} type="submit">
            {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function CatalogMediaEditDialog({
  busy,
  media,
  operationError,
  onCancel,
  onSubmit,
}: Readonly<{
  busy: boolean;
  media: CatalogMediaRecord;
  operationError?: string | null;
  onCancel: () => void;
  onSubmit: (input: CatalogMediaMetadataInput) => void;
}>) {
  const { dialogRef, onDialogClose } = useModalDialogLifecycle(true);
  const [altText, setAltText] = useState(media.altText ?? '');
  const [sortOrder, setSortOrder] = useState(String(media.sortOrder));
  return (
    <dialog
      aria-labelledby="media-edit-title"
      className={styles.dialogPanel}
      ref={dialogRef}
      onClose={onDialogClose}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ altText: altText.trim() || null, sortOrder: Number(sortOrder) });
        }}
      >
        <div className={styles.dialogHeading}>
          <h2 id="media-edit-title">Chỉnh sửa hình ảnh</h2>
          <p>Mô tả rõ nội dung ảnh và sắp xếp thứ tự hiển thị.</p>
        </div>
        {operationError === null || operationError === undefined ? null : (
          <div className={styles.errorBanner} role="alert">
            {operationError}
          </div>
        )}
        <DialogField id="media-alt-text" label="Mô tả hình ảnh">
          <input
            className={styles.nativeInput}
            id="media-alt-text"
            maxLength={255}
            value={altText}
            onChange={(event) => {
              setAltText(event.target.value);
            }}
          />
        </DialogField>
        <DialogField id="media-sort-order" label="Vị trí hiển thị">
          <input
            className={styles.nativeInput}
            id="media-sort-order"
            min={0}
            required
            type="number"
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value);
            }}
          />
        </DialogField>
        <div className={styles.dialogActions}>
          <button className={styles.secondaryLink} disabled={busy} type="button" onClick={onCancel}>
            Hủy
          </button>
          <button className={styles.primaryLink} disabled={busy} type="submit">
            {busy ? 'Đang lưu…' : 'Lưu hình ảnh'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function CatalogDescription({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PublishCheck({ children, complete }: Readonly<{ children: string; complete: boolean }>) {
  return (
    <li>
      <span className={complete ? styles.checkIcon : styles.stepDot} aria-hidden="true">
        {complete ? <CheckIcon size={14} weight="bold" /> : null}
      </span>
      <span>{children}</span>
    </li>
  );
}

function DialogField({
  children,
  className,
  id,
  label,
}: Readonly<{
  children: ReactNode;
  className?: string | undefined;
  id: string;
  label: string;
}>) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export interface VariantDraft {
  attributes: CatalogAttributeRecord[];
  colorHex: string;
  colorName: string;
  compareAtPrice: string;
  displayName: string;
  salePrice: string;
  sku: string;
  storageCapacityGb: string;
  warrantyPolicyId: string;
}

export function catalogPublishReadiness(product: CatalogProductDetailRecord) {
  const hasActiveVariant = product.variants.some((variant) => variant.status === 'ACTIVE');
  const hasWarranty = product.warrantyPolicyId !== null && product.warrantyPolicyId !== undefined;
  const hasMedia = product.media.length > 0;
  return {
    hasActiveVariant,
    hasMedia,
    hasWarranty,
    ready: hasActiveVariant && hasWarranty,
  };
}

export function nextCatalogMediaSortOrder(
  media: readonly Pick<CatalogMediaRecord, 'sortOrder'>[],
): number {
  return media.reduce((maximum, item) => Math.max(maximum, item.sortOrder), -1) + 1;
}

export function variantDraftFrom(variant?: CatalogVariantRecord): VariantDraft {
  const attributes = variant?.attributes.map((attribute) => ({ ...attribute })) ?? [];
  return {
    attributes:
      attributes.some((attribute) => attribute.hidden !== true) || attributes.length === 0
        ? attributes.length === 0
          ? [{ name: '', value: '' }]
          : attributes
        : [...attributes, { name: '', value: '' }],
    colorHex: variant?.colorHex ?? '',
    colorName: variant?.colorName ?? '',
    compareAtPrice: variant?.compareAtPrice ?? '',
    displayName: variant?.displayName ?? '',
    salePrice: variant?.salePrice ?? '',
    sku: variant?.sku ?? '',
    storageCapacityGb:
      variant?.storageCapacityGb === null || variant?.storageCapacityGb === undefined
        ? ''
        : String(variant.storageCapacityGb),
    warrantyPolicyId: variant?.warrantyPolicyId ?? '',
  };
}

export function variantInputFromDraft(
  draft: VariantDraft,
  productType: CatalogProductType,
  variant?: CatalogVariantRecord,
): CatalogVariantInput | Error {
  if (draft.displayName.trim() === '' || draft.sku.trim() === '') {
    return new Error('Nhập tên hiển thị và mã biến thể.');
  }
  if (draft.colorHex !== '' && !/^#[0-9A-Fa-f]{6}$/.test(draft.colorHex)) {
    return new Error('Mã màu cần có dạng #A1A1A1.');
  }
  if (productType === 'IPHONE') {
    if (!/^\d+$/.test(draft.storageCapacityGb) || draft.colorName.trim() === '') {
      return new Error('Nhập dung lượng lưu trữ và tên màu cho biến thể iPhone.');
    }
  }
  if (productType === 'ACCESSORY' && !/^\d{1,15}$/.test(draft.salePrice)) {
    return new Error('Nhập giá bán hợp lệ cho phụ kiện.');
  }
  if (productType === 'ACCESSORY' && draft.compareAtPrice !== '') {
    if (!/^\d{1,15}$/.test(draft.compareAtPrice)) {
      return new Error('Nhập giá niêm yết hợp lệ.');
    }
    if (BigInt(draft.compareAtPrice) < BigInt(draft.salePrice)) {
      return new Error('Giá niêm yết không được thấp hơn giá bán.');
    }
  }
  if (productType === 'ACCESSORY' && draft.colorHex !== '' && draft.colorName.trim() === '') {
    return new Error('Nhập tên màu khi đã chọn màu hiển thị.');
  }
  const editableAttributes = draft.attributes
    .filter((attribute) => attribute.hidden !== true)
    .map((attribute) => ({ name: attribute.name.trim(), value: attribute.value.trim() }))
    .filter((attribute) => attribute.name !== '' || attribute.value !== '');
  if (editableAttributes.some((attribute) => attribute.name === '' || attribute.value === '')) {
    return new Error('Mỗi thông số phụ kiện cần có đủ tên và giá trị.');
  }
  const attributeNames = editableAttributes.map((attribute) =>
    attribute.name.toLocaleLowerCase('vi'),
  );
  if (new Set(attributeNames).size !== attributeNames.length) {
    return new Error('Tên thông số phụ kiện không được trùng nhau.');
  }
  const editableAttributeNames = new Set(attributeNames);
  const attributes = [
    ...draft.attributes
      .filter((attribute) => attribute.hidden !== true)
      .map((attribute) => ({
        ...attribute,
        name: attribute.name.trim(),
        value: attribute.value.trim(),
      }))
      .filter((attribute) => attribute.name !== ''),
    ...draft.attributes.filter(
      (attribute) =>
        attribute.hidden === true &&
        !editableAttributeNames.has(attribute.name.trim().toLocaleLowerCase('vi')),
    ),
  ];
  return {
    displayName: draft.displayName.trim(),
    sku: draft.sku.trim().toUpperCase(),
    ...(draft.warrantyPolicyId === ''
      ? variant?.warrantyPolicyId
        ? { warrantyPolicyId: null }
        : {}
      : { warrantyPolicyId: draft.warrantyPolicyId }),
    ...(productType === 'IPHONE'
      ? {
          colorName: draft.colorName.trim(),
          storageCapacityGb: Number(draft.storageCapacityGb),
          ...(draft.colorHex === ''
            ? variant?.colorHex
              ? { colorHex: null }
              : {}
            : { colorHex: draft.colorHex.toUpperCase() }),
        }
      : {
          attributes,
          salePrice: draft.salePrice,
          ...(draft.colorName.trim() === ''
            ? variant?.colorName
              ? { colorName: null }
              : {}
            : { colorName: draft.colorName.trim() }),
          ...(draft.colorHex === ''
            ? variant?.colorHex
              ? { colorHex: null }
              : {}
            : { colorHex: draft.colorHex.toUpperCase() }),
          ...(draft.compareAtPrice === ''
            ? variant?.compareAtPrice
              ? { compareAtPrice: null }
              : {}
            : { compareAtPrice: draft.compareAtPrice }),
        }),
  };
}

function colorPickerValue(value: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#0F8299';
}

function catalogStatusDescription(status: CatalogRecordStatus): string {
  if (status === 'ACTIVE') return 'Sản phẩm đang hiển thị trên cửa hàng.';
  if (status === 'ARCHIVED') return 'Sản phẩm đã ngừng bán và được lưu trữ.';
  return 'Sản phẩm chưa hiển thị trên cửa hàng.';
}

function optionalNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Không áp dụng' : String(value);
}
