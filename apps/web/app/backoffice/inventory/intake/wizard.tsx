'use client';

import type { components } from '@rephone/api-client';
import {
  CheckCircleIcon,
  DeviceMobileIcon,
  IdentificationCardIcon,
  ImageSquareIcon,
  MapPinIcon,
  PackageIcon,
  ShieldCheckIcon,
  StorefrontIcon,
  TagIcon,
} from '@phosphor-icons/react/ssr';
import { ErrorSummary, Input, Select } from '@/components/ui';
import { classNames } from '@/components/ui/class-names';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useAuth } from '../../../auth-provider';
import {
  inventoryAdminError,
  inventoryErrorRequiresRefetch,
  validateInventoryMediaFile,
} from '../../../../lib/backoffice-inventory-api';
import {
  INTAKE_FIELD_ORDER,
  firstInventoryIntakeErrorField,
  inventoryIntakeErrorItems,
  inventoryIntakeServerFieldErrors,
  validateInventoryIntakeDraft,
  type IntakeField,
  type IntakeFieldErrors,
} from './intake-form-model';
import { orderIphoneProducts, orderIphoneVariants } from './intake-option-order';
import { resolveIntakeStep } from './intake-progress';
import styles from './intake.module.css';

type ProductListItem = components['schemas']['BackofficeProductListItemDto'];
type ProductDetail = components['schemas']['BackofficeProductDetailDto'];
type Location = components['schemas']['InventoryLocationDto'];
type Unit = components['schemas']['InventoryUnitDetailDto'];
type Inspection = components['schemas']['InspectionDetailDto'];

const EMPTY_INTAKE = {
  productId: '',
  variantId: '',
  locationId: '',
  imei1: '',
  imei2: '',
  eid: '',
  serial: '',
  modelNumber: '',
  regionCode: 'VN/A',
  salePrice: '',
  compareAtPrice: '',
  warrantyDaysOverride: '',
  carrierName: '',
  simLockStatus: 'UNLOCKED' as 'UNLOCKED' | 'CARRIER_LOCKED' | 'UNKNOWN',
  simConfiguration: 'PHYSICAL_AND_ESIM' as
    'SINGLE_PHYSICAL' | 'DUAL_PHYSICAL' | 'PHYSICAL_AND_ESIM' | 'ESIM_ONLY' | 'UNKNOWN',
};

