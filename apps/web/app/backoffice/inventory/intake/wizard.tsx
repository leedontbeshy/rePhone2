'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '../../../auth-provider';
import {
  inventoryAdminError,
  inventoryErrorRequiresRefetch,
  validateInventoryMediaFile,
} from '../../../../lib/backoffice-inventory-api';
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
        params: { query: { type: 'IPHONE', status: 'ACTIVE', page: 1, pageSize: 100 } },
      }),
      client.GET('/api/v1/backoffice/inventory-locations'),
    ])
      .then(([productResult, locationResult]) => {
        if (!active) return;
        if (productResult.data === undefined) throw apiRequestError(productResult.error);
        if (locationResult.data === undefined) throw apiRequestError(locationResult.error);
        const nextProducts = productResult.data.data;
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
    void runAction('intake', async () => {
      if (intake.variantId === '' || intake.locationId === '') {
        throw new Error('Hãy chọn biến thể và địa điểm nhận máy.');
      }
      if (intake.imei1.trim() === '' && intake.serial.trim() === '') {
        throw new Error('Cần nhập ít nhất IMEI chính hoặc số sê-ri.');
      }
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
      if (result.data === undefined) throw apiRequestError(result.error);
      setUnit(result.data.data);
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
  const publicHref =
    unit === null ? null : `/products/${unit.product.slug}/units/${unit.inventoryCode}`;

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

      <ol className="wizard-progress" aria-label="Tiến độ nhập máy">
        <Progress label="Tiếp nhận" done={unit !== null} />
        <Progress label="Ảnh thực tế" done={(unit?.mediaCount ?? 0) > 0} />
        <Progress label="Kiểm định" done={inspection?.status === 'COMPLETED'} />
        <Progress label="Sẵn sàng bán" done={unit?.lifecycleStatus === 'AVAILABLE'} />
        <Progress label="Trang sản phẩm" done={unit?.lifecycleStatus === 'AVAILABLE'} />
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

      <section className="wizard-card" aria-labelledby="intake-title">
        <StepHeading number="1" id="intake-title" title="Tiếp nhận máy" done={unit !== null} />
        {unit === null ? (
          <form className="wizard-form" onSubmit={submitIntake}>
            <label>
              Sản phẩm iPhone
              <select
                value={intake.productId}
                onChange={(event) => {
                  setIntake({ ...intake, productId: event.target.value, variantId: '' });
                }}
                required
              >
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Biến thể đang bán
              <select
                value={intake.variantId}
                onChange={(event) => {
                  setIntake({ ...intake, variantId: event.target.value });
                }}
                required
              >
                {variants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName} · {item.sku}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Địa điểm nhận
              <select
                value={intake.locationId}
                onChange={(event) => {
                  setIntake({ ...intake, locationId: event.target.value });
                }}
                required
              >
                {locations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.type === 'STORE' ? 'Cửa hàng' : 'Kho trung tâm'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              IMEI 1
              <input
                value={intake.imei1}
                onChange={(event) => {
                  setIntake({ ...intake, imei1: event.target.value });
                }}
                inputMode="numeric"
                placeholder="15 chữ số"
              />
            </label>
            <label>
              IMEI 2
              <input
                value={intake.imei2}
                onChange={(event) => {
                  setIntake({ ...intake, imei2: event.target.value });
                }}
                inputMode="numeric"
                placeholder="Không bắt buộc"
              />
            </label>
            <label>
              Số sê-ri
              <input
                value={intake.serial}
                onChange={(event) => {
                  setIntake({ ...intake, serial: event.target.value });
                }}
                minLength={6}
                maxLength={32}
                placeholder="Ít nhất IMEI hoặc số sê-ri"
              />
            </label>
            <label>
              EID
              <input
                value={intake.eid}
                onChange={(event) => {
                  setIntake({ ...intake, eid: event.target.value });
                }}
                inputMode="numeric"
                placeholder="32 chữ số nếu có"
              />
            </label>
            <label>
              Giá bán (VND)
              <input
                value={intake.salePrice}
                onChange={(event) => {
                  setIntake({ ...intake, salePrice: event.target.value });
                }}
                inputMode="numeric"
                pattern="[0-9]{1,15}"
                required
              />
            </label>
            <label>
              Giá niêm yết (VND)
              <input
                value={intake.compareAtPrice}
                onChange={(event) => {
                  setIntake({ ...intake, compareAtPrice: event.target.value });
                }}
                inputMode="numeric"
                pattern="[0-9]{1,15}"
              />
            </label>
            <label>
              Mã kiểu máy
              <input
                value={intake.modelNumber}
                onChange={(event) => {
                  setIntake({ ...intake, modelNumber: event.target.value });
                }}
              />
            </label>
            <label>
              Mã thị trường
              <input
                value={intake.regionCode}
                onChange={(event) => {
                  setIntake({ ...intake, regionCode: event.target.value });
                }}
              />
            </label>
            <label>
              Tình trạng khóa mạng
              <select
                value={intake.simLockStatus}
                onChange={(event) => {
                  setIntake({
                    ...intake,
                    simLockStatus: event.target.value as typeof intake.simLockStatus,
                  });
                }}
              >
                <option value="UNLOCKED">Không khóa mạng</option>
                <option value="CARRIER_LOCKED">Khóa theo nhà mạng</option>
                <option value="UNKNOWN">Chưa rõ</option>
              </select>
            </label>
            {intake.simLockStatus === 'CARRIER_LOCKED' ? (
              <label>
                Nhà mạng
                <input
                  required
                  value={intake.carrierName}
                  onChange={(event) => {
                    setIntake({ ...intake, carrierName: event.target.value });
                  }}
                />
              </label>
            ) : null}
            <label>
              Cấu hình SIM
              <select
                value={intake.simConfiguration}
                onChange={(event) => {
                  setIntake({
                    ...intake,
                    simConfiguration: event.target.value as typeof intake.simConfiguration,
                  });
                }}
              >
                <option value="SINGLE_PHYSICAL">Một SIM vật lý</option>
                <option value="PHYSICAL_AND_ESIM">SIM vật lý + eSIM</option>
                <option value="DUAL_PHYSICAL">Hai SIM vật lý</option>
                <option value="ESIM_ONLY">eSIM</option>
                <option value="UNKNOWN">Chưa rõ</option>
              </select>
            </label>
            <label>
              Bảo hành riêng (ngày)
              <input
                min="0"
                type="number"
                value={intake.warrantyDaysOverride}
                onChange={(event) => {
                  setIntake({ ...intake, warrantyDaysOverride: event.target.value });
                }}
                placeholder="Để trống để dùng mặc định"
              />
            </label>
            <div className="wizard-actions">
              <button
                className="button primary"
                disabled={busy !== null || variants.length === 0}
                type="submit"
              >
                {busy === 'intake' ? 'Đang nhận máy…' : 'Nhận máy'}
              </button>
            </div>
          </form>
        ) : (
          <UnitSummary unit={unit} />
        )}
      </section>

      <section className="wizard-card" aria-labelledby="media-title">
        <StepHeading
          number="2"
          id="media-title"
          title="Ảnh thực tế của máy"
          done={(unit?.mediaCount ?? 0) > 0}
        />
        {unit === null ? (
          <p>Hoàn tất bước tiếp nhận trước.</p>
        ) : (
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
        )}
      </section>

      <section className="wizard-card" aria-labelledby="inspection-title">
        <StepHeading
          number="3"
          id="inspection-title"
          title="Kiểm định 18 hạng mục"
          done={inspection?.status === 'COMPLETED'}
        />
        {unit !== null && inspection === null ? (
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
            <Link className="button" href={`/backoffice/inventory/inspections/${inspection.id}`}>
              Xem phiếu kiểm định
            </Link>
          </div>
        ) : null}
      </section>

      <section className="wizard-card" aria-labelledby="available-title">
        <StepHeading
          number="4"
          id="available-title"
          title="Đưa máy lên bán"
          done={unit?.lifecycleStatus === 'AVAILABLE'}
        />
        {unit !== null && unit.lifecycleStatus !== 'AVAILABLE' ? (
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
      </section>

      <section className="wizard-card" aria-labelledby="public-title">
        <StepHeading
          number="5"
          id="public-title"
          title="Trang sản phẩm"
          done={unit?.lifecycleStatus === 'AVAILABLE'}
        />
        {unit?.lifecycleStatus === 'AVAILABLE' && publicHref !== null ? (
          <Link className="button primary" href={publicHref}>
            Xem trang sản phẩm
          </Link>
        ) : (
          <p>Máy sẽ xuất hiện tại cửa hàng sau khi đáp ứng đủ điều kiện bán.</p>
        )}
      </section>
    </div>
  );
}

function Progress({ label, done }: { label: string; done: boolean }) {
  return (
    <li className={done ? 'done' : ''}>
      <span aria-hidden="true">{done ? '✓' : '·'}</span>
      {label}
    </li>
  );
}

function StepHeading({
  number,
  id,
  title,
  done,
}: {
  number: string;
  id: string;
  title: string;
  done: boolean;
}) {
  return (
    <div className="step-heading">
      <span>{done ? '✓' : number}</span>
      <h2 id={id}>{title}</h2>
    </div>
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

function sellableVariants(product: ProductDetail) {
  return product.variants.filter(
    (variant) => variant.status === 'ACTIVE' && variant.inventoryMode === 'SERIALIZED',
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
