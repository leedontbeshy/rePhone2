'use client';

import { DeviceMobileIcon, InfoIcon, PlugIcon } from '@phosphor-icons/react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { BackofficeActionDialog, CatalogVoucherStatusChip } from '@/components/backoffice';
import {
  catalogProductInputFromDraft,
  EMPTY_PRODUCT_DRAFT,
  slugFromProductName,
  validateCatalogProductDraft,
  type CatalogProductDraft,
  type CatalogProductInput,
  type CatalogValidationError,
} from './catalog-presenter';
import styles from './catalog.module.css';
import {
  catalogFormChanged,
  catalogInternalNavigationTarget,
  useUnsavedCatalogChanges,
} from './use-unsaved-catalog-changes';

export interface CatalogWarrantyChoice {
  readonly id: string;
  readonly name: string;
  readonly defaultDays?: number;
}

interface CatalogProductFormProps {
  readonly error?: string | null;
  readonly initialDraft?: CatalogProductDraft;
  readonly pending?: boolean;
  readonly submitLabel?: string;
  readonly warranties: readonly CatalogWarrantyChoice[];
  readonly warrantyLoading?: boolean;
  readonly warrantyLoadError?: string | null;
  readonly onCancel: () => void;
  readonly onNavigateAway: (href: string) => void;
  readonly onRetryWarranties?: () => void;
  readonly onSubmit: (input: CatalogProductInput) => Promise<void> | void;
}

