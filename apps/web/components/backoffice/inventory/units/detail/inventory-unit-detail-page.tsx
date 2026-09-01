'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { InventoryShell } from '@/components/backoffice';
import { Button, InlineAlert, Skeleton } from '@/components/ui';
import {
  createInventoryUnitInspection,
  getInventoryUnit,
  inventoryErrorRequiresRefetch,
  listInventoryLocations,
  listInventoryUnitInspections,
  makeInventoryUnitAvailable,
  quarantineInventoryUnit,
  revealInventoryUnitIdentifiers,
  sendInventoryUnitToRepair,
  transferInventoryUnit,
  updateInventoryUnit,
  uploadInventoryUnitMedia,
  writeOffInventoryUnit,
  type EphemeralInventoryIdentifiers,
  type InventoryInspectionSummary,
  type InventoryInspectionType,
  type InventoryLocation,
  type InventoryMediaUploadInput,
  type InventoryUnitDetail,
  type UpdateInventoryUnitInput,
} from '@/lib/backoffice-inventory-api';
import { AdminInventoryCostPanel } from './admin-inventory-cost-panel';
import {
  InventoryUnitDetailView,
  type InventoryLifecycleCommand,
} from './inventory-unit-detail-view';
import styles from './inventory-unit-detail.module.css';

export interface InventoryUnitDetailPageProps {
  readonly unitId: string;
}

interface InventoryUnitCoreProjection {
  readonly inspections: readonly InventoryInspectionSummary[];
  readonly locations: readonly InventoryLocation[];
  readonly unit: InventoryUnitDetail;
}

