'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '../../../auth-provider';
import {
  allPassChecklist,
  CHECK_STATUSES,
  checklistFromApi,
  checklistPayload,
  IPHONE_CHECKLIST_V1,
  type ChecklistDraft,
} from '../../../../lib/inventory-intake';

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
  serial: '',
  modelNumber: '',
  regionCode: 'VN/A',
  salePrice: '',
  simLockStatus: 'UNLOCKED' as const,
  simConfiguration: 'PHYSICAL_AND_ESIM' as const,
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
  const [checks, setChecks] = useState<ChecklistDraft>(allPassChecklist);
  const [batteryHealth, setBatteryHealth] = useState('90');
  const [conditionGrade, setConditionGrade] = useState<'A' | 'B' | 'C'>('A');
  const [batteryReplacement, setBatteryReplacement] = useState<'ORIGINAL' | 'REPLACED' | 'UNKNOWN'>(
    'ORIGINAL',
  );
  const [repairHistory, setRepairHistory] = useState<'NONE_KNOWN' | 'KNOWN' | 'UNKNOWN'>(
    'NONE_KNOWN',
  );
  const [repairNotes, setRepairNotes] = useState('');
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
        const resumeId =
          inspectionId ??
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
    setChecks(checklistFromApi(next.checks));
    if (next.batteryHealthPercent !== null && next.batteryHealthPercent !== undefined) {
      setBatteryHealth(String(next.batteryHealthPercent));
    }
    if (next.conditionGrade !== null && next.conditionGrade !== undefined) {
      setConditionGrade(next.conditionGrade);
    }
    setBatteryReplacement(next.batteryReplacementStatus);
    setRepairHistory(next.repairHistoryStatus);
    setRepairNotes(next.repairNotes ?? '');
  }

  function submitIntake(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction('intake', async () => {
      if (intake.variantId === '' || intake.locationId === '') {
        throw new Error('Hãy chọn variant và địa điểm nhận máy.');
      }
      if (intake.imei1.trim() === '' && intake.serial.trim() === '') {
        throw new Error('Cần nhập ít nhất IMEI 1 hoặc serial.');
      }
      const result = await client.POST('/api/v1/backoffice/inventory-units', {
        body: {
          variantId: intake.variantId,
          locationId: intake.locationId,
          simLockStatus: intake.simLockStatus,
          simConfiguration: intake.simConfiguration,
          ...(intake.imei1.trim() === '' ? {} : { imei1: intake.imei1 }),
          ...(intake.serial.trim() === '' ? {} : { serial: intake.serial }),
          ...(intake.modelNumber.trim() === '' ? {} : { modelNumber: intake.modelNumber }),
          ...(intake.regionCode.trim() === '' ? {} : { regionCode: intake.regionCode }),
          ...(intake.salePrice.trim() === '' ? {} : { salePrice: intake.salePrice }),
        },
      });
      if (result.data === undefined) throw apiRequestError(result.error);
      setUnit(result.data.data);
      replaceQuery(result.data.data.id);
      setNotice(`Đã nhận máy ${result.data.data.inventoryCode}. URL đã được lưu để resume.`);
    });
  }

  function submitUpload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction('upload', async () => {
      if (unit === null || file === null) throw new Error('Hãy chọn một ảnh JPEG, PNG hoặc WebP.');
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
      setNotice('Ảnh unit đã được upload và gắn metadata thành công.');
    });
  }

  async function createInspection() {
    await runAction('inspection-create', async () => {
      if (unit === null) throw new Error('Chưa có unit để kiểm định.');
      const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/inspections', {
        params: { path: { id: unit.id } },
        body: { inspectionType: 'INTAKE' },
      });
      if (result.data === undefined) throw apiRequestError(result.error);
      acceptInspection(result.data.data);
      replaceQuery(unit.id, result.data.data.id);
      await refreshUnit(unit.id);
      setNotice('Đã tạo bản kiểm định nháp.');
    });
  }

  function saveInspection(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction('inspection-save', async () => {
      if (inspection === null) throw new Error('Chưa có bản kiểm định nháp.');
      const result = await client.PATCH('/api/v1/backoffice/inspections/{id}', {
        params: { path: { id: inspection.id } },
        body: {
          batteryHealthPercent: Number(batteryHealth),
          batteryReplacementStatus: batteryReplacement,
          conditionGrade,
          checks: checklistPayload(checks) as never,
          repairHistoryStatus: repairHistory,
          ...(repairNotes.trim() === '' ? {} : { repairNotes }),
        },
      });
      if (result.data === undefined) throw apiRequestError(result.error);
      acceptInspection(result.data.data);
      setNotice('Đã lưu đủ dữ liệu kiểm định nháp.');
    });
  }

  async function completeInspection() {
    await runAction('inspection-complete', async () => {
      if (inspection === null || unit === null) throw new Error('Chưa có bản kiểm định.');
      const result = await client.POST('/api/v1/backoffice/inspections/{id}/complete', {
        params: { path: { id: inspection.id } },
      });
      if (result.data === undefined) throw apiRequestError(result.error);
      acceptInspection(result.data.data);
      await refreshUnit(unit.id);
      setNotice(`Đã hoàn tất kiểm định với kết quả ${result.data.data.overallResult}.`);
    });
  }

  async function makeAvailable() {
    await runAction('make-available', async () => {
      if (unit === null) throw new Error('Chưa có unit.');
      const result = await client.POST('/api/v1/backoffice/inventory-units/{id}/make-available', {
        params: { path: { id: unit.id } },
      });
      if (result.data === undefined) throw apiRequestError(result.error);
      setUnit(result.data.data);
      setNotice('Unit đã AVAILABLE và public catalog đọc trực tiếp được ngay.');
    });
  }

  async function refreshUnit(id: string) {
    const result = await client.GET('/api/v1/backoffice/inventory-units/{id}', {
      params: { path: { id } },
    });
    if (result.data === undefined) throw apiRequestError(result.error);
    setUnit(result.data.data);
  }

  async function runAction(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  if (status === 'loading') {
    return (
      <main className="backoffice-shell">
        <div className="status">Đang kiểm tra quyền truy cập…</div>
      </main>
    );
  }
  if (status === 'anonymous') {
    return (
      <AccessCard
        title="Cần đăng nhập"
        detail="Đăng nhập bằng tài khoản nhân viên để mở wizard."
        login
      />
    );
  }
  if (!isStaff) {
    return (
      <AccessCard
        title="Không có quyền truy cập"
        detail="Route này chỉ dành cho EMPLOYEE và ADMIN."
      />
    );
  }

  const variants = product === null ? [] : sellableVariants(product);
  const completedPassed =
    inspection?.status === 'COMPLETED' && inspection.overallResult === 'PASSED';
  const publicHref =
    unit === null ? null : `/products/${unit.product.slug}/units/${unit.inventoryCode}`;

  return (
    <main className="backoffice-shell">
      <header className="wizard-header">
        <div>
          <p className="eyebrow">Backoffice · Slice 04</p>
          <h1>Nhập và kiểm định iPhone</h1>
          <p>RECEIVED → INSPECTING → AVAILABLE, lưu tiến độ bằng URL.</p>
        </div>
        <Link className="button" href="/">
          Về trang chủ
        </Link>
      </header>

      <ol className="wizard-progress" aria-label="Tiến độ nhập máy">
        <Progress label="Intake" done={unit !== null} />
        <Progress label="Ảnh unit" done={(unit?.mediaCount ?? 0) > 0} />
        <Progress label="Inspection" done={inspection?.status === 'COMPLETED'} />
        <Progress label="Available" done={unit?.lifecycleStatus === 'AVAILABLE'} />
        <Progress label="Public detail" done={unit?.lifecycleStatus === 'AVAILABLE'} />
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
      {loading ? <div className="status">Đang tải dữ liệu wizard…</div> : null}

      <section className="wizard-card" aria-labelledby="intake-title">
        <StepHeading number="1" id="intake-title" title="Intake unit" done={unit !== null} />
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
              Variant active
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
                    {item.name} · {item.type}
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
                placeholder="15 chữ số, có Luhn hợp lệ"
              />
            </label>
            <label>
              Serial
              <input
                value={intake.serial}
                onChange={(event) => {
                  setIntake({ ...intake, serial: event.target.value });
                }}
                minLength={6}
                maxLength={32}
                placeholder="Ít nhất IMEI hoặc serial"
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
              Model number
              <input
                value={intake.modelNumber}
                onChange={(event) => {
                  setIntake({ ...intake, modelNumber: event.target.value });
                }}
              />
            </label>
            <label>
              Region
              <input
                value={intake.regionCode}
                onChange={(event) => {
                  setIntake({ ...intake, regionCode: event.target.value });
                }}
              />
            </label>
            <label>
              SIM lock
              <select
                value={intake.simLockStatus}
                onChange={(event) => {
                  setIntake({
                    ...intake,
                    simLockStatus: event.target.value as typeof intake.simLockStatus,
                  });
                }}
              >
                <option value="UNLOCKED">Unlocked</option>
                <option value="UNKNOWN">Chưa rõ</option>
              </select>
            </label>
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
                <option value="PHYSICAL_AND_ESIM">SIM vật lý + eSIM</option>
                <option value="DUAL_PHYSICAL">Hai SIM vật lý</option>
                <option value="ESIM_ONLY">eSIM</option>
                <option value="UNKNOWN">Chưa rõ</option>
              </select>
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
          title="Upload ảnh unit"
          done={(unit?.mediaCount ?? 0) > 0}
        />
        {unit === null ? (
          <p>Hoàn tất intake trước.</p>
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
              {busy === 'upload' ? 'Đang upload…' : 'Upload ảnh'}
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
            {busy === 'inspection-create' ? 'Đang tạo…' : 'Tạo inspection nháp'}
          </button>
        ) : null}
        {inspection?.status === 'DRAFT' ? (
          <form className="inspection-form" onSubmit={saveInspection}>
            <div className="wizard-form compact">
              <label>
                Battery health (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={batteryHealth}
                  onChange={(event) => {
                    setBatteryHealth(event.target.value);
                  }}
                  required
                />
              </label>
              <label>
                Condition grade
                <select
                  value={conditionGrade}
                  onChange={(event) => {
                    setConditionGrade(event.target.value as typeof conditionGrade);
                  }}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </label>
              <label>
                Tình trạng pin
                <select
                  value={batteryReplacement}
                  onChange={(event) => {
                    setBatteryReplacement(event.target.value as typeof batteryReplacement);
                  }}
                >
                  <option value="ORIGINAL">Nguyên bản</option>
                  <option value="REPLACED">Đã thay</option>
                  <option value="UNKNOWN">Chưa rõ</option>
                </select>
              </label>
              <label>
                Lịch sử sửa chữa
                <select
                  value={repairHistory}
                  onChange={(event) => {
                    setRepairHistory(event.target.value as typeof repairHistory);
                  }}
                >
                  <option value="NONE_KNOWN">Không ghi nhận</option>
                  <option value="KNOWN">Có sửa chữa</option>
                  <option value="UNKNOWN">Chưa rõ</option>
                </select>
              </label>
              {repairHistory === 'KNOWN' ? (
                <label className="field-wide">
                  Ghi chú sửa chữa
                  <textarea
                    value={repairNotes}
                    onChange={(event) => {
                      setRepairNotes(event.target.value);
                    }}
                    required
                  />
                </label>
              ) : null}
            </div>
            <div className="checklist-heading">
              <h3>Checklist schema v1</h3>
              <button
                className="button"
                type="button"
                onClick={() => {
                  setChecks(allPassChecklist());
                }}
              >
                Đánh dấu tất cả PASS
              </button>
            </div>
            <div className="checklist-grid">
              {IPHONE_CHECKLIST_V1.map(([key, label]) => (
                <fieldset key={key}>
                  <legend>{label}</legend>
                  <label>
                    Trạng thái
                    <select
                      value={checks[key].status}
                      onChange={(event) => {
                        setChecks({
                          ...checks,
                          [key]: {
                            ...checks[key],
                            status: event.target.value as ChecklistDraft[typeof key]['status'],
                          },
                        });
                      }}
                    >
                      {CHECK_STATUSES.map((value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ghi chú
                    <input
                      value={checks[key].note}
                      onChange={(event) => {
                        setChecks({
                          ...checks,
                          [key]: { ...checks[key], note: event.target.value },
                        });
                      }}
                      required={['FAIL', 'DEGRADED', 'NOT_TESTED', 'UNKNOWN'].includes(
                        checks[key].status,
                      )}
                    />
                  </label>
                </fieldset>
              ))}
            </div>
            <div className="wizard-actions">
              <button className="button primary" disabled={busy !== null} type="submit">
                {busy === 'inspection-save' ? 'Đang lưu…' : 'Lưu inspection'}
              </button>
              <button
                className="button"
                disabled={busy !== null}
                type="button"
                onClick={() => void completeInspection()}
              >
                {busy === 'inspection-complete' ? 'Đang complete…' : 'Complete inspection'}
              </button>
            </div>
          </form>
        ) : null}
        {inspection?.status === 'COMPLETED' ? (
          <p className={`inspection-result ${inspection.overallResult.toLowerCase()}`}>
            Kết quả: <strong>{inspection.overallResult}</strong>
          </p>
        ) : null}
      </section>

      <section className="wizard-card" aria-labelledby="available-title">
        <StepHeading
          number="4"
          id="available-title"
          title="Make available"
          done={unit?.lifecycleStatus === 'AVAILABLE'}
        />
        {unit !== null && unit.lifecycleStatus !== 'AVAILABLE' ? (
          <button
            className="button primary"
            type="button"
            disabled={busy !== null || !completedPassed || unit.mediaCount < 1}
            onClick={() => void makeAvailable()}
          >
            {busy === 'make-available' ? 'Đang chuyển…' : 'Make available'}
          </button>
        ) : null}
        {!completedPassed ? <p>Chỉ mở sau khi inspection hoàn tất với kết quả PASSED.</p> : null}
      </section>

      <section className="wizard-card" aria-labelledby="public-title">
        <StepHeading
          number="5"
          id="public-title"
          title="Public detail"
          done={unit?.lifecycleStatus === 'AVAILABLE'}
        />
        {unit?.lifecycleStatus === 'AVAILABLE' && publicHref !== null ? (
          <Link className="button primary" href={publicHref}>
            Mở public unit detail
          </Link>
        ) : (
          <p>Unit sẽ xuất hiện trực tiếp từ PostgreSQL sau khi AVAILABLE.</p>
        )}
      </section>
    </main>
  );
}

function AccessCard({
  title,
  detail,
  login = false,
}: {
  title: string;
  detail: string;
  login?: boolean;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Backoffice</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        <div className="actions">
          {login ? (
            <Link className="button primary" href="/login?next=/backoffice/inventory/intake">
              Đăng nhập
            </Link>
          ) : null}
          <Link className="button" href="/">
            Về trang chủ
          </Link>
        </div>
      </section>
    </main>
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
        <dt>Inventory code</dt>
        <dd>{unit.inventoryCode}</dd>
      </div>
      <div>
        <dt>Trạng thái</dt>
        <dd>{unit.lifecycleStatus}</dd>
      </div>
      <div>
        <dt>Variant</dt>
        <dd>{unit.variant.displayName}</dd>
      </div>
      <div>
        <dt>Địa điểm</dt>
        <dd>{unit.location.name}</dd>
      </div>
      <div>
        <dt>Identifier</dt>
        <dd>
          {unit.maskedIdentifiers.map((item) => `${item.type}: ${item.maskedValue}`).join(' · ')}
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
  if (isRecord(value) && isRecord(value['error'])) {
    const payload = value['error'];
    const code = typeof payload['code'] === 'string' ? payload['code'] : 'API_ERROR';
    const message =
      typeof payload['message'] === 'string' ? payload['message'] : 'Yêu cầu không thành công.';
    return new Error(`${code}: ${friendlyCode(code, message)}`);
  }
  return new Error('Không thể kết nối API. Hãy thử lại.');
}

function friendlyCode(code: string, fallback: string) {
  if (code === 'CONCURRENT_MODIFICATION')
    return 'Dữ liệu vừa được thay đổi ở phiên khác. Hãy tải lại bước này.';
  if (code === 'INVALID_STATE_TRANSITION') return 'Trạng thái unit không cho phép thao tác này.';
  if (code === 'INVENTORY_INSPECTION_REQUIRED') return 'Cần một inspection PASSED hiện hành.';
  if (code === 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET')
    return 'Thiếu giá, ảnh, identifier hoặc catalog/location chưa active.';
  if (code === 'FILE_TOO_LARGE') return 'Ảnh vượt quá 8 MiB.';
  if (code === 'UNSUPPORTED_FILE_TYPE') return 'Ảnh không phải JPEG, PNG hoặc WebP hợp lệ.';
  if (code === 'STORAGE_UNAVAILABLE')
    return 'Storage tạm thời không sẵn sàng; có thể retry upload.';
  return fallback;
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : 'Đã có lỗi không xác định.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
