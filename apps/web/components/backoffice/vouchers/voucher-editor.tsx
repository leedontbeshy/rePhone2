'use client';

import { CircleIcon, InfoIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import { CatalogVoucherStatusChip } from '@/components/backoffice';
import {
  Checkbox,
  InlineAlert,
  Input,
  RadioCard,
  RadioGroup,
  Select,
  Textarea,
} from '@/components/ui';
import {
  getCatalogProduct,
  listCatalogProducts,
  type CatalogProductDetail,
  type CatalogProductListItem,
} from '@/lib/backoffice-catalog-api';
import {
  type CreateVoucherInput,
  type Voucher,
  type VoucherDiscountType,
  type VoucherProductType,
  type VoucherScopeType,
  type VoucherVisibility,
} from '@/lib/backoffice-voucher-api';
import {
  formatVoucherDateRange,
  voucherDiscountSummary,
  voucherScopeSummary,
} from './voucher-admin-ui';
import {
  loadAllVoucherCatalogProducts,
  validVoucherVariantSelection,
  VIETNAM_TIME_ZONE_LABEL,
  voucherEndDateExtensionError,
  voucherIsoToVietnamDateTimeLocal,
  voucherVietnamDateTimeLocalToIso,
} from './voucher-editor-logic';
import styles from './voucher-admin.module.css';

export interface VoucherEditorProps {
  readonly endDateOnly?: boolean;
  readonly formId: string;
  readonly initialVoucher?: Voucher;
  readonly onSubmit: (input: CreateVoucherInput) => void;
  readonly pending?: boolean;
}

interface VoucherDraft {
  code: string;
  description: string;
  discountType: VoucherDiscountType;
  discountValue: string;
  endsAt: string;
  maxDiscountAmount: string;
  minimumOrderAmount: string;
  name: string;
  perCustomerLimit: string;
  productIds: string[];
  productType: VoucherProductType;
  scopeType: VoucherScopeType;
  startsAt: string;
  totalUsageLimit: string;
  variantIds: string[];
  variantProductId: string;
  visibility: VoucherVisibility;
}

type VoucherDraftField =
  | 'code'
  | 'discountValue'
  | 'endsAt'
  | 'maxDiscountAmount'
  | 'minimumOrderAmount'
  | 'name'
  | 'perCustomerLimit'
  | 'scopeSelection'
  | 'startsAt'
  | 'totalUsageLimit';

type VoucherDraftErrors = Partial<Record<VoucherDraftField, string>>;

type VoucherDraftResult =
  | { input: CreateVoucherInput; ok: true }
  | { errors: VoucherDraftErrors; focusId: string; message: string; ok: false };

const EMPTY_DRAFT: VoucherDraft = {
  code: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  endsAt: '',
  maxDiscountAmount: '',
  minimumOrderAmount: '0',
  name: '',
  perCustomerLimit: '',
  productIds: [],
  productType: 'IPHONE',
  scopeType: 'ORDER',
  startsAt: '',
  totalUsageLimit: '',
  variantIds: [],
  variantProductId: '',
  visibility: 'PUBLIC',
};

export function VoucherEditor({
  endDateOnly = false,
  formId,
  initialVoucher,
  onSubmit,
  pending = false,
}: VoucherEditorProps) {
  const { client, status, user } = useAuth();
  const [draft, setDraft] = useState<VoucherDraft>(() => draftFromVoucher(initialVoucher));
  const [products, setProducts] = useState<CatalogProductListItem[]>([]);
  const [variantProduct, setVariantProduct] = useState<CatalogProductDetail | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [variantLoading, setVariantLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<VoucherDraftErrors>({});
  const variantRequestRef = useRef(0);
  const canLoadCatalog = status === 'authenticated' && user?.role === 'ADMIN';
  const shouldLoadCatalog = canLoadCatalog && !endDateOnly;
  const visibleVariantProduct =
    variantProduct?.id === draft.variantProductId ? variantProduct : null;
  const initialVariantIds = initialVoucherVariantIds(initialVoucher);

  useEffect(() => {
    setDraft(draftFromVoucher(initialVoucher));
    setFieldErrors({});
    setFormError(null);
  }, [initialVoucher]);

  useEffect(() => {
    setFieldErrors({});
    setFormError(null);
  }, [draft]);

  useEffect(() => {
    if (!shouldLoadCatalog) return;
    let active = true;
    setProductLoading(true);
    setProductError(null);
    void loadAllVoucherCatalogProducts((page, pageSize) =>
      listCatalogProducts(client, {
        page,
        pageSize,
        search: '',
        sortBy: 'name',
        sortOrder: 'asc',
        status: 'active',
        type: '',
      }),
    )
      .then((result) => {
        if (active) setProducts(result);
      })
      .catch((caught: unknown) => {
        if (active) setProductError(errorMessage(caught, 'Không thể tải lựa chọn sản phẩm.'));
      })
      .finally(() => {
        if (active) setProductLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, shouldLoadCatalog]);

  useEffect(() => {
    const request = variantRequestRef.current + 1;
    variantRequestRef.current = request;
    setVariantProduct(null);
    setVariantError(null);
    if (!shouldLoadCatalog || draft.scopeType !== 'VARIANTS' || draft.variantProductId === '') {
      setVariantLoading(false);
      return;
    }
    let active = true;
    setVariantLoading(true);
    void getCatalogProduct(client, draft.variantProductId)
      .then((product) => {
        if (active && variantRequestRef.current === request) setVariantProduct(product);
      })
      .catch((caught: unknown) => {
        if (active && variantRequestRef.current === request) {
          setVariantError(errorMessage(caught, 'Không thể tải các biến thể.'));
        }
      })
      .finally(() => {
        if (active && variantRequestRef.current === request) setVariantLoading(false);
      });
    return () => {
      active = false;
      if (variantRequestRef.current === request) variantRequestRef.current += 1;
    };
  }, [client, draft.scopeType, draft.variantProductId, shouldLoadCatalog]);

  const preview = useMemo(() => previewVoucher(draft), [draft]);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const validVariantIds =
      draft.scopeType === 'VARIANTS'
        ? validVoucherVariantSelection({
            activeVariantIds:
              visibleVariantProduct?.variants
                .filter((variant) => variant.status === 'active')
                .map((variant) => variant.id) ?? [],
            initialVariantIds,
            loadedProductId: visibleVariantProduct?.id ?? null,
            selectedProductId: draft.variantProductId,
            selectedVariantIds: draft.variantIds,
          })
        : [];
    const result = normalizeDraft(draft, validVariantIds);
    if (!result.ok) {
      setFieldErrors(result.errors);
      setFormError(result.message);
      focusVoucherField(result.focusId);
      return;
    }
    if (endDateOnly && initialVoucher !== undefined) {
      const dateError = voucherEndDateExtensionError(initialVoucher.endsAt, result.input.endsAt);
      if (dateError !== null) {
        setFieldErrors({ endsAt: dateError });
        setFormError(dateError);
        focusVoucherField('voucher-end');
        return;
      }
    }
    setFieldErrors({});
    setFormError(null);
    onSubmit(result.input);
  }

  if (endDateOnly && initialVoucher !== undefined) {
    return (
      <div className={styles.editorGrid}>
        <form className={styles.editorMain} id={formId} noValidate onSubmit={submit}>
          {formError === null ? null : (
            <InlineAlert title="Hãy kiểm tra lại thông tin" tone="danger">
              {formError}
            </InlineAlert>
          )}
          <InlineAlert title="Chỉ có thể gia hạn thời gian" tone="info">
            Mã ưu đãi này đã có lượt sử dụng. Các điều kiện hiện tại được giữ nguyên; bạn chỉ có thể
            dời thời gian kết thúc sang cùng thời điểm hoặc muộn hơn.
          </InlineAlert>
          <section className={styles.formSection}>
            <h2>Gia hạn thời gian áp dụng</h2>
            <Input
              error={fieldErrors.endsAt}
              id="voucher-end"
              label={`Kết thúc (${VIETNAM_TIME_ZONE_LABEL})`}
              min={voucherIsoToVietnamDateTimeLocal(initialVoucher.endsAt)}
              required
              type="datetime-local"
              value={draft.endsAt}
              onChange={(event) => {
                setDraft((current) => ({ ...current, endsAt: event.target.value }));
              }}
            />
          </section>
        </form>

        <aside className={styles.editorRail} aria-label="Thông tin gia hạn mã ưu đãi">
          <section className={styles.sideCard}>
            <h2>Điều kiện được giữ nguyên</h2>
            <div className={styles.previewCopy}>
              <h3>{initialVoucher.name}</h3>
              <p>{voucherDiscountSummary(initialVoucher)}</p>
              <p>{voucherScopeSummary(initialVoucher)}</p>
              <p>{preview.time}</p>
            </div>
          </section>
          <div className={styles.infoBox}>
            <InfoIcon aria-hidden size={20} />
            <span>Việc gia hạn không thay đổi mức giảm, phạm vi hay giới hạn sử dụng.</span>
          </div>
        </aside>
      </div>
    );
  }

  if (initialVoucher?.status === 'ACTIVE') {
    return (
      <div className={styles.editorGrid}>
        <form className={styles.editorMain} id={formId} noValidate onSubmit={submit}>
          {formError === null ? null : (
            <InlineAlert title="Hãy kiểm tra lại thông tin" tone="danger">
              {formError}
            </InlineAlert>
          )}
          <InlineAlert title="Chỉ chỉnh sửa nội dung giới thiệu" tone="info">
            Mã đang được áp dụng. Mức giảm, phạm vi, thời gian và giới hạn sử dụng được giữ nguyên.
          </InlineAlert>
          <section className={styles.formSection}>
            <h2>Thông tin chương trình</h2>
            <div className={styles.formGrid}>
              <Input
                error={fieldErrors.name}
                id="voucher-name"
                label="Tên chương trình"
                maxLength={255}
                required
                value={draft.name}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, name: event.target.value }));
                }}
              />
              <Textarea
                containerClassName={styles.fullWidth ?? ''}
                id="voucher-description"
                label="Mô tả"
                maxLength={2000}
                rows={4}
                value={draft.description}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, description: event.target.value }));
                }}
              />
            </div>
          </section>
        </form>

        <aside className={styles.editorRail} aria-label="Thông tin chỉnh sửa mã ưu đãi">
          <section className={styles.sideCard}>
            <h2>Điều kiện được giữ nguyên</h2>
            <div className={styles.previewCopy}>
              <h3>{initialVoucher.code}</h3>
              <p>{voucherDiscountSummary(initialVoucher)}</p>
              <p>{voucherScopeSummary(initialVoucher)}</p>
              <p>{formatVoucherDateRange(initialVoucher.startsAt, initialVoucher.endsAt)}</p>
            </div>
          </section>
          <div className={styles.infoBox}>
            <InfoIcon aria-hidden size={20} />
            <span>Hãy tạm dừng mã trước khi cần thay đổi điều kiện áp dụng.</span>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className={styles.editorGrid}>
      <form className={styles.editorMain} id={formId} noValidate onSubmit={submit}>
        {formError === null ? null : (
          <InlineAlert title="Hãy kiểm tra lại thông tin" tone="danger">
            {formError}
          </InlineAlert>
        )}

        <section className={styles.formSection}>
          <h2>Thông tin chương trình</h2>
          <div className={styles.formGrid}>
            <Input
              error={fieldErrors.code}
              id="voucher-code"
              label="Mã ưu đãi"
              hint={
                initialVoucher === undefined
                  ? 'Mã sẽ tự viết hoa và không thể đổi sau khi tạo.'
                  : 'Mã được giữ nguyên sau khi tạo.'
              }
              maxLength={64}
              readOnly={initialVoucher !== undefined}
              required
              value={draft.code}
              onChange={(event) => {
                setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }));
              }}
            />
            <Input
              error={fieldErrors.name}
              id="voucher-name"
              label="Tên chương trình"
              maxLength={255}
              required
              value={draft.name}
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }));
              }}
            />
            <Textarea
              containerClassName={styles.fullWidth ?? ''}
              id="voucher-description"
              label="Mô tả"
              maxLength={2000}
              rows={3}
              value={draft.description}
              onChange={(event) => {
                setDraft((current) => ({ ...current, description: event.target.value }));
              }}
            />
          </div>
        </section>

        <section className={styles.formSection}>
          <h2>Mức ưu đãi</h2>
          <RadioGroup legend="Cách tính" required>
            <div className={styles.radioGrid}>
              <RadioCard
                checked={draft.discountType === 'PERCENT'}
                id="discount-percent"
                label="Giảm theo phần trăm"
                name="discountType"
                value="PERCENT"
                onChange={() => {
                  setDraft((current) => ({ ...current, discountType: 'PERCENT' }));
                }}
              />
              <RadioCard
                checked={draft.discountType === 'FIXED'}
                id="discount-fixed"
                label="Giảm số tiền"
                name="discountType"
                value="FIXED"
                onChange={() => {
                  setDraft((current) => ({
                    ...current,
                    discountType: 'FIXED',
                    maxDiscountAmount: '',
                  }));
                }}
              />
            </div>
          </RadioGroup>
          <div className={`${styles.formGrid ?? ''} ${styles.formGridThree ?? ''}`}>
            <Input
              error={fieldErrors.discountValue}
              id="discount-value"
              label={draft.discountType === 'PERCENT' ? 'Mức giảm (%)' : 'Số tiền giảm (đ)'}
              inputMode="numeric"
              max={draft.discountType === 'PERCENT' ? 100 : undefined}
              min={1}
              pattern="[0-9]*"
              required
              value={draft.discountValue}
              onChange={(event) => {
                setDraft((current) => ({ ...current, discountValue: digits(event.target.value) }));
              }}
            />
            <Input
              disabled={draft.discountType === 'FIXED'}
              error={fieldErrors.maxDiscountAmount}
              id="discount-maximum"
              label="Giảm tối đa (đ)"
              inputMode="numeric"
              min={1}
              pattern="[0-9]*"
              value={draft.maxDiscountAmount}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  maxDiscountAmount: digits(event.target.value),
                }));
              }}
            />
            <Input
              error={fieldErrors.minimumOrderAmount}
              id="minimum-order"
              label="Giá trị đơn hàng tối thiểu (đ)"
              inputMode="numeric"
              min={0}
              pattern="[0-9]*"
              required
              value={draft.minimumOrderAmount}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  minimumOrderAmount: digits(event.target.value),
                }));
              }}
            />
          </div>
        </section>

        <section className={styles.formSection}>
          <h2>Phạm vi áp dụng</h2>
          <RadioGroup error={fieldErrors.scopeSelection} legend="Áp dụng cho" required>
            <div className={`${styles.radioGrid ?? ''} ${styles.radioGridFour ?? ''}`}>
              {(
                [
                  ['ORDER', 'Toàn bộ đơn hàng'],
                  ['PRODUCT_TYPE', 'Dòng sản phẩm'],
                  ['PRODUCTS', 'Sản phẩm cụ thể'],
                  ['VARIANTS', 'Biến thể cụ thể'],
                ] as const
              ).map(([value, label]) => (
                <RadioCard
                  checked={draft.scopeType === value}
                  id={`scope-${value.toLowerCase()}`}
                  key={value}
                  label={label}
                  name="scopeType"
                  value={value}
                  onChange={() => {
                    setDraft((current) => ({ ...current, scopeType: value }));
                  }}
                />
              ))}
            </div>
          </RadioGroup>

          {draft.scopeType === 'PRODUCT_TYPE' ? (
            <Select
              id="scope-product-type"
              label="Chọn dòng sản phẩm"
              required
              value={draft.productType}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  productType: event.target.value as VoucherProductType,
                }));
              }}
            >
              <option value="IPHONE">iPhone</option>
              <option value="ACCESSORY">Phụ kiện</option>
            </Select>
          ) : null}

          {draft.scopeType === 'PRODUCTS' ? (
            <CatalogProductPicker
              loading={productLoading}
              products={products}
              selectedIds={draft.productIds}
              onToggle={(productId) => {
                setDraft((current) => ({
                  ...current,
                  productIds: toggleId(current.productIds, productId),
                }));
              }}
            />
          ) : null}

          {draft.scopeType === 'VARIANTS' ? (
            <div className={styles.selectionArea}>
              <Select
                disabled={productLoading}
                id="variant-product"
                label="Chọn sản phẩm để xem biến thể"
                value={draft.variantProductId}
                onChange={(event) => {
                  setVariantProduct(null);
                  setDraft((current) => ({
                    ...current,
                    variantIds: [],
                    variantProductId: event.target.value,
                  }));
                }}
              >
                <option value="">Chọn sản phẩm</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Select>
              {variantLoading ? (
                <p className={styles.supportCopy} role="status">
                  Đang tải biến thể…
                </p>
              ) : null}
              {draft.variantIds.length > 0 && visibleVariantProduct === null && !variantLoading ? (
                <p className={styles.selectionSummary}>
                  Đang giữ {draft.variantIds.length} biến thể đã chọn. Chọn một sản phẩm để thay
                  đổi.
                </p>
              ) : null}
              {visibleVariantProduct === null || variantLoading ? null : (
                <div className={styles.selectionList}>
                  {visibleVariantProduct.variants
                    .filter((variant) => variant.status === 'active')
                    .map((variant) => (
                      <Checkbox
                        checked={draft.variantIds.includes(variant.id)}
                        description={variant.sku}
                        id={`variant-${variant.id}`}
                        key={variant.id}
                        label={variant.displayName}
                        onChange={() => {
                          setDraft((current) => ({
                            ...current,
                            variantIds: toggleId(current.variantIds, variant.id),
                          }));
                        }}
                      />
                    ))}
                </div>
              )}
            </div>
          ) : null}

          {productError === null ? null : (
            <InlineAlert title="Chưa tải được lựa chọn sản phẩm" tone="warning">
              {productError}
            </InlineAlert>
          )}
          {variantError === null ? null : (
            <InlineAlert title="Chưa tải được biến thể" tone="warning">
              {variantError}
            </InlineAlert>
          )}
        </section>

        <section className={styles.formSection}>
          <h2>Thời gian và giới hạn</h2>
          <div className={`${styles.formGrid ?? ''} ${styles.formGridFour ?? ''}`}>
            <Input
              error={fieldErrors.startsAt}
              id="voucher-start"
              label={`Bắt đầu (${VIETNAM_TIME_ZONE_LABEL})`}
              required
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => {
                setDraft((current) => ({ ...current, startsAt: event.target.value }));
              }}
            />
            <Input
              error={fieldErrors.endsAt}
              id="voucher-end"
              label={`Kết thúc (${VIETNAM_TIME_ZONE_LABEL})`}
              required
              type="datetime-local"
              value={draft.endsAt}
              onChange={(event) => {
                setDraft((current) => ({ ...current, endsAt: event.target.value }));
              }}
            />
            <Input
              error={fieldErrors.totalUsageLimit}
              id="voucher-total-limit"
              label="Tổng lượt sử dụng"
              hint="Để trống nếu không giới hạn."
              inputMode="numeric"
              min={1}
              pattern="[0-9]*"
              value={draft.totalUsageLimit}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  totalUsageLimit: digits(event.target.value),
                }));
              }}
            />
            <Input
              disabled={draft.visibility === 'PUBLIC'}
              error={fieldErrors.perCustomerLimit}
              id="voucher-customer-limit"
              label="Mỗi khách hàng"
              hint={
                draft.visibility === 'PUBLIC'
                  ? 'Mã công khai không giới hạn theo tài khoản.'
                  : 'Để trống nếu không giới hạn.'
              }
              inputMode="numeric"
              min={1}
              pattern="[0-9]*"
              value={draft.perCustomerLimit}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  perCustomerLimit: digits(event.target.value),
                }));
              }}
            />
          </div>
        </section>

        <section className={styles.formSection}>
          <h2>Đối tượng nhìn thấy</h2>
          <RadioGroup legend="Hiển thị mã" required>
            <div className={styles.radioGrid}>
              <RadioCard
                checked={draft.visibility === 'PUBLIC'}
                description="Tất cả khách hàng đều có thể thấy và sử dụng."
                id="visibility-public"
                label="Công khai"
                name="visibility"
                value="PUBLIC"
                onChange={() => {
                  setDraft((current) => ({
                    ...current,
                    perCustomerLimit: '',
                    visibility: 'PUBLIC',
                  }));
                }}
              />
              <RadioCard
                checked={draft.visibility === 'ACCOUNT_ONLY'}
                description="Chỉ hiển thị với khách hàng đã đăng nhập."
                id="visibility-account"
                label="Chỉ dành cho tài khoản"
                name="visibility"
                value="ACCOUNT_ONLY"
                onChange={() => {
                  setDraft((current) => ({ ...current, visibility: 'ACCOUNT_ONLY' }));
                }}
              />
            </div>
          </RadioGroup>
        </section>
      </form>

      <aside className={styles.editorRail} aria-label="Xem trước mã ưu đãi">
        <section className={styles.sideCard}>
          <h2>Xem trước</h2>
          <div className={styles.previewVoucher}>
            <span className={styles.voucherCode}>{draft.code.trim() || 'MÃ ƯU ĐÃI'}</span>
            <div className={styles.previewCopy}>
              <h3>{draft.name.trim() || 'Tên chương trình'}</h3>
              <p>{preview.discount}</p>
              <p>{preview.scope}</p>
              <p>{preview.time}</p>
            </div>
          </div>
        </section>

        <section className={styles.sideCard}>
          <h2>Trạng thái</h2>
          <CatalogVoucherStatusChip label="Bản nháp" status="DRAFT" />
          <p className={styles.supportCopy}>Mã mới sẽ được lưu thành bản nháp.</p>
        </section>

        <section className={styles.sideCard}>
          <h2>Sau khi lưu</h2>
          <ul className={styles.checkList}>
            <li>
              <CircleIcon aria-hidden size={20} />
              Kiểm tra lại điều kiện
            </li>
            <li>
              <CircleIcon aria-hidden size={20} />
              Mở áp dụng khi sẵn sàng
            </li>
            <li>
              <CircleIcon aria-hidden size={20} />
              Theo dõi lượt sử dụng
            </li>
          </ul>
        </section>

        <div className={styles.infoBox}>
          <InfoIcon aria-hidden size={20} />
          <span>Bạn có thể chỉnh sửa đầy đủ khi mã vẫn ở trạng thái bản nháp.</span>
        </div>
      </aside>
    </div>
  );
}

