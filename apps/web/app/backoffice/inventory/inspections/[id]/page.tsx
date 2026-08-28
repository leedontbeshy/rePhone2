'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { INVENTORY_UNITS_ROOT, InventoryShell } from '@/components/backoffice';
import { InventoryInspectionEditor } from '@/components/backoffice/inventory/inspections/inventory-inspection-editor';
import styles from '@/components/backoffice/inventory/inspections/inventory-inspection.module.css';
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

export default function InventoryInspectionPage() {
  const params = useParams<{ id: string }>();
  const inspectionId = params.id;

  return (
    <InventoryShell
      breadcrumbs={[
        { href: INVENTORY_UNITS_ROOT, label: 'Máy vật lý' },
        { label: 'Phiếu kiểm định' },
      ]}
    >
      <InventoryInspectionLoader inspectionId={inspectionId} />
    </InventoryShell>
  );
}

function InventoryInspectionLoader({ inspectionId }: Readonly<{ inspectionId: string }>) {
  const { client, user } = useAuth();
  const [inspection, setInspection] = useState<InventoryInspectionDetail | null>(null);
  const [unit, setUnit] = useState<InventoryUnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'save' | 'complete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutationInFlight = useRef(false);

  const loadInspection = useCallback(async () => {
    const result = await getInventoryInspection(client, inspectionId);
    const relatedUnit = await getInventoryUnit(client, result.inventoryUnitId);
    setInspection(result);
    setUnit(relatedUnit);
    return result;
  }, [client, inspectionId]);

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

  if (loading && inspection === null) return <InspectionLoadingState />;

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

function InspectionLoadingState() {
  return (
    <section className={styles.loadingState} aria-label="Đang tải phiếu kiểm định" role="status">
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
