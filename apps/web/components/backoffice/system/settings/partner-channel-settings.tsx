'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { Button, InlineAlert, StatusChip } from '@/components/ui';
import { DealerChannelControl } from '@/components/dealer/dealer-channel-control';
import { dealerApi, dealerRecord, type DealerRecord } from '@/lib/dealer-api';
import { affiliateApi, record, type Row } from '@/lib/affiliate-api';
import styles from './settings.module.css';

export function PartnerChannelSettings() {
  const { client, user } = useAuth();
  const dealer = useMemo(() => dealerApi(client), [client]);
  const affiliate = useMemo(() => affiliateApi(client), [client]);
  const [configuration, setConfiguration] = useState<DealerRecord>({});
  const [policy, setPolicy] = useState<Row>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      dealer.get('backoffice/dealers/configuration'),
      affiliate.get('backoffice/affiliates/policy'),
    ]);
    const [d, a] = results;
    if (d.status === 'fulfilled') setConfiguration(dealerRecord(d.value));
    if (a.status === 'fulfilled') setPolicy(record(a.value));
    if (d.status === 'rejected' || a.status === 'rejected')
      throw new Error('Chưa tải đủ cấu hình đối tác. Vui lòng thử lại.');
  }, [dealer, affiliate]);
  useEffect(() => {
    if (user?.role === 'ADMIN')
      void load().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Chưa tải được cấu hình.');
      });
  }, [load, user?.role]);
  if (user?.role !== 'ADMIN') return null;
  const affiliatePolicyReady =
    policy !== undefined &&
    typeof policy['rateBps'] === 'number' &&
    typeof policy['reserveAmount'] === 'string' &&
    typeof policy['minimumProfit'] === 'string';
  async function toggleAffiliate() {
    if (busy || policy === undefined) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await affiliate.post('backoffice/affiliates/policy', {
        enabled: policy['enabled'] !== true,
        rateBps: policy['rateBps'],
        reserveAmount: policy['reserveAmount'],
        minimumProfit: policy['minimumProfit'],
        expectedVersion: policy['version'],
      });
      await load();
      setNotice('Đã cập nhật trạng thái cộng tác viên.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa cập nhật được trạng thái.');
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.partnerChannels} aria-labelledby="partner-channels-title">
      <h2 id="partner-channels-title">Kênh bán hàng & đối tác</h2>
      {error && (
        <InlineAlert tone="danger">
          {error}
          <Button
            variant="secondary"
            onClick={() => {
              setError('');
              void load().catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : 'Chưa tải được cấu hình.');
              });
            }}
          >
            Tải lại cấu hình
          </Button>
        </InlineAlert>
      )}
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
      <div className={styles.partnerGrid}>
        <DealerChannelControl api={dealer} configuration={configuration} admin done={load} />
        <section className={styles.partnerCard} aria-label="Điều khiển cộng tác viên">
          <div className={styles.partnerCardHeader}>
            <h3>Cộng tác viên</h3>
            <StatusChip
              label={
                policy === undefined
                  ? 'Đang tải'
                  : policy['enabled'] === true
                    ? 'Đang mở'
                    : 'Tạm ngừng'
              }
              tone={policy?.['enabled'] === true ? 'success' : 'neutral'}
            />
          </div>
          <p>
            {policy === undefined
              ? 'Đang tải trạng thái…'
              : policy['enabled'] === true
                ? 'Đang nhận đăng ký và ghi nhận giới thiệu mới.'
                : 'Tạm ngừng đăng ký và giới thiệu mới.'}
          </p>
          <p>Hoa hồng và yêu cầu chi trả đã có tiếp tục được xử lý.</p>
          {policy !== undefined && policy['ready'] !== true && (
            <InlineAlert tone="warning">Chương trình chưa được cấu hình để hoạt động.</InlineAlert>
          )}
          {policy?.['ready'] === true && !affiliatePolicyReady && (
            <InlineAlert tone="info">
              Lưu mức hoa hồng và giá sàn trong chính sách cộng tác viên trước khi bật chương trình.
            </InlineAlert>
          )}
          <div className={styles.partnerActions}>
            <Link className={styles.partnerPolicyLink} href="/backoffice/affiliates">
              Quản lý chính sách hoa hồng
            </Link>
            <Button
              disabled={policy?.['ready'] !== true || !affiliatePolicyReady}
              loading={busy}
              variant={policy?.['enabled'] === true ? 'secondary' : 'primary'}
              onClick={() => void toggleAffiliate()}
            >
              {policy?.['enabled'] === true ? 'Tạm tắt cộng tác viên' : 'Bật cộng tác viên'}
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}
