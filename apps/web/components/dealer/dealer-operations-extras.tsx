'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { InlineAlert } from '@/components/ui';
import {
  dealerDate,
  dealerMoney,
  dealerRecord,
  dealerText,
  type DealerApi,
  type DealerRecord,
} from '@/lib/dealer-api';
import { DealerForm } from './dealer-primitives';
import styles from './dealer.module.css';

export function DealerSimulation({
  api,
  orderId,
  done,
}: {
  api: DealerApi;
  orderId: string;
  done: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .get('backoffice/dealers/configuration')
      .then((value) => {
        if (active) setEnabled(dealerRecord(value)['simulationEnabled'] === true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api]);
  if (!enabled) return null;
  return (
    <section className={styles.card}>
      <h2>Diễn tập trên TEST</h2>
      <InlineAlert tone="info">
        Chỉ dùng dữ liệu và tiền giả. Các bước vẫn kiểm tra giữ máy, tiền và trạng thái như đơn
        thật.
      </InlineAlert>
      <DealerForm
        fields={[
          {
            name: 'action',
            label: 'Tình huống mô phỏng',
            options: [
              { value: 'PAYMENT', label: 'Nhận đủ tiền' },
              { value: 'DELIVER', label: 'Bàn giao và giao thành công' },
              { value: 'FAIL', label: 'Giao thất bại' },
              { value: 'RETURN', label: 'Nhận máy hoàn về' },
              { value: 'CANCEL', label: 'Hủy đơn' },
              { value: 'REFUND', label: 'Chuyển hoàn một khoản đang chờ' },
            ],
          },
          { name: 'reason', label: 'Ghi chú diễn tập', value: 'Diễn tập luồng đại lý trên TEST' },
        ]}
        submit="Chạy tình huống TEST"
        onSubmit={async (data) => {
          await api.post(`backoffice/dealers/sandbox/orders/${orderId}/simulate`, data);
          await done();
        }}
      />
    </section>
  );
}

export function DealerReturnFees({
  api,
  order,
  done,
}: {
  api: DealerApi;
  order: DealerRecord;
  done: () => Promise<void>;
}) {
  const settlement = dealerRecord(order['returnSettlement']);
  if (settlement['settledAt'])
    return (
      <section className={styles.card}>
        <h3>Phí giao hoàn đã chốt</h3>
        <p>
          Bên chịu phí: {dealerText(settlement['responsibleParty'])} · Giữ lại{' '}
          {dealerMoney(settlement['charge'])}
        </p>
        <p>{dealerText(settlement['agreement'])}</p>
        <p className={styles.muted}>
          Phí giao ban đầu {dealerMoney(settlement['originalShippingFee'])} đã nằm trong số tiền
          nhận. Không cộng lại lần nữa.
        </p>
      </section>
    );
  if (order['fulfillmentStatus'] !== 'RETURNED') return null;
  return (
    <section className={styles.card}>
      <h3>Chốt phí giao hoàn trước khi hủy</h3>
      <DealerForm
        fields={[
          {
            name: 'responsibleParty',
            label: 'Bên chịu trách nhiệm',
            options: [
              { value: 'REPHONE', label: 'rePhone chịu phí' },
              { value: 'DEALER', label: 'Đại lý chịu phí theo thỏa thuận' },
            ],
          },
          {
            name: 'outboundCost',
            label: 'Phí giao đi thực tế (đồng)',
            value: dealerText(order['shippingFee']),
          },
          { name: 'returnCost', label: 'Phí hoàn về thực tế (đồng)', value: '0' },
          { name: 'agreement', label: 'Căn cứ và thỏa thuận phí', type: 'textarea' },
          { name: 'reason', label: 'Nguyên nhân giao hoàn' },
        ]}
        submit="Chốt phí giao hoàn"
        onSubmit={async (data) => {
          await api.post(
            `backoffice/dealers/orders/${dealerText(order['id'])}/return-settlement`,
            data,
          );
          await done();
        }}
      />
      <p className={styles.muted}>
        Khoản hoàn khi hủy = tiền còn giữ − phí đại lý phải chịu. Phí giao ban đầu đã nằm trong tiền
        nhận.
      </p>
    </section>
  );
}

export function DealerAfterSalesOperations({
  api,
  row,
  done,
}: {
  api: DealerApi;
  row: DealerRecord;
  done: () => Promise<void>;
}) {
  const assessment = dealerRecord(row['assessment']);
  return (
    <section className={styles.card}>
      <h2>{dealerText(row['requestNumber'])}</h2>
      <p>
        {dealerText(dealerRecord(row['orderItem'])['productName'])} ·{' '}
        {dealerText(dealerRecord(row['orderItem'])['orderNumber'])}
      </p>
      <p>{dealerText(row['issueDescription'])}</p>
      <Link href={`/backoffice/after-sales/${dealerText(row['id'])}`}>
        Mở quy trình nhận máy, kiểm định và xử lý →
      </Link>
      {['RECEIVED', 'INSPECTING'].includes(dealerText(row['status'])) && (
        <DealerForm
          fields={[
            {
              name: 'finding',
              label: 'Kết quả kiểm định',
              type: 'textarea',
              value: dealerText(assessment['finding']),
            },
            {
              name: 'cause',
              label: 'Nguyên nhân',
              value: dealerText(assessment['cause']) || 'UNDETERMINED',
              options: [
                { value: 'UNDETERMINED', label: 'Chưa xác định' },
                { value: 'EXISTING_DEFECT', label: 'Lỗi máy / tồn tại trước khi giao' },
                { value: 'CUSTOMER_DAMAGE', label: 'Hư hỏng do khách' },
                { value: 'NO_FAULT_FOUND', label: 'Không phát hiện lỗi' },
              ],
            },
            {
              name: 'coverage',
              label: 'Phạm vi bảo hành',
              value: dealerText(assessment['coverage']) || 'PENDING',
              options: [
                { value: 'PENDING', label: 'Chưa kết luận' },
                { value: 'COVERED', label: 'Được bảo hành' },
                { value: 'NOT_COVERED', label: 'Không thuộc phạm vi' },
                { value: 'OUT_OF_WARRANTY', label: 'Đã hết bảo hành' },
              ],
            },
            {
              name: 'shippingPayer',
              label: 'Bên chịu phí',
              value: dealerText(assessment['shippingPayer']) || 'UNDETERMINED',
              options: [
                { value: 'UNDETERMINED', label: 'Chưa chốt' },
                { value: 'REPHONE', label: 'rePhone' },
                { value: 'DEALER', label: 'Đại lý' },
              ],
            },
            {
              name: 'shippingCost',
              label: 'Phí vận chuyển thực tế (đồng)',
              value: dealerText(assessment['shippingCost']) || '0',
            },
            {
              name: 'shippingAlreadyPaid',
              label: 'Phần phí đã thanh toán / đối trừ (đồng)',
              value: dealerText(assessment['shippingAlreadyPaid']) || '0',
            },
            {
              name: 'feeAgreement',
              label: 'Thỏa thuận phí và hướng xử lý',
              type: 'textarea',
              value: dealerText(assessment['feeAgreement']),
            },
          ]}
          submit="Lưu đánh giá hậu mãi"
          onSubmit={async (data) => {
            await api.post(
              `backoffice/dealers/after-sales/${dealerText(row['id'])}/assessment`,
              data,
            );
            await done();
          }}
        />
      )}
      {Boolean(assessment['assessedAt']) && (
        <p>
          Đánh giá ngày {dealerDate(assessment['assessedAt'])} · {dealerText(assessment['finding'])}
        </p>
      )}
      {row['warrantyExtensionDays'] !== null && row['warrantyExtensionDays'] !== undefined && (
        <p>
          Đã cộng {dealerText(row['warrantyExtensionDays'])} ngày bảo hành cho thời gian tiếp nhận
          sửa / đổi.
        </p>
      )}
    </section>
  );
}
