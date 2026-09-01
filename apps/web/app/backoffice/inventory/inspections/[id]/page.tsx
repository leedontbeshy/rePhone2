'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { INVENTORY_UNITS_ROOT, InventoryShell } from '@/components/backoffice';
import { InventoryInspectionEditor } from '@/components/backoffice/inventory/inspections/inventory-inspection-editor';
import styles from '@/components/backoffice/inventory/inspections/inventory-inspection.module.css';
import { InventoryWorkflowProgress } from '@/components/backoffice/inventory/inventory-workflow-progress';
import { Button, InlineAlert, Skeleton } from '@/components/ui';
import {
  completeInventoryInspection,
  getInventoryInspection,
  getInventoryUnit,
  inventoryErrorRequiresRefetch,
  updateInventoryInspection,
  type InventoryInspectionDetail,
  type InventoryUnitDetail,
  type UpdateInventoryInspectionInput,
} from '@/lib/backoffice-inventory-api';
import {
  intakeResumeHref,
  isVerifiedIntakeInspectionSource,
} from '@/lib/inventory-workflow-routes';

export default function InventoryInspectionPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const inspectionId = params.id;
  const requestedFromIntake = searchParams.get('source') === 'intake';
  const [intakeContext, setIntakeContext] = useState<
    | { status: 'pending' }
    | { status: 'rejected' }
    | { inspectionId: string; returnHref: string; status: 'verified' }
  >({ status: 'pending' });
  const fromIntake =
    requestedFromIntake &&
    intakeContext.status === 'verified' &&
    intakeContext.inspectionId === inspectionId;
  const showIntakeChrome =
    requestedFromIntake &&
    (intakeContext.status === 'pending' || intakeContext.status === 'verified');
  const intakeReturnHref = intakeContext.status === 'verified' ? intakeContext.returnHref : null;

  useEffect(() => {
    setIntakeContext({ status: 'pending' });
  }, [inspectionId, requestedFromIntake]);

  const resolveIntakeContext = useCallback(
    (resolvedInspection: InventoryInspectionDetail) => {
      if (
        !isVerifiedIntakeInspectionSource(
          requestedFromIntake ? 'intake' : null,
          resolvedInspection.inspectionType,
        )
      ) {
        setIntakeContext({ status: 'rejected' });
        return;
      }
      setIntakeContext({
        inspectionId: resolvedInspection.id,
        returnHref: intakeResumeHref(resolvedInspection.inventoryUnitId, resolvedInspection.id),
        status: 'verified',
      });
    },
    [requestedFromIntake],
  );

  return (
    <InventoryShell
      {...(showIntakeChrome ? { activeNavigationPath: '/backoffice/inventory/intake' } : {})}
      {...(fromIntake && intakeReturnHref !== null
        ? {
            navigationHrefOverrides: {
              '/backoffice/inventory/intake': intakeReturnHref,
            },
          }
        : {})}
      breadcrumbs={
        fromIntake && intakeReturnHref !== null
          ? [{ href: intakeReturnHref, label: 'Nhập máy' }, { label: 'Kiểm định' }]
          : showIntakeChrome
            ? [{ label: 'Nhập máy' }, { label: 'Kiểm định' }]
          : [{ href: INVENTORY_UNITS_ROOT, label: 'Máy vật lý' }, { label: 'Phiếu kiểm định' }]
      }
    >
      <InventoryInspectionLoader
        fromIntake={fromIntake}
        inspectionId={inspectionId}
        onInspectionResolved={resolveIntakeContext}
        showIntakeWorkflow={showIntakeChrome}
      />
    </InventoryShell>
  );
}