export function CatalogProductForm({
  error = null,
  initialDraft = EMPTY_PRODUCT_DRAFT,
  pending = false,
  submitLabel = 'Lưu bản nháp',
  warranties,
  warrantyLoading = false,
  warrantyLoadError = null,
  onCancel,
  onNavigateAway,
  onRetryWarranties,
  onSubmit,
}: CatalogProductFormProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [baseline, setBaseline] = useState(initialDraft);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly CatalogValidationError[]>([]);
  const [slugEdited, setSlugEdited] = useState(initialDraft.slug !== '');
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty = catalogFormChanged(baseline, draft);

  useUnsavedCatalogChanges(dirty);

  useEffect(() => {
    setDraft(initialDraft);
    setBaseline(initialDraft);
    setConfirmDiscard(false);
    setPendingNavigation(null);
  }, [initialDraft]);

  useEffect(() => {
    if (!dirty) return;
    const protectInternalNavigation = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (anchor === null || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = catalogInternalNavigationTarget(anchor.href, window.location.href);
      if (destination === null) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(destination);
    };
    document.addEventListener('click', protectInternalNavigation, true);
    return () => {
      document.removeEventListener('click', protectInternalNavigation, true);
    };
  }, [dirty]);

  useEffect(() => {
    if (error !== null || errors.length > 0) errorRef.current?.focus();
  }, [error, errors]);

  function updateField<Key extends keyof CatalogProductDraft>(
    field: Key,
    value: CatalogProductDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => current.filter((item) => item.field !== field));
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const name = event.target.value;
    setDraft((current) => ({
      ...current,
      name,
      ...(slugEdited ? {} : { slug: slugFromProductName(name) }),
    }));
    setErrors((current) =>
      current.filter((item) => item.field !== 'name' && item.field !== 'slug'),
    );
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const validationErrors = validateCatalogProductDraft(draft);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    try {
      await onSubmit(catalogProductInputFromDraft(draft));
      setBaseline(draft);
    } catch {
      // The route owns the actionable API error and keeps the edited draft intact.
    }
  }

  return (
    <>
      <form
        className={styles.page}
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <header className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <h1>Thêm sản phẩm</h1>
            <p>Tạo thông tin chung trước, sau đó bổ sung biến thể và hình ảnh.</p>
          </div>
        </header>

        {error === null && errors.length === 0 ? null : (
          <div className={styles.errorBanner} ref={errorRef} role="alert" tabIndex={-1}>
            {error ?? `Cần kiểm tra lại ${String(errors.length)} trường thông tin.`}
            {errors.length === 0 ? null : (
              <ul>
                {errors.map((item) => (
                  <li key={item.field}>
                    <a href={`#product-${item.field}`}>{item.message}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className={styles.formLayout}>
          <div className={styles.formMain}>
            <section className={styles.formSection} aria-labelledby="basic-information-title">
              <h2 id="basic-information-title">Thông tin cơ bản</h2>
              <fieldset className={styles.field}>
                <legend className={styles.fieldLegend}>Loại sản phẩm</legend>
                <div className={styles.radioGrid}>
                  <label className={styles.radioCard}>
                    <input
                      checked={draft.type === 'IPHONE'}
                      name="product-type"
                      type="radio"
                      value="IPHONE"
                      onChange={() => {
                        updateField('type', 'IPHONE');
                      }}
                    />
                    <span className={styles.radioCardCopy}>
                      <strong>
                        <DeviceMobileIcon aria-hidden="true" size={20} /> iPhone
                      </strong>
                      <span>Sản phẩm iPhone được quản lý theo từng cấu hình.</span>
                    </span>
                  </label>
                  <label className={styles.radioCard}>
                    <input
                      checked={draft.type === 'ACCESSORY'}
                      name="product-type"
                      type="radio"
                      value="ACCESSORY"
                      onChange={() => {
                        updateField('type', 'ACCESSORY');
                      }}
                    />
                    <span className={styles.radioCardCopy}>
                      <strong>
                        <PlugIcon aria-hidden="true" size={20} /> Phụ kiện
                      </strong>
                      <span>Cáp, sạc, ốp lưng, tai nghe và phụ kiện khác.</span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <div className={styles.threeColumnGrid}>
                <CatalogField
                  error={fieldError(errors, 'name')}
                  id="product-name"
                  label="Tên sản phẩm"
                  required
                >
                  <input
                    className={styles.nativeInput}
                    id="product-name"
                    maxLength={255}
                    value={draft.name}
                    onChange={handleNameChange}
                  />
                </CatalogField>
                <CatalogField
                  error={fieldError(errors, 'slug')}
                  hint="Dùng để tạo địa chỉ dễ nhớ cho sản phẩm."
                  id="product-slug"
                  label="Đường dẫn"
                  required
                >
                  <input
                    className={styles.nativeInput}
                    id="product-slug"
                    maxLength={180}
                    value={draft.slug}
                    onChange={(event) => {
                      setSlugEdited(true);
                      updateField('slug', event.target.value.toLowerCase());
                    }}
                  />
                </CatalogField>
                <CatalogField
                  error={fieldError(errors, 'brand')}
                  id="product-brand"
                  label="Thương hiệu"
                  required
                >
                  <select
                    className={styles.nativeSelect}
                    id="product-brand"
                    value={draft.brand}
                    onChange={(event) => {
                      updateField('brand', event.target.value);
                    }}
                  >
                    <option value="Apple">Apple</option>
                    <option value="Khác">Thương hiệu khác</option>
                  </select>
                </CatalogField>
              </div>

              <CatalogField
                error={fieldError(errors, 'description')}
                hint="Mô tả ngắn gọn về sản phẩm."
                id="product-description"
                label="Mô tả"
                required
              >
                <textarea
                  className={styles.nativeTextarea}
                  id="product-description"
                  maxLength={500}
                  rows={3}
                  value={draft.description}
                  onChange={(event) => {
                    updateField('description', event.target.value);
                  }}
                />
                <span className={styles.counter}>{String(draft.description.length)}/500</span>
              </CatalogField>
            </section>

            {draft.type === 'IPHONE' ? (
              <section className={styles.formSection} aria-labelledby="model-specifications-title">
                <h2 id="model-specifications-title">Thông số dòng máy</h2>
                <div className={styles.fieldGrid}>
                  <CatalogField
                    error={fieldError(errors, 'releaseYear')}
                    id="product-release-year"
                    label="Năm ra mắt"
                    required
                  >
                    <input
                      className={styles.nativeInput}
                      id="product-release-year"
                      inputMode="numeric"
                      max={2100}
                      min={2007}
                      type="number"
                      value={draft.releaseYear}
                      onChange={(event) => {
                        updateField('releaseYear', event.target.value);
                      }}
                    />
                  </CatalogField>
                  <CatalogField
                    error={fieldError(errors, 'ramGb')}
                    id="product-ram"
                    label="Dung lượng RAM"
                    required
                  >
                    <select
                      className={styles.nativeSelect}
                      id="product-ram"
                      value={draft.ramGb}
                      onChange={(event) => {
                        updateField('ramGb', event.target.value);
                      }}
                    >
                      <option value="">Chọn dung lượng RAM</option>
                      {[2, 3, 4, 6, 8, 12, 16].map((value) => (
                        <option key={value} value={value}>
                          {String(value)} GB
                        </option>
                      ))}
                    </select>
                  </CatalogField>
                  <CatalogField
                    error={fieldError(errors, 'screenSizeInches')}
                    id="product-screen-size"
                    label="Kích thước màn hình"
                    required
                  >
                    <input
                      className={styles.nativeInput}
                      id="product-screen-size"
                      inputMode="decimal"
                      placeholder="Ví dụ: 6.3"
                      value={draft.screenSizeInches}
                      onChange={(event) => {
                        updateField('screenSizeInches', event.target.value.replace(',', '.'));
                      }}
                    />
                  </CatalogField>
                  <CatalogField
                    error={fieldError(errors, 'chipset')}
                    id="product-chipset"
                    label="Bộ xử lý"
                    required
                  >
                    <input
                      className={styles.nativeInput}
                      id="product-chipset"
                      maxLength={255}
                      placeholder="Ví dụ: Apple A18 Pro"
                      value={draft.chipset}
                      onChange={(event) => {
                        updateField('chipset', event.target.value);
                      }}
                    />
                  </CatalogField>
                </div>
              </section>
            ) : null}

            <section className={styles.formSection} aria-labelledby="warranty-title">
              <h2 id="warranty-title">Bảo hành</h2>
              <CatalogField
                error={fieldError(errors, 'warrantyPolicyId')}
                hint="Chọn chính sách bảo hành áp dụng cho sản phẩm này."
                id="product-warranty"
                label="Chính sách bảo hành"
                required
              >
                <select
                  className={styles.nativeSelect}
                  disabled={warrantyLoading}
                  id="product-warranty"
                  value={draft.warrantyPolicyId}
                  onChange={(event) => {
                    updateField('warrantyPolicyId', event.target.value);
                  }}
                >
                  <option value="">
                    {warrantyLoading ? 'Đang tải chính sách…' : 'Chọn chính sách bảo hành'}
                  </option>
                  {warranties.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.name}
                      {policy.defaultDays === undefined
                        ? ''
                        : ` · ${String(policy.defaultDays)} ngày`}
                    </option>
                  ))}
                </select>
              </CatalogField>
              {warrantyLoadError === null ? null : (
                <div className={styles.fieldLoadError} role="alert">
                  <span>{warrantyLoadError}</span>
                  {onRetryWarranties === undefined ? null : (
                    <button className={styles.textButton} type="button" onClick={onRetryWarranties}>
                      Thử lại
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className={styles.formSection} aria-labelledby="search-preview-title">
              <h2 id="search-preview-title">Hiển thị trên trang tìm kiếm</h2>
              <div className={styles.fieldGrid}>
                <CatalogField
                  error={fieldError(errors, 'seoTitle')}
                  hint="Tiêu đề hiển thị trên kết quả tìm kiếm."
                  id="product-seo-title"
                  label="Tiêu đề tìm kiếm"
                >
                  <input
                    className={styles.nativeInput}
                    id="product-seo-title"
                    maxLength={255}
                    value={draft.seoTitle}
                    onChange={(event) => {
                      updateField('seoTitle', event.target.value);
                    }}
                  />
                  <span className={styles.counter}>{String(draft.seoTitle.length)}/255</span>
                </CatalogField>
                <CatalogField
                  hint="Mô tả ngắn hiển thị trên kết quả tìm kiếm."
                  id="product-seo-description"
                  label="Mô tả tìm kiếm"
                >
                  <textarea
                    className={styles.nativeTextarea}
                    id="product-seo-description"
                    maxLength={500}
                    rows={3}
                    value={draft.seoDescription}
                    onChange={(event) => {
                      updateField('seoDescription', event.target.value);
                    }}
                  />
                  <span className={styles.counter}>{String(draft.seoDescription.length)}/500</span>
                </CatalogField>
              </div>
            </section>
          </div>

          <aside className={styles.sideStack} aria-label="Thông tin lưu sản phẩm">
            <section className={styles.asideCard}>
              <h2>Trạng thái</h2>
              <CatalogVoucherStatusChip label="Bản nháp" status="DRAFT" />
              <p className={styles.statusDescription}>Sản phẩm chưa hiển thị trên cửa hàng.</p>
            </section>

            <section className={styles.asideCard}>
              <h2>Sau khi lưu</h2>
              <ol className={styles.nextSteps}>
                <li>
                  <span className={styles.stepDot} aria-hidden="true" />
                  <span>Thêm biến thể</span>
                </li>
                <li>
                  <span className={styles.stepDot} aria-hidden="true" />
                  <span>Tải ảnh sản phẩm</span>
                </li>
                <li>
                  <span className={styles.stepDot} aria-hidden="true" />
                  <span>Kiểm tra trước khi mở bán</span>
                </li>
              </ol>
            </section>

            <section className={[styles.asideCard, styles.infoCard].filter(Boolean).join(' ')}>
              <InfoIcon aria-hidden="true" size={22} />
              <p>Bạn có thể bổ sung biến thể và hình ảnh sau khi tạo sản phẩm.</p>
            </section>
          </aside>
        </div>
        <footer className={styles.formActions} aria-label="Thao tác sản phẩm">
          <button
            className={styles.secondaryLink}
            disabled={pending}
            type="button"
            onClick={() => {
              if (dirty) setConfirmDiscard(true);
              else onCancel();
            }}
          >
            Hủy
          </button>
          <button className={styles.primaryLink} disabled={pending} type="submit">
            {pending ? 'Đang lưu…' : submitLabel}
          </button>
        </footer>
      </form>
      <BackofficeActionDialog
        cancelLabel="Tiếp tục chỉnh sửa"
        confirmLabel="Bỏ thay đổi"
        description="Thông tin bạn vừa nhập chưa được lưu và sẽ bị mất."
        destructive
        open={confirmDiscard || pendingNavigation !== null}
        title="Bỏ các thay đổi chưa lưu?"
        onCancel={() => {
          setConfirmDiscard(false);
          setPendingNavigation(null);
        }}
        onConfirm={() => {
          setBaseline(draft);
          setConfirmDiscard(false);
          const destination = pendingNavigation;
          setPendingNavigation(null);
          if (destination === null) onCancel();
          else onNavigateAway(destination);
        }}
      />
    </>
  );
}

interface CatalogFieldProps {
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
}

function CatalogField({ children, error, hint, id, label, required = false }: CatalogFieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {required ? <span className={styles.requiredMark}> *</span> : null}
      </label>
      {children}
      {hint === undefined ? null : <p className={styles.fieldHint}>{hint}</p>}
      {error === undefined ? null : (
        <p className={styles.fieldError} id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function fieldError(
  errors: readonly CatalogValidationError[],
  field: CatalogValidationError['field'],
): string | undefined {
  return errors.find((item) => item.field === field)?.message;
}
