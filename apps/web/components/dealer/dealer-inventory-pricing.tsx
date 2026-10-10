'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, InlineAlert } from '@/components/ui';
import {
  dealerApi,
  dealerMoney,
  dealerRecord,
  dealerText,
  type DealerRecord,
} from '@/lib/dealer-api';
import { DealerForm } from './dealer-primitives';
import styles from './dealer.module.css';

export function DealerInventoryPricing({ client, unitId }: { client: unknown; unitId: string }) {
  const api = useMemo(() => dealerApi(client), [client]);
  const [pricing, setPricing] = useState<DealerRecord | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    const configuration = dealerRecord(await api.get('backoffice/dealers/configuration'));
    if (configuration['enabled'] !== true) return { unavailable: true };
    return dealerRecord(await api.get(`backoffice/dealers/inventory/${unitId}/pricing`));
  }, [api, unitId]);
  useEffect(() => {
    let active = true;
    void load()
      .then((value) => {
        if (active) setPricing(value);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : 'Không tải được giá đại lý.');
      });
    return () => {
      active = false;
    };
  }, [load]);
  async function refresh() {
    setError('');
    setPricing(await load());
    setRevision((value) => value + 1);
  }
  return (
    <section className={styles.card} aria-label="Giá đại lý của máy">
      <div className={styles.header}>
        <h2>Giá đại lý</h2>
        <Button
          variant="secondary"
          onClick={() => {
            void refresh().catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : 'Không tải được giá đại lý.');
            });
          }}
        >
          Tính lại giá
        </Button>
      </div>
      <p className={styles.muted}>
        Mặc định lấy giá bán sau chiết khấu, nhưng luôn đạt giá vốn + chi phí bổ sung + dự phòng +
        lãi tối thiểu. Bạn có thể đặt giá riêng cho máy này.
      </p>
      <Link href="/backoffice/dealers">Quản lý cổng, chiết khấu và giá sàn</Link>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
      {pricing?.['unavailable'] === true ? (
        <p>Chức năng đại lý chưa được cấu hình trên môi trường này.</p>
      ) : pricing ? (
        <>
          <dl className={styles.summary}>
            <div>
              <dt>Giá bán công khai</dt>
              <dd>{dealerMoney(pricing['publicPrice'])}</dd>
            </div>
            <div>
              <dt>Giá sàn đại lý</dt>
              <dd>{dealerMoney(pricing['floorPrice'])}</dd>
            </div>
            <div>
              <dt>Giá đại lý theo cấu hình</dt>
              <dd>{dealerMoney(pricing['dealerPrice'])}</dd>
            </div>
          </dl>
          {!pricing['dealerPrice'] && (
            <InlineAlert tone="info">
              Chưa tính được giá hợp lệ. Kiểm tra giá vốn, dự phòng, lãi tối thiểu và giá bán công
              khai. Giá đại lý phải đạt giá sàn và thấp hơn giá công khai.
            </InlineAlert>
          )}
          <p className={styles.muted}>
            Giá trên chưa gồm phí giao. Máy chỉ được chào bán khi cổng mở, máy đủ điều kiện bán và
            không đang được giữ cho đơn khác.
          </p>
          <DealerForm
            key={revision}
            fields={[
              {
                name: 'enabled',
                label: 'Cho phép bán qua đại lý',
                value: String(pricing['enabled']),
                options: [
                  { value: 'true', label: 'Cho phép' },
                  { value: 'false', label: 'Tạm ngừng máy này' },
                ],
              },
              {
                name: 'price',
                label: 'Giá đại lý riêng (đồng)',
                value: dealerText(pricing['overridePrice']),
                required: false,
                hint: 'Để trống để tự tính theo chính sách chung.',
              },
              { name: 'reason', label: 'Lý do cập nhật giá đại lý' },
            ]}
            submit="Lưu giá đại lý của máy"
            onSubmit={async (data) => {
              await api.post(`backoffice/dealers/inventory/${unitId}/pricing`, {
                enabled: data['enabled'] === 'true',
                reason: data['reason'],
                ...(data['price'] ? { price: data['price'] } : {}),
              });
              await refresh();
              setNotice('Đã lưu giá đại lý của máy.');
            }}
          />
        </>
      ) : (
        <p>Đang tính giá đại lý…</p>
      )}
    </section>
  );
}