function InventoryInspectionLoader({
  fromIntake,
  inspectionId,
  onInspectionResolved,
  showIntakeWorkflow,
}: Readonly<{
  fromIntake: boolean;
  inspectionId: string;
  onInspectionResolved: (inspection: InventoryInspectionDetail) => void;
  showIntakeWorkflow: boolean;
}>) {
  const { client, user } = useAuth();
  const router = useRouter();
  const [inspection, setInspection] = useState<InventoryInspectionDetail | null>(null);
  const [unit, setUnit] = useState<InventoryUnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'save' | 'complete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutationInFlight = useRef(false);

  const loadInspection = useCallback(async () => {
    const result = await getInventoryInspection(client, inspectionId);
    onInspectionResolved(result);
    const relatedUnit = await getInventoryUnit(client, result.inventoryUnitId);
    setInspection(result);
    setUnit(relatedUnit);
    return result;
  }, [client, inspectionId, onInspectionResolved]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setInspection(null);
    setUnit(null);
    setNotice(null);
    void loadInspection()
      .then((result) => {
        if (!active) return;
        setInspection(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught, 'Không thể mở phiếu kiểm định.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadInspection]);

  async function runMutation(action: 'save' | 'complete', input: UpdateInventoryInspectionInput) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusyAction(action);
    setError(null);
    setNotice(null);
    try {
      const saved = await updateInventoryInspection(client, inspectionId, input);
      if (action === 'save') {
        setInspection(saved);
        setNotice('Đã lưu bản nháp kiểm định.');
        return;
      }
      const completed = await completeInventoryInspection(client, inspectionId);
      setInspection(completed);
      setNotice('Đã hoàn tất phiếu kiểm định.');
      if (fromIntake) {
        router.replace(intakeResumeHref(completed.inventoryUnitId, completed.id));
        return;
      }
    } catch (caught) {
      if (inventoryErrorRequiresRefetch(caught)) {
        try {
          await loadInspection();
        } catch {
          // Keep the command error visible when the authoritative refresh also fails.
        }
      }
      setError(errorMessage(caught, 'Không thể cập nhật phiếu kiểm định.'));
    } finally {
      mutationInFlight.current = false;
      setBusyAction(null);
    }
  }

  if (loading && inspection === null) {
    return <InspectionLoadingState showIntakeWorkflow={showIntakeWorkflow} />;
  }

  if (inspection === null) {
    return (
      <InlineAlert title="Chưa thể mở phiếu kiểm định" tone="danger">
        {error ?? 'Không tìm thấy dữ liệu phiếu kiểm định.'}{' '}
        <Button
          size="compact"
          variant="secondary"
          onClick={() => {
            setLoading(true);
            void loadInspection()
              .catch((caught: unknown) => {
                setError(errorMessage(caught, 'Không thể mở phiếu kiểm định.'));
              })
              .finally(() => {
                setLoading(false);
              });
          }}
        >
          Thử lại
        </Button>
      </InlineAlert>
    );
  }

  return (
    <InventoryInspectionEditor
      busyAction={busyAction}
      error={error}
      inspection={inspection}
      editable={user?.role === 'ADMIN' || inspection.inspectorId === user?.id}
      notice={notice}
      showIntakeWorkflow={showIntakeWorkflow}
      {...(fromIntake
        ? { returnToIntakeHref: intakeResumeHref(inspection.inventoryUnitId, inspection.id) }
        : {})}
      onComplete={(input) => {
        void runMutation('complete', input);
      }}
      onReload={() => {
        setError(null);
        void loadInspection().catch((caught: unknown) => {
          setError(errorMessage(caught, 'Không thể tải lại phiếu kiểm định.'));
        });
      }}
      onSave={(input) => {
        void runMutation('save', input);
      }}
      unitSummary={
        unit === null
          ? null
          : {
              inventoryCode: unit.inventoryCode,
              maskedIdentifiers: unit.maskedIdentifiers.map((item) => item.maskedValue),
              productName: unit.product.name,
              variantName: unit.variant.displayName,
            }
      }
    />
  );
}

function InspectionLoadingState({ showIntakeWorkflow }: Readonly<{ showIntakeWorkflow: boolean }>) {
  return (
    <section className={styles.loadingState} aria-label="Đang tải phiếu kiểm định" role="status">
      {showIntakeWorkflow ? (
        <InventoryWorkflowProgress completedSteps={[1, 2]} currentStep={3} />
      ) : null}
      <Skeleton height="2.5rem" width="min(100%, 28rem)" />
      <Skeleton height="14rem" width="100%" />
      <Skeleton height="28rem" width="100%" />
      <span className="rp-visually-hidden">Đang tải phiếu kiểm định…</span>
    </section>
  );
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