export function InventoryIntakeWizard() {
  const { client, status, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const unitId = searchParams.get('unitId');
  const inspectionId = searchParams.get('inspectionId');
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [intake, setIntake] = useState(EMPTY_INTAKE);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intakeErrors, setIntakeErrors] = useState<IntakeFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      client.GET('/api/v1/backoffice/products', {
        params: {
          query: {
            type: 'IPHONE',
            status: 'ACTIVE',
            sortBy: 'releaseYear',
            sortOrder: 'desc',
            page: 1,
            pageSize: 100,
          },
        },
      }),
      client.GET('/api/v1/backoffice/inventory-locations'),
    ])
      .then(([productResult, locationResult]) => {
        if (!active) return;
        if (productResult.data === undefined) throw apiRequestError(productResult.error);
        if (locationResult.data === undefined) throw apiRequestError(locationResult.error);
        const nextProducts = orderIphoneProducts(productResult.data.data);
        const nextLocations = locationResult.data.data.filter((item) => item.status === 'ACTIVE');
        setProducts(nextProducts);
        setLocations(nextLocations);
        setIntake((current) => ({
          ...current,
          productId: current.productId || nextProducts[0]?.id || '',
          locationId: current.locationId || nextLocations[0]?.id || '',
        }));
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isStaff, status]);

  useEffect(() => {
    if (!isStaff || intake.productId === '') return;
    let active = true;
    void client
      .GET('/api/v1/backoffice/products/{id}', {
        params: { path: { id: intake.productId } },
      })
      .then((result) => {
        if (!active) return;
        if (result.data === undefined) throw apiRequestError(result.error);
        const nextProduct = result.data.data;
        const variants = sellableVariants(nextProduct);
        setProduct(nextProduct);
        setIntake((current) => ({
          ...current,
          variantId: variants.some((variant) => variant.id === current.variantId)
            ? current.variantId
            : variants[0]?.id || '',
        }));
        clearIntakeErrors('variantId');
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      });
    return () => {
      active = false;
    };
  }, [client, intake.productId, isStaff]);

  useEffect(() => {
    if (!isStaff || unitId === null) {
      setUnit(null);
      setInspection(null);
      return;
    }
    let active = true;
    setLoading(true);
    void Promise.all([
      client.GET('/api/v1/backoffice/inventory-units/{id}', {
        params: { path: { id: unitId } },
      }),
      client.GET('/api/v1/backoffice/inventory-units/{id}/inspections', {
        params: { path: { id: unitId }, query: { page: 1, pageSize: 100 } },
      }),
    ])
      .then(async ([unitResult, listResult]) => {
        if (!active) return;
        if (unitResult.data === undefined) throw apiRequestError(unitResult.error);
        if (listResult.data === undefined) throw apiRequestError(listResult.error);
        const nextUnit = unitResult.data.data;
        setUnit(nextUnit);
        const requestedInspection =
          inspectionId === null
            ? undefined
            : listResult.data.data.find((item) => item.id === inspectionId);
        if (inspectionId !== null && requestedInspection === undefined) {
          setInspection(null);
          setNotice('Đường dẫn cũ không khớp với máy này. Đã mở lại dữ liệu an toàn.');
          replaceQuery(nextUnit.id);
          return;
        }
        const resumeId =
          requestedInspection?.id ??
          listResult.data.data.find((item) => item.status === 'DRAFT')?.id ??
          nextUnit.currentInspection?.id;
        if (resumeId === undefined) {
          setInspection(null);
          return;
        }
        const detail = await client.GET('/api/v1/backoffice/inspections/{id}', {
          params: { path: { id: resumeId } },
        });
        if (detail.data === undefined) throw apiRequestError(detail.error);
        acceptInspection(detail.data.data);
        if (inspectionId === null) replaceQuery(nextUnit.id, resumeId);
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, inspectionId, isStaff, unitId]);

  function replaceQuery(nextUnitId: string, nextInspectionId?: string) {
    const next = new URLSearchParams();
    next.set('unitId', nextUnitId);
    if (nextInspectionId !== undefined) next.set('inspectionId', nextInspectionId);
    router.replace(`/backoffice/inventory/intake?${next.toString()}`);
  }

  function acceptInspection(next: Inspection) {
    setInspection(next);
  }

  function submitIntake(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateInventoryIntakeDraft(intake);
    if (firstInventoryIntakeErrorField(validationErrors) !== undefined) {
      applyIntakeErrors(validationErrors);
      return;
    }
    setIntakeErrors({});
    void runAction('intake', async () => {
      const result = await client.POST('/api/v1/backoffice/inventory-units', {
        body: {
          variantId: intake.variantId,
          locationId: intake.locationId,
          simLockStatus: intake.simLockStatus,
          simConfiguration: intake.simConfiguration,
          ...(intake.imei1.trim() === '' ? {} : { imei1: intake.imei1 }),
          ...(intake.imei2.trim() === '' ? {} : { imei2: intake.imei2 }),
          ...(intake.eid.trim() === '' ? {} : { eid: intake.eid }),
          ...(intake.serial.trim() === '' ? {} : { serial: intake.serial }),
          ...(intake.modelNumber.trim() === '' ? {} : { modelNumber: intake.modelNumber }),
          ...(intake.regionCode.trim() === '' ? {} : { regionCode: intake.regionCode }),
          ...(intake.salePrice.trim() === '' ? {} : { salePrice: intake.salePrice }),
          ...(intake.compareAtPrice.trim() === '' ? {} : { compareAtPrice: intake.compareAtPrice }),
          ...(intake.warrantyDaysOverride.trim() === ''
            ? {}
            : { warrantyDaysOverride: Number(intake.warrantyDaysOverride) }),
          ...(intake.simLockStatus !== 'CARRIER_LOCKED' || intake.carrierName.trim() === ''
            ? {}
            : { carrierName: intake.carrierName.trim() }),
        },
      });
      if (result.data === undefined) {
        const serverErrors = inventoryIntakeServerFieldErrors(result.error, intake);
        if (firstInventoryIntakeErrorField(serverErrors) !== undefined) {
          applyIntakeErrors(serverErrors);
          return;
        }
        throw apiRequestError(result.error);
      }
      setUnit(result.data.data);
      setIntakeErrors({});
      setIntake((current) => ({
        ...current,
        eid: '',
        imei1: '',
        imei2: '',
        serial: '',
      }));
      replaceQuery(result.data.data.id);
      setNotice(`Đã tiếp nhận máy ${result.data.data.inventoryCode}. Tiến độ đã được lưu.`);
    });
  }

  function updateIntakeField<Field extends IntakeField>(
    field: Field,
    value: (typeof EMPTY_INTAKE)[Field],
    ...relatedFields: IntakeField[]
  ) {
    setIntake((current) => ({ ...current, [field]: value }));
    clearIntakeErrors(field, ...relatedFields);
  }

  function clearIntakeErrors(...fields: IntakeField[]) {
    setIntakeErrors((current) => {
      if (!fields.some((field) => current[field] !== undefined)) return current;
      const fieldsToClear = new Set(fields);
      return INTAKE_FIELD_ORDER.reduce<IntakeFieldErrors>((next, field) => {
        const message = current[field];
        if (!fieldsToClear.has(field) && message !== undefined) next[field] = message;
        return next;
      }, {});
    });
  }

  function applyIntakeErrors(next: IntakeFieldErrors) {
    setIntakeErrors(next);
    setError(null);
    setNotice(null);
    const firstField = firstInventoryIntakeErrorField(next);
    if (firstField === undefined) return;
    window.requestAnimationFrame(() => {
      const control = document.getElementById(`intake-${firstField}`);
      control?.focus({ preventScroll: true });
      control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function submitUpload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction('upload', async () => {
      if (unit === null || file === null) throw new Error('Hãy chọn một ảnh JPEG, PNG hoặc WebP.');
      const fileError = validateInventoryMediaFile(file);
      if (fileError !== null) throw new Error(fileError);
      const formData = new FormData();
      formData.set('file', file);
      formData.set('altText', `Ảnh thực tế ${unit.inventoryCode}`);
      formData.set('sortOrder', '0');
      const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/media', {
        params: { path: { id: unit.id } },
        body: { file, altText: `Ảnh thực tế ${unit.inventoryCode}`, sortOrder: 0 },
        bodySerializer: () => formData,
      });
      if (result.data === undefined) throw apiRequestError(result.error);
      await refreshUnit(unit.id);
      setFile(null);
      setNotice('Đã tải ảnh thực tế của máy lên thành công.');
    });
  }

  async function createInspection() {
    await runAction('inspection-create', async () => {
      if (unit === null) throw new Error('Chưa có máy để kiểm định.');
      const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/inspections', {
        params: { path: { id: unit.id } },
        body: { inspectionType: 'INTAKE' },
      });
      if (result.data === undefined) throw apiRequestError(result.error);
      acceptInspection(result.data.data);
      replaceQuery(unit.id, result.data.data.id);
      await refreshUnit(unit.id);
      setNotice('Đã tạo bản kiểm định nháp.');
      router.push(`/backoffice/inventory/inspections/${result.data.data.id}`);
    });
  }

  async function makeAvailable() {
    await runAction('make-available', async () => {
      if (unit === null) throw new Error('Chưa có máy.');
      const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/make-available', {
        params: { path: { id: unit.id } },
      });
      if (result.data === undefined) throw apiRequestError(result.error);
      setUnit(result.data.data);
      setNotice('Máy đã sẵn sàng bán và được cập nhật lên cửa hàng.');
    });
  }

  async function refreshUnit(id: string) {
    const result = await client.GET('/api/v1/backoffice/inventory-units/{id}', {
      params: { path: { id } },
    });
    if (result.data === undefined) throw apiRequestError(result.error);
    setUnit(result.data.data);
  }

  async function refreshCurrentState() {
    const currentUnitId = unit?.id ?? unitId;
    if (currentUnitId !== null) await refreshUnit(currentUnitId);
    if (inspection === null) return;
    const detail = await client.GET('/api/v1/backoffice/inspections/{id}', {
      params: { path: { id: inspection.id } },
    });
    if (detail.data === undefined) throw apiRequestError(detail.error);
    if (currentUnitId !== null && detail.data.data.inventoryUnitId !== currentUnitId) {
      setInspection(null);
      return;
    }
    acceptInspection(detail.data.data);
  }

  async function runAction(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      if (inventoryErrorRequiresRefetch(cause)) {
        try {
          await refreshCurrentState();
        } catch {
          // Giữ thông báo gốc; lần mở tiếp theo vẫn lấy dữ liệu mới nhất từ máy chủ.
        }
      }
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  if (status !== 'authenticated' || !isStaff) return null;

  const variants = product === null ? [] : sellableVariants(product);
  const completedPassed =
    inspection?.status === 'COMPLETED' && inspection.overallResult === 'PASSED';
  const inspectionNeedsAttention =
    inspection?.status === 'COMPLETED' && inspection.overallResult !== 'PASSED';
  const publicHref =
    unit === null ? null : `/products/${unit.product.slug}/units/${unit.inventoryCode}`;
  const activeStep = resolveIntakeStep({
    hasUnit: unit !== null,
    hasMedia: (unit?.mediaCount ?? 0) > 0,
    inspectionPassed: completedPassed,
    isAvailable: unit?.lifecycleStatus === 'AVAILABLE',
  });
  const selectedProductName =
    products.find((item) => item.id === intake.productId)?.name ?? 'Chưa chọn dòng máy';
  const selectedVariant = variants.find((item) => item.id === intake.variantId);
  const selectedLocationName =
    locations.find((item) => item.id === intake.locationId)?.name ?? 'Chưa chọn nơi nhận';

  return (
    <div className={styles.workspace}>
      <header className="wizard-header">
        <div>
          <p className="eyebrow">Kho hàng · Máy vật lý</p>
          <h1>Nhập máy vào kho</h1>
          <p>Tiếp nhận máy, bổ sung ảnh thực tế, kiểm định và chuẩn bị đưa lên bán.</p>
        </div>
        <Link className="button" href="/backoffice/inventory/units">
          Xem danh sách máy
        </Link>
      </header>

      <ol className={styles.progress} aria-label="Tiến độ nhập máy">
        <Progress number={1} label="Tiếp nhận" done={unit !== null} current={activeStep === 1} />
        <Progress
          number={2}
          label="Ảnh thực tế"
          done={(unit?.mediaCount ?? 0) > 0}
          current={activeStep === 2}
        />
        <Progress number={3} label="Kiểm định" done={completedPassed} current={activeStep === 3} />
        <Progress
          number={4}
          label="Sẵn sàng bán"
          done={unit?.lifecycleStatus === 'AVAILABLE'}
          current={activeStep === 4}
        />
        <Progress
          number={5}
          label="Trang sản phẩm"
          done={unit?.lifecycleStatus === 'AVAILABLE'}
          current={activeStep === 5}
        />
      </ol>

      {error !== null ? (
        <div className="wizard-alert error" ref={errorRef} role="alert" tabIndex={-1}>
          {error}
        </div>
      ) : null}
      {notice !== null ? (
        <div className="wizard-alert success" role="status">
          {notice}
        </div>
      ) : null}
      {loading ? <div className="status">Đang tải dữ liệu tiếp nhận máy…</div> : null}

      {unit === null ? (
        <div className={styles.intakeWorkbench}>
          <section className={styles.intakePanel} aria-labelledby="intake-title">
            <PanelHeading
              icon={<PackageIcon aria-hidden="true" size={22} />}
              id="intake-title"
              title="Tiếp nhận máy"
              description="Ghi nhận đúng dòng máy, mã nhận diện và thông tin bán hàng."
            />
            <form className={styles.intakeForm} noValidate onSubmit={submitIntake}>
              <ErrorSummary
                className={styles.formSummary}
                errors={inventoryIntakeErrorItems(intakeErrors)}
                title="Kiểm tra các mục cần sửa"
              />
              <IntakeSection
                icon={<DeviceMobileIcon aria-hidden="true" size={21} />}
                title="Dòng máy và nơi nhận"
              >
                <Select
                  error={intakeErrors.productId}
                  id="intake-productId"
                  label="Sản phẩm iPhone"
                  value={intake.productId}
                  onChange={(event) => {
                    setIntake((current) => ({
                      ...current,
                      productId: event.target.value,
                      variantId: '',
                    }));
                    clearIntakeErrors('productId', 'variantId');
                  }}
                  required
                >
                  {products.length === 0 ? (
                    <option value="">Chưa có sản phẩm phù hợp</option>
                  ) : null}
                  {products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <Select
                  error={intakeErrors.variantId}
                  id="intake-variantId"
                  label="Biến thể đang bán"
                  value={intake.variantId}
                  onChange={(event) => {
                    updateIntakeField('variantId', event.target.value);
                  }}
                  required
                >
                  {variants.length === 0 ? (
                    <option value="">Chưa có cấu hình đang bán</option>
                  ) : null}
                  {variants.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName} · {item.sku}
                    </option>
                  ))}
                </Select>
                <Select
                  containerClassName={styles.fieldWide ?? ''}
                  error={intakeErrors.locationId}
                  id="intake-locationId"
                  label="Địa điểm nhận"
                  value={intake.locationId}
                  onChange={(event) => {
                    updateIntakeField('locationId', event.target.value);
                  }}
                  required
                >
                  {locations.length === 0 ? (
                    <option value="">Chưa có địa điểm hoạt động</option>
                  ) : null}
                  {locations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.type === 'STORE' ? 'Cửa hàng' : 'Kho trung tâm'}
                    </option>
                  ))}
                </Select>
              </IntakeSection>

              <IntakeSection
                icon={<IdentificationCardIcon aria-hidden="true" size={21} />}
                title="Mã nhận diện"
              >
                <Input
                  error={intakeErrors.imei1}
                  hint="Bắt buộc nếu không có số sê-ri."
                  id="intake-imei1"
                  inputMode="numeric"
                  label="IMEI 1"
                  placeholder="15 chữ số"
                  value={intake.imei1}
                  onChange={(event) => {
                    updateIntakeField('imei1', event.target.value, 'serial');
                  }}
                />
                <Input
                  error={intakeErrors.serial}
                  hint="Có thể dùng thay IMEI chính."
                  id="intake-serial"
                  label="Số sê-ri"
                  maxLength={32}
                  placeholder="6–32 chữ cái hoặc chữ số"
                  value={intake.serial}
                  onChange={(event) => {
                    updateIntakeField('serial', event.target.value, 'imei1');
                  }}
                />
                <Input
                  error={intakeErrors.imei2}
                  id="intake-imei2"
                  inputMode="numeric"
                  label="IMEI 2"
                  placeholder="Không bắt buộc"
                  value={intake.imei2}
                  onChange={(event) => {
                    updateIntakeField('imei2', event.target.value);
                  }}
                />
                <Input
                  error={intakeErrors.eid}
                  id="intake-eid"
                  inputMode="numeric"
                  label="EID"
                  placeholder="32 chữ số nếu có"
                  value={intake.eid}
                  onChange={(event) => {
                    updateIntakeField('eid', event.target.value);
                  }}
                />
              </IntakeSection>

              <IntakeSection
                icon={<TagIcon aria-hidden="true" size={21} />}
                title="Giá bán và cấu hình"
              >
                <Input
                  error={intakeErrors.salePrice}
                  id="intake-salePrice"
                  inputMode="numeric"
                  label="Giá bán (đồng)"
                  value={intake.salePrice}
                  onChange={(event) => {
                    updateIntakeField('salePrice', event.target.value, 'compareAtPrice');
                  }}
                  required
                />
                <Input
                  error={intakeErrors.compareAtPrice}
                  hint="Nếu nhập, giá này phải từ giá bán trở lên."
                  id="intake-compareAtPrice"
                  inputMode="numeric"
                  label="Giá niêm yết (đồng)"
                  value={intake.compareAtPrice}
                  onChange={(event) => {
                    updateIntakeField('compareAtPrice', event.target.value);
                  }}
                />
                <Input
                  error={intakeErrors.modelNumber}
                  id="intake-modelNumber"
                  label="Mã kiểu máy"
                  maxLength={255}
                  value={intake.modelNumber}
                  onChange={(event) => {
                    updateIntakeField('modelNumber', event.target.value);
                  }}
                />
                <Input
                  error={intakeErrors.regionCode}
                  id="intake-regionCode"
                  label="Mã thị trường"
                  maxLength={255}
                  value={intake.regionCode}
                  onChange={(event) => {
                    updateIntakeField('regionCode', event.target.value);
                  }}
                />
                <Select
                  error={intakeErrors.simLockStatus}
                  id="intake-simLockStatus"
                  label="Tình trạng khóa mạng"
                  value={intake.simLockStatus}
                  onChange={(event) => {
                    updateIntakeField(
                      'simLockStatus',
                      event.target.value as typeof intake.simLockStatus,
                      'carrierName',
                    );
                  }}
                >
                  <option value="UNLOCKED">Không khóa mạng</option>
                  <option value="CARRIER_LOCKED">Khóa theo nhà mạng</option>
                  <option value="UNKNOWN">Chưa rõ</option>
                </Select>
                <Select
                  error={intakeErrors.simConfiguration}
                  id="intake-simConfiguration"
                  label="Cấu hình SIM"
                  value={intake.simConfiguration}
                  onChange={(event) => {
                    updateIntakeField(
                      'simConfiguration',
                      event.target.value as typeof intake.simConfiguration,
                    );
                  }}
                >
                  <option value="SINGLE_PHYSICAL">Một SIM vật lý</option>
                  <option value="PHYSICAL_AND_ESIM">SIM vật lý + eSIM</option>
                  <option value="DUAL_PHYSICAL">Hai SIM vật lý</option>
                  <option value="ESIM_ONLY">eSIM</option>
                  <option value="UNKNOWN">Chưa rõ</option>
                </Select>
                {intake.simLockStatus === 'CARRIER_LOCKED' ? (
                  <Input
                    error={intakeErrors.carrierName}
                    id="intake-carrierName"
                    label="Nhà mạng"
                    maxLength={255}
                    value={intake.carrierName}
                    onChange={(event) => {
                      updateIntakeField('carrierName', event.target.value);
                    }}
                    required
                  />
                ) : null}
                <Input
                  error={intakeErrors.warrantyDaysOverride}
                  id="intake-warrantyDaysOverride"
                  label="Bảo hành riêng (ngày)"
                  max="3650"
                  min="0"
                  placeholder="Để trống để dùng mặc định"
                  type="number"
                  value={intake.warrantyDaysOverride}
                  onChange={(event) => {
                    updateIntakeField('warrantyDaysOverride', event.target.value);
                  }}
                />
              </IntakeSection>
              <div className={styles.formActions}>
                <p>Thông tin được lưu sau khi máy được tiếp nhận thành công.</p>
                <button
                  className="button primary"
                  disabled={busy !== null || variants.length === 0}
                  type="submit"
                >
                  {busy === 'intake' ? 'Đang nhận máy…' : 'Nhận máy'}
                </button>
              </div>
            </form>
          </section>
          <IntakeSummary
            identifierCount={countIdentifiers(intake)}
            locationName={selectedLocationName}
            productName={selectedProductName}
            salePrice={intake.salePrice}
            variantName={selectedVariant?.displayName ?? 'Chưa chọn cấu hình'}
          />
        </div>
      ) : (
        <section className={styles.receivedSummary} aria-labelledby="received-title">
          <PanelHeading
            icon={<CheckCircleIcon aria-hidden="true" size={22} weight="fill" />}
            id="received-title"
            title="Máy đã được tiếp nhận"
            description="Tiến độ được lưu tự động; bạn có thể tiếp tục từ bước đang mở."
          />
          <UnitSummary unit={unit} />
        </section>
      )}

      {unit === null ? null : (
        <div className={styles.workflowStages} aria-label="Các bước hoàn tất hồ sơ máy">
          <WorkflowStage
            current={activeStep === 2}
            done={unit.mediaCount > 0}
            icon={<ImageSquareIcon aria-hidden="true" size={23} />}
            number={2}
            title="Ảnh thực tế của máy"
            description="Thêm tối thiểu một ảnh rõ nét của đúng chiếc máy."
          >
            <form className="wizard-inline" onSubmit={submitUpload}>
              <label>
                Ảnh JPEG, PNG hoặc WebP (tối đa 8 MiB)
                <input
                  key={file?.name ?? 'empty'}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                  }}
                  required
                />
              </label>
              <button className="button primary" disabled={busy !== null} type="submit">
                {busy === 'upload' ? 'Đang tải ảnh…' : 'Tải ảnh lên'}
              </button>
              <span>{unit.mediaCount} ảnh đã gắn</span>
            </form>
          </WorkflowStage>

          <WorkflowStage
            current={activeStep === 3}
            done={completedPassed}
            attention={inspectionNeedsAttention}
            icon={<ShieldCheckIcon aria-hidden="true" size={23} />}
            number={3}
            title="Kiểm định 18 hạng mục"
            description="Ghi nhận pin, ngoại hình và đầy đủ kết quả kỹ thuật."
          >
            {inspection === null ? (
              <button
                className="button primary"
                type="button"
                disabled={busy !== null}
                onClick={() => void createInspection()}
              >
                {busy === 'inspection-create' ? 'Đang tạo…' : 'Tạo phiếu kiểm định'}
              </button>
            ) : null}
            {inspection?.status === 'DRAFT' ? (
              <div className="wizard-actions">
                <p>Phiếu đang chờ kỹ thuật viên ghi nhận đủ 18 hạng mục.</p>
                <Link
                  className="button primary"
                  href={`/backoffice/inventory/inspections/${inspection.id}`}
                >
                  Tiếp tục kiểm định
                </Link>
              </div>
            ) : null}
            {inspection?.status === 'COMPLETED' ? (
              <div className="wizard-actions">
                <p className={`inspection-result ${inspection.overallResult.toLowerCase()}`}>
                  Kết quả: <strong>{inspectionResultLabel(inspection.overallResult)}</strong>
                </p>
                <Link
                  className="button"
                  href={`/backoffice/inventory/inspections/${inspection.id}`}
                >
                  Xem phiếu kiểm định
                </Link>
              </div>
            ) : null}
          </WorkflowStage>

          <WorkflowStage
            current={activeStep === 4}
            done={unit.lifecycleStatus === 'AVAILABLE'}
            icon={<StorefrontIcon aria-hidden="true" size={23} />}
            number={4}
            title="Đưa máy lên bán"
            description="Mở bán sau khi máy có ảnh và kết quả kiểm định đạt."
          >
            {unit.lifecycleStatus !== 'AVAILABLE' ? (
              <button
                className="button primary"
                type="button"
                disabled={busy !== null || !completedPassed || unit.mediaCount < 1}
                onClick={() => void makeAvailable()}
              >
                {busy === 'make-available' ? 'Đang cập nhật…' : 'Đưa máy lên bán'}
              </button>
            ) : null}
            {!completedPassed ? <p>Chỉ mở sau khi kiểm định hoàn tất với kết quả đạt.</p> : null}
          </WorkflowStage>

          <WorkflowStage
            current={activeStep === 5}
            done={unit.lifecycleStatus === 'AVAILABLE'}
            icon={<DeviceMobileIcon aria-hidden="true" size={23} />}
            number={5}
            title="Trang sản phẩm"
            description="Kiểm tra cách chiếc máy xuất hiện tại cửa hàng."
          >
            {unit.lifecycleStatus === 'AVAILABLE' && publicHref !== null ? (
              <Link className="button primary" href={publicHref}>
                Xem trang sản phẩm
              </Link>
            ) : (
              <p>Máy sẽ xuất hiện tại cửa hàng sau khi đáp ứng đủ điều kiện bán.</p>
            )}
          </WorkflowStage>
        </div>
      )}
    </div>
  );
}

