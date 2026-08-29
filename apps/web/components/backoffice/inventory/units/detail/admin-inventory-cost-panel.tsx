'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { Button, InlineAlert, Input, Textarea, formatVnd } from '@/components/ui';
import {
  canRequestInventoryCost,
  getAdminInventoryUnitCost,
  updateAdminInventoryUnitCost,
  type AdminInventoryCost,
  type InventoryApiClient,
} from '@/lib/backoffice-inventory-api';
import styles from './inventory-unit-detail.module.css';

export interface AdminInventoryCostPanelProps {
  readonly client: InventoryApiClient;
  readonly role: string | null | undefined;
  readonly unitId: string;
}

export function loadAdminCostWhenAllowed<Value>(
  role: string | null | undefined,
  loader: () => Promise<Value>,
): Promise<Value | null> {
  return canRequestInventoryCost(role) ? loader() : Promise.resolve(null);
}

export function AdminInventoryCostPanel({ client, role, unitId }: AdminInventoryCostPanelProps) {
  const [cost, setCost] = useState<AdminInventoryCost | null>(null);
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [additionalCost, setAdditionalCost] = useState('0');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!canRequestInventoryCost(role)) {
      setCost(null);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError(null);
    void loadAdminCostWhenAllowed(role, () => getAdminInventoryUnitCost(client, unitId))
      .then((result) => {
        if (!active || result === null) return;
        setCost(result);
        setAcquisitionCost(result.acquisitionCost ?? '');
        setAdditionalCost(result.additionalCost);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught, 'Không thể tải giá vốn.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, role, unitId]);

  if (!canRequestInventoryCost(role)) return null;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const normalizedAcquisition = acquisitionCost.trim();
    const normalizedAdditional = additionalCost.trim();
    const normalizedReason = reason.trim();
    if (normalizedAcquisition !== '' && !/^\d{1,15}$/.test(normalizedAcquisition)) {
      setError('Giá nhập phải là số nguyên, tối đa 15 chữ số.');
      return;
    }
    if (!/^\d{1,15}$/.test(normalizedAdditional)) {
      setError('Chi phí bổ sung phải là số nguyên, tối đa 15 chữ số.');
      return;
    }
    if (normalizedReason.length < 5 || normalizedReason.length > 500) {
      setError('Lý do cập nhật cần từ 5 đến 500 ký tự.');
      return;
    }

    setSaving(true);
    try {
      const updated = await loadAdminCostWhenAllowed(role, () =>
        updateAdminInventoryUnitCost(client, unitId, {
          acquisitionCost: normalizedAcquisition || null,
          additionalCost: normalizedAdditional,
          reason: normalizedReason,
        }),
      );
      if (updated === null) return;
      setCost(updated);
      setAcquisitionCost(updated.acquisitionCost ?? '');
      setAdditionalCost(updated.additionalCost);
      setReason('');
      setNotice('Đã cập nhật giá vốn và ghi nhận lý do.');
    } catch (caught: unknown) {
      setError(errorMessage(caught, 'Không thể cập nhật giá vốn.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${styles.card ?? ''} ${styles.adminCostCard ?? ''}`}>
      <div className={styles.sectionHeading ?? ''}>
        <p className={styles.eyebrow}>Chỉ quản trị viên</p>
        <h2>Giá vốn nội bộ</h2>
        <p>Dữ liệu này được tách khỏi hồ sơ máy dành cho nhân viên.</p>
      </div>

      {error === null ? null : (
        <InlineAlert role="alert" title="Chưa thể xử lý giá vốn" tone="danger">
          {error}
        </InlineAlert>
      )}
      {notice === null ? null : (
        <InlineAlert title="Đã lưu" tone="success">
          {notice}
        </InlineAlert>
      )}

      <dl className={styles.costSummary} aria-busy={loading || undefined}>
        <div>
          <dt>Giá nhập</dt>
          <dd>{loading ? 'Đang tải…' : moneyOrEmpty(cost?.acquisitionCost)}</dd>
        </div>
        <div>
          <dt>Chi phí bổ sung</dt>
          <dd>{loading ? 'Đang tải…' : moneyOrEmpty(cost?.additionalCost)}</dd>
        </div>
        <div>
          <dt>Tổng giá vốn</dt>
          <dd>{loading ? 'Đang tải…' : moneyOrEmpty(cost?.totalCost)}</dd>
        </div>
      </dl>

      <form className={styles.formGrid} onSubmit={(event) => void submit(event)}>
        <Input
          id="unit-acquisition-cost"
          inputMode="numeric"
          label="Giá nhập"
          maxLength={15}
          placeholder="Để trống nếu chưa có"
          value={acquisitionCost}
          onChange={(event) => {
            setAcquisitionCost(event.target.value);
            setError(null);
          }}
        />
        <Input
          id="unit-additional-cost"
          inputMode="numeric"
          label="Chi phí bổ sung"
          maxLength={15}
          required
          value={additionalCost}
          onChange={(event) => {
            setAdditionalCost(event.target.value);
            setError(null);
          }}
        />
        <Textarea
          containerClassName={styles.fullSpan ?? ''}
          hint="Nêu căn cứ thay đổi để phục vụ đối soát nội bộ."
          id="unit-cost-reason"
          label="Lý do cập nhật"
          maxLength={500}
          minLength={5}
          required
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
        <div className={styles.formFooter}>
          <Button loading={saving} loadingLabel="Đang lưu giá vốn" type="submit">
            Lưu giá vốn
          </Button>
        </div>
      </form>
    </section>
  );
}

function moneyOrEmpty(value: string | null | undefined): string {
  return value === null || value === undefined ? 'Chưa có' : formatVnd(value);
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