function CatalogProductPicker({
  loading,
  onToggle,
  products,
  selectedIds,
}: Readonly<{
  loading: boolean;
  onToggle: (id: string) => void;
  products: readonly CatalogProductListItem[];
  selectedIds: readonly string[];
}>) {
  if (loading && products.length === 0)
    return <p className={styles.supportCopy}>Đang tải sản phẩm…</p>;
  if (products.length === 0) {
    return <p className={styles.supportCopy}>Chưa có sản phẩm đang bán để chọn.</p>;
  }
  return (
    <div className={styles.selectionList} aria-label="Chọn sản phẩm áp dụng">
      {products.map((product) => (
        <Checkbox
          checked={selectedIds.includes(product.id)}
          description={`${product.typeLabel} · ${String(product.variantCount)} biến thể`}
          id={`product-${product.id}`}
          key={product.id}
          label={product.name}
          onChange={() => {
            onToggle(product.id);
          }}
        />
      ))}
    </div>
  );
}

function draftFromVoucher(voucher?: Voucher): VoucherDraft {
  if (voucher === undefined) return EMPTY_DRAFT;
  const productIds =
    voucher.scopeType === 'PRODUCTS' && voucher.scopeConfig && 'productIds' in voucher.scopeConfig
      ? voucher.scopeConfig.productIds
      : [];
  const variantIds =
    voucher.scopeType === 'VARIANTS' && voucher.scopeConfig && 'variantIds' in voucher.scopeConfig
      ? voucher.scopeConfig.variantIds
      : [];
  const productType =
    voucher.scopeType === 'PRODUCT_TYPE' &&
    voucher.scopeConfig &&
    'productType' in voucher.scopeConfig
      ? voucher.scopeConfig.productType
      : 'IPHONE';
  return {
    code: voucher.code,
    description: voucher.description ?? '',
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    endsAt: voucherIsoToVietnamDateTimeLocal(voucher.endsAt),
    maxDiscountAmount: voucher.maxDiscountAmount ?? '',
    minimumOrderAmount: voucher.minimumOrderAmount,
    name: voucher.name,
    perCustomerLimit: voucher.perCustomerLimit?.toString() ?? '',
    productIds,
    productType,
    scopeType: voucher.scopeType,
    startsAt: voucherIsoToVietnamDateTimeLocal(voucher.startsAt),
    totalUsageLimit: voucher.totalUsageLimit?.toString() ?? '',
    variantIds,
    variantProductId: '',
    visibility: voucher.visibility,
  };
}