function Progress({
  number,
  label,
  done,
  current,
}: {
  number: number;
  label: string;
  done: boolean;
  current: boolean;
}) {
  return (
    <li
      className={classNames(done && styles.progressDone, current && styles.progressCurrent)}
      aria-current={current ? 'step' : undefined}
    >
      <span aria-hidden="true">{done ? <CheckCircleIcon size={22} weight="fill" /> : number}</span>
      <strong>{label}</strong>
      <span className="rp-visually-hidden">
        {done ? 'Đã hoàn tất' : current ? 'Bước hiện tại' : 'Chưa hoàn tất'}
      </span>
    </li>
  );
}

function PanelHeading({
  icon,
  id,
  title,
  description,
}: {
  icon: ReactNode;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <header className={styles.panelHeading}>
      <span>{icon}</span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function IntakeSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.intakeSection}>
      <header>
        <span>{icon}</span>
        <h3>{title}</h3>
      </header>
      <div className={styles.sectionFields}>{children}</div>
    </section>
  );
}

function IntakeSummary({
  productName,
  variantName,
  locationName,
  identifierCount,
  salePrice,
}: {
  productName: string;
  variantName: string;
  locationName: string;
  identifierCount: number;
  salePrice: string;
}) {
  return (
    <aside className={styles.intakeSummary} aria-labelledby="intake-summary-title">
      <header>
        <span>
          <DeviceMobileIcon aria-hidden="true" size={22} />
        </span>
        <h2 id="intake-summary-title">Tóm tắt máy</h2>
      </header>
      <div className={styles.summaryHero}>
        <DeviceMobileIcon aria-hidden="true" size={58} weight="duotone" />
        <div>
          <strong>{productName}</strong>
          <span>{variantName}</span>
        </div>
      </div>
      <dl className={styles.summaryFacts}>
        <SummaryFact
          icon={<MapPinIcon aria-hidden="true" size={19} />}
          label="Nơi nhận"
          value={locationName}
        />
        <SummaryFact
          icon={<IdentificationCardIcon aria-hidden="true" size={19} />}
          label="Mã nhận diện"
          value={identifierCount === 0 ? 'Chưa nhập' : `Đã nhập ${String(identifierCount)} mã`}
        />
        <SummaryFact
          icon={<TagIcon aria-hidden="true" size={19} />}
          label="Giá bán"
          value={formatIntakePrice(salePrice)}
        />
      </dl>
      <div className={styles.summaryNotice}>
        <ShieldCheckIcon aria-hidden="true" size={22} />
        <p>Mã nhận diện đầy đủ được bảo vệ sau khi tiếp nhận.</p>
      </div>
    </aside>
  );
}

function SummaryFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt>
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function WorkflowStage({
  number,
  title,
  description,
  icon,
  current,
  done,
  attention = false,
  children,
}: {
  number: number;
  title: string;
  description: string;
  icon: ReactNode;
  current: boolean;
  done: boolean;
  attention?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={classNames(
        styles.workflowStage,
        current && styles.workflowStageCurrent,
        done && styles.workflowStageDone,
        attention && styles.workflowStageAttention,
      )}
    >
      <header>
        <span className={styles.workflowIcon}>
          {done ? <CheckCircleIcon size={23} weight="fill" /> : icon}
        </span>
        <div>
          <p>Bước {number}</p>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
        <strong>
          {attention
            ? 'Cần xử lý'
            : done
              ? 'Đã hoàn tất'
              : current
                ? 'Đang thực hiện'
                : 'Chưa hoàn tất'}
        </strong>
      </header>
      <div className={styles.workflowContent}>{children}</div>
    </section>
  );
}

function UnitSummary({ unit }: { unit: Unit }) {
  return (
    <dl className="unit-resume">
      <div>
        <dt>Mã máy</dt>
        <dd>{unit.inventoryCode}</dd>
      </div>
      <div>
        <dt>Trạng thái</dt>
        <dd>{unitLifecycleLabel(unit.lifecycleStatus)}</dd>
      </div>
      <div>
        <dt>Biến thể</dt>
        <dd>{unit.variant.displayName}</dd>
      </div>
      <div>
        <dt>Địa điểm</dt>
        <dd>{unit.location.name}</dd>
      </div>
      <div>
        <dt>Định danh</dt>
        <dd>
          {unit.maskedIdentifiers
            .map((item) => `${identifierLabel(item.type)}: ${item.maskedValue}`)
            .join(' · ')}
        </dd>
      </div>
    </dl>
  );
}