export function InventoryUnitDetailPage({ unitId }: InventoryUnitDetailPageProps) {
  const router = useRouter();
  const { client, status, user } = useAuth();
  const canLoad =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN');
  const [unit, setUnit] = useState<InventoryUnitDetail | null>(null);
  const [inspections, setInspections] = useState<readonly InventoryInspectionSummary[]>([]);
  const [locations, setLocations] = useState<readonly InventoryLocation[]>([]);
  const [identifiers, setIdentifiers] = useState<EphemeralInventoryIdentifiers | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionGeneration = useRef(0);

  useEffect(() => {
    sessionGeneration.current += 1;
    return () => {
      sessionGeneration.current += 1;
    };
  }, [client, status, unitId, user?.role]);

  const readCoreProjection = useCallback(async (signal?: AbortSignal): Promise<InventoryUnitCoreProjection> => {
    const options = signal === undefined ? {} : { signal };
    const [nextUnit, inspectionPage, nextLocations] = await Promise.all([
      getInventoryUnit(client, unitId, options),
      listInventoryUnitInspections(client, unitId, { page: 1, pageSize: 50 }, options),
      listInventoryLocations(client, options),
    ]);
    return {
      inspections: inspectionPage.data,
      locations: nextLocations,
      unit: nextUnit,
    };
  }, [client, unitId]);

  const applyCoreProjection = useCallback((projection: InventoryUnitCoreProjection) => {
    setUnit(projection.unit);
    setInspections(projection.inspections);
    setLocations(projection.locations);
  }, []);

  const refetchCore = useCallback(async (expectedGeneration?: number) => {
    setIdentifiers(null);
    const projection = await readCoreProjection();
    if (
      expectedGeneration !== undefined &&
      expectedGeneration !== sessionGeneration.current
    )
      return;
    applyCoreProjection(projection);
  }, [applyCoreProjection, readCoreProjection]);

  useEffect(() => {
    if (!canLoad) {
      setIdentifiers(null);
      setUnit(null);
      setInspections([]);
      setLocations([]);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotice(null);
    setIdentifiers(null);
    setUnit(null);
    setInspections([]);
    setLocations([]);
    void readCoreProjection(controller.signal)
      .then((projection) => {
        if (active) applyCoreProjection(projection);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught, 'Không thể mở hồ sơ máy.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [applyCoreProjection, canLoad, readCoreProjection]);

  useEffect(() => {
    if (identifiers === null) return;
    const timeout = window.setTimeout(() => {
      setIdentifiers(null);
    }, 60_000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [identifiers]);

  async function runMutation(
    action: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ): Promise<boolean> {
    if (busyAction !== null) return false;
    const generation = sessionGeneration.current;
    setBusyAction(action);
    setError(null);
    setNotice(null);
    try {
      try {
        await operation();
        if (generation !== sessionGeneration.current) return false;
      } catch (caught: unknown) {
        if (generation !== sessionGeneration.current) return false;
        try {
          await refetchAfterInventoryConflict(caught, () => refetchCore(generation));
        } catch {
          // Preserve the original mutation error; a retry remains available in the page header.
        }
        setError(errorMessage(caught, 'Không thể hoàn tất thao tác.'));
        return false;
      }

      try {
        await refetchCore(generation);
        if (generation !== sessionGeneration.current) return false;
      } catch (caught: unknown) {
        if (generation !== sessionGeneration.current) return false;
        setError(
          errorMessage(
            caught,
            'Thao tác đã được ghi nhận nhưng chưa thể tải lại hồ sơ. Hãy thử tải lại.',
          ),
        );
        return true;
      }
      setNotice(successMessage);
      return true;
    } finally {
      if (generation === sessionGeneration.current) setBusyAction(null);
    }
  }

  async function refresh(): Promise<void> {
    if (busyAction !== null) return;
    const generation = sessionGeneration.current;
    setBusyAction('refresh');
    setError(null);
    setNotice(null);
    try {
      await refetchCore(generation);
      if (generation !== sessionGeneration.current) return;
    } catch (caught: unknown) {
      if (generation !== sessionGeneration.current) return;
      setError(errorMessage(caught, 'Không thể tải lại hồ sơ máy.'));
    } finally {
      if (generation === sessionGeneration.current) setBusyAction(null);
    }
  }

  async function revealIdentifiers(reason: string): Promise<boolean> {
    if (busyAction !== null) return false;
    const generation = sessionGeneration.current;
    setBusyAction('reveal');
    setError(null);
    setNotice(null);
    setIdentifiers(null);
    try {
      const revealed = await revealInventoryUnitIdentifiers(client, unitId, reason);
      if (generation !== sessionGeneration.current) return false;
      setIdentifiers(revealed);
      return true;
    } catch (caught: unknown) {
      if (generation !== sessionGeneration.current) return false;
      setError(errorMessage(caught, 'Không thể xem mã định danh.'));
      return false;
    } finally {
      if (generation === sessionGeneration.current) setBusyAction(null);
    }
  }

  async function createInspection(inspectionType: InventoryInspectionType): Promise<boolean> {
    if (busyAction !== null || !unit?.availableActions.includes('CREATE_INSPECTION')) {
      setError('Máy không còn cho phép tạo phiếu kiểm định mới. Hãy tải lại hồ sơ.');
      return false;
    }
    const generation = sessionGeneration.current;
    setBusyAction('create-inspection');
    setError(null);
    setNotice(null);
    try {
      const inspection = await createInventoryUnitInspection(client, unitId, { inspectionType });
      if (generation !== sessionGeneration.current) return false;
      router.push(`/backoffice/inventory/inspections/${inspection.id}`);
      return true;
    } catch (caught: unknown) {
      if (generation !== sessionGeneration.current) return false;
      try {
        await refetchAfterInventoryConflict(caught, () => refetchCore(generation));
      } catch {
        // Keep the create error visible even if the best-effort refresh also fails.
      }
      setError(errorMessage(caught, 'Không thể tạo phiếu kiểm định.'));
      return false;
    } finally {
      if (generation === sessionGeneration.current) setBusyAction(null);
    }
  }

  async function lifecycleCommand(
    action: InventoryLifecycleCommand,
    input: { readonly reason?: string; readonly toLocationId?: string } = {},
  ): Promise<boolean> {
    if (!unit?.availableActions.includes(action)) {
      setError('Thao tác này không còn phù hợp với trạng thái máy. Hãy tải lại hồ sơ.');
      return false;
    }
    if (action === 'MAKE_AVAILABLE') {
      return runMutation(
        `command:${action}`,
        () => makeInventoryUnitAvailable(client, unitId),
        'Máy đã được đưa vào nguồn hàng có thể bán.',
      );
    }
    if (action === 'TRANSFER') {
      const toLocationId = input.toLocationId;
      if (toLocationId === undefined) {
        setError('Chọn địa điểm nhận máy.');
        return false;
      }
      return runMutation(
        `command:${action}`,
        () =>
          transferInventoryUnit(client, unitId, {
            toLocationId,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
          }),
        'Đã chuyển địa điểm và cập nhật hồ sơ máy.',
      );
    }
    if (input.reason === undefined) {
      setError('Nhập lý do trước khi tiếp tục.');
      return false;
    }
    const reason = input.reason;
    const command =
      action === 'SEND_TO_REPAIR'
        ? () => sendInventoryUnitToRepair(client, unitId, reason)
        : action === 'QUARANTINE'
          ? () => quarantineInventoryUnit(client, unitId, reason)
          : () => writeOffInventoryUnit(client, unitId, reason);
    const successMessage =
      action === 'SEND_TO_REPAIR'
        ? 'Đã chuyển máy sang sửa chữa.'
        : action === 'QUARANTINE'
          ? 'Đã cách ly máy khỏi luồng bán.'
          : 'Đã loại máy khỏi kho.';
    return runMutation(`command:${action}`, command, successMessage);
  }

  const adminContent =
    user?.role === 'ADMIN' && unit !== null ? (
      <AdminInventoryCostPanel client={client} role={user.role} unitId={unit.id} />
    ) : undefined;

  return (
    <InventoryShell
      adminContent={adminContent}
      breadcrumbs={[
        { href: '/backoffice/inventory/units', label: 'Máy vật lý' },
        { label: unit?.inventoryCode ?? 'Hồ sơ máy' },
      ]}
    >
      {canLoad && loading && unit === null ? <UnitDetailLoading /> : null}
      {canLoad && !loading && unit === null ? (
        <section className={styles.loadState}>
          <InlineAlert role="alert" title="Không thể mở hồ sơ" tone="danger">
            {error ?? 'Hồ sơ máy hiện không khả dụng.'}
          </InlineAlert>
          <Button variant="secondary" onClick={() => void refresh()}>
            Thử tải lại
          </Button>
        </section>
      ) : null}
      {canLoad && unit !== null ? (
        <InventoryUnitDetailView
          busyAction={busyAction}
          error={error}
          identifiers={identifiers}
          inspections={inspections}
          locations={locations}
          notice={notice}
          unit={unit}
          onClearIdentifiers={() => {
            setIdentifiers(null);
          }}
          onCreateInspection={createInspection}
          onLifecycleCommand={lifecycleCommand}
          onRefresh={refresh}
          onRevealIdentifiers={revealIdentifiers}
          onUpdate={(input: UpdateInventoryUnitInput) =>
            runMutation(
              'update',
              () => updateInventoryUnit(client, unitId, input),
              'Đã cập nhật hồ sơ máy.',
            )
          }
          onUpload={(input: InventoryMediaUploadInput) =>
            runMutation(
              'upload',
              () => uploadInventoryUnitMedia(client, unitId, input),
              'Đã thêm ảnh vào hồ sơ máy.',
            )
          }
        />
      ) : null}
    </InventoryShell>
  );
}

export async function refetchAfterInventoryConflict(
  error: unknown,
  refetch: () => Promise<void>,
): Promise<boolean> {
  if (!inventoryErrorRequiresRefetch(error)) return false;
  await refetch();
  return true;
}

function UnitDetailLoading() {
  return (
    <section className={styles.loadingState} aria-label="Đang tải hồ sơ máy" role="status">
      <Skeleton height="2.5rem" width="min(100%, 24rem)" />
      <Skeleton height="8rem" width="100%" />
      <div className={styles.loadingGrid}>
        <Skeleton height="24rem" width="100%" />
        <Skeleton height="24rem" width="100%" />
      </div>
      <span className="rp-visually-hidden">Đang tải hồ sơ máy…</span>
    </section>
  );
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