function normalizeDraft(
  draft: VoucherDraft,
  validVariantIds: readonly string[] | null,
): VoucherDraftResult {
  const code = draft.code.trim().toUpperCase();
  const name = draft.name.trim();
  if (code.length === 0 || code.length > 64) {
    return draftFailure('code', 'voucher-code', 'Mã ưu đãi cần từ 1 đến 64 ký tự.');
  }
  if (name.length === 0 || name.length > 255)
    return draftFailure('name', 'voucher-name', 'Tên chương trình cần từ 1 đến 255 ký tự.');
  if (!positiveInteger(draft.discountValue))
    return draftFailure('discountValue', 'discount-value', 'Mức giảm phải là số nguyên lớn hơn 0.');
  if (draft.discountType === 'PERCENT' && Number(draft.discountValue) > 100) {
    return draftFailure(
      'discountValue',
      'discount-value',
      'Mức giảm theo phần trăm không được quá 100%.',
    );
  }
  if (draft.maxDiscountAmount !== '' && !positiveInteger(draft.maxDiscountAmount)) {
    return draftFailure(
      'maxDiscountAmount',
      'discount-maximum',
      'Mức giảm tối đa phải là số nguyên lớn hơn 0.',
    );
  }
  if (!nonNegativeInteger(draft.minimumOrderAmount)) {
    return draftFailure(
      'minimumOrderAmount',
      'minimum-order',
      'Giá trị đơn hàng tối thiểu phải là số nguyên từ 0 trở lên.',
    );
  }
  const startsAt = voucherVietnamDateTimeLocalToIso(draft.startsAt);
  if (startsAt === null) {
    return draftFailure('startsAt', 'voucher-start', 'Hãy chọn thời gian bắt đầu hợp lệ.');
  }
  const endsAt = voucherVietnamDateTimeLocalToIso(draft.endsAt);
  if (endsAt === null) {
    return draftFailure('endsAt', 'voucher-end', 'Hãy chọn thời gian kết thúc hợp lệ.');
  }
  if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    return draftFailure('endsAt', 'voucher-end', 'Thời gian kết thúc phải sau thời gian bắt đầu.');
  }
  if (draft.totalUsageLimit !== '' && !positiveInteger(draft.totalUsageLimit)) {
    return draftFailure(
      'totalUsageLimit',
      'voucher-total-limit',
      'Tổng lượt sử dụng phải là số nguyên lớn hơn 0.',
    );
  }
  if (draft.perCustomerLimit !== '' && !positiveInteger(draft.perCustomerLimit)) {
    return draftFailure(
      'perCustomerLimit',
      'voucher-customer-limit',
      'Giới hạn mỗi khách hàng phải là số nguyên lớn hơn 0.',
    );
  }

  const base = {
    code,
    name,
    description: draft.description.trim() || null,
    discountType: draft.discountType,
    discountValue: draft.discountValue,
    maxDiscountAmount:
      draft.discountType === 'FIXED' || draft.maxDiscountAmount === ''
        ? null
        : draft.maxDiscountAmount,
    minimumOrderAmount: draft.minimumOrderAmount,
    startsAt,
    endsAt,
    totalUsageLimit:
      draft.totalUsageLimit === '' ? null : Number.parseInt(draft.totalUsageLimit, 10),
    perCustomerLimit:
      draft.visibility === 'PUBLIC' || draft.perCustomerLimit === ''
        ? null
        : Number.parseInt(draft.perCustomerLimit, 10),
    visibility: draft.visibility,
  };

  if (draft.scopeType === 'ORDER') {
    return { input: { ...base, scopeType: 'ORDER', scopeConfig: null }, ok: true };
  }
  if (draft.scopeType === 'PRODUCT_TYPE') {
    return {
      input: {
        ...base,
        scopeType: 'PRODUCT_TYPE',
        scopeConfig: { productType: draft.productType },
      },
      ok: true,
    };
  }
  if (draft.scopeType === 'PRODUCTS') {
    if (draft.productIds.length === 0) {
      return draftFailure('scopeSelection', 'scope-products', 'Hãy chọn ít nhất một sản phẩm.');
    }
    return {
      input: {
        ...base,
        scopeType: 'PRODUCTS',
        scopeConfig: { productIds: draft.productIds },
      },
      ok: true,
    };
  }
  if (validVariantIds === null) {
    return draftFailure(
      'scopeSelection',
      'variant-product',
      'Hãy chọn ít nhất một biến thể thuộc sản phẩm hiện tại.',
    );
  }
  return {
    input: { ...base, scopeType: 'VARIANTS', scopeConfig: { variantIds: [...validVariantIds] } },
    ok: true,
  };
}