function countIdentifiers(intake: typeof EMPTY_INTAKE): number {
  return [intake.imei1, intake.imei2, intake.serial, intake.eid].filter(
    (value) => value.trim() !== '',
  ).length;
}

function formatIntakePrice(value: string): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return 'Chưa nhập';
  return `${new Intl.NumberFormat('vi-VN').format(Number(normalized))} đ`;
}

function sellableVariants(product: ProductDetail) {
  return orderIphoneVariants(
    product.variants.filter(
      (variant) => variant.status === 'ACTIVE' && variant.inventoryMode === 'SERIALIZED',
    ),
  );
}

function apiRequestError(value: unknown): Error {
  return inventoryAdminError(value, 'Không thể kết nối tới hệ thống. Hãy thử lại.');
}

function inspectionResultLabel(value: Inspection['overallResult']): string {
  if (value === 'PASSED') return 'Đạt';
  if (value === 'PARTIAL') return 'Cần xử lý';
  if (value === 'FAILED') return 'Không đạt';
  return 'Chưa hoàn tất';
}

function unitLifecycleLabel(value: Unit['lifecycleStatus']): string {
  if (value === 'RECEIVED') return 'Đã tiếp nhận';
  if (value === 'INSPECTING') return 'Đang kiểm định';
  if (value === 'AVAILABLE') return 'Sẵn sàng bán';
  if (value === 'IN_TRANSIT') return 'Đang chuyển kho';
  if (value === 'SOLD') return 'Đã bán';
  if (value === 'REPAIRING') return 'Đang sửa chữa';
  if (value === 'QUARANTINED') return 'Đang cách ly';
  return 'Đã loại khỏi kho';
}

function identifierLabel(value: Unit['maskedIdentifiers'][number]['type']): string {
  if (value === 'IMEI_1') return 'IMEI chính';
  if (value === 'IMEI_2') return 'IMEI phụ';
  if (value === 'SERIAL') return 'Số sê-ri';
  return 'EID';
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : 'Đã có lỗi không xác định.';
}