function previewVoucher(draft: VoucherDraft) {
  const discount =
    draft.discountValue === ''
      ? 'Chưa chọn mức giảm'
      : voucherDiscountSummary({
          discountType: draft.discountType,
          discountValue: draft.discountValue,
          maxDiscountAmount: draft.maxDiscountAmount || null,
        });
  const scope = voucherScopeSummary({
    scopeConfig:
      draft.scopeType === 'PRODUCT_TYPE'
        ? { productType: draft.productType }
        : draft.scopeType === 'PRODUCTS'
          ? { productIds: draft.productIds }
          : draft.scopeType === 'VARIANTS'
            ? { variantIds: draft.variantIds }
            : null,
    scopeType: draft.scopeType,
  });
  const time =
    draft.startsAt === '' || draft.endsAt === ''
      ? 'Chưa chọn thời gian'
      : formatVoucherDateRange(
          voucherVietnamDateTimeLocalToIso(draft.startsAt) ?? '',
          voucherVietnamDateTimeLocalToIso(draft.endsAt) ?? '',
        );
  return { discount, scope, time };
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function positiveInteger(value: string): boolean {
  return /^\d{1,15}$/.test(value) && Number(value) > 0;
}

function nonNegativeInteger(value: string): boolean {
  return /^\d{1,15}$/.test(value);
}

function toggleId(values: readonly string[], id: string): string[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function initialVoucherVariantIds(voucher?: Voucher): string[] {
  return voucher?.scopeType === 'VARIANTS' &&
    voucher.scopeConfig !== null &&
    voucher.scopeConfig !== undefined &&
    'variantIds' in voucher.scopeConfig
    ? [...voucher.scopeConfig.variantIds]
    : [];
}

function draftFailure(
  field: VoucherDraftField,
  focusId: string,
  message: string,
): VoucherDraftResult {
  return { errors: { [field]: message }, focusId, message, ok: false };
}

function focusVoucherField(id: string): void {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
