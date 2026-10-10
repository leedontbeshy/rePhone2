'use client';
import { useRef, useState } from 'react';
import { Button, InlineAlert } from '@/components/ui';
import {
  dealerMoney,
  dealerRecord,
  dealerText,
  type DealerApi,
  type DealerRecord,
} from '@/lib/dealer-api';
import { DealerDeviceFacts, DealerForm } from './dealer-primitives';
import styles from './dealer.module.css';

export function DealerCheckout({
  offer,
  api,
  created,
}: {
  offer: DealerRecord;
  api: DealerApi;
  created: (order: DealerRecord) => void;
}) {
  const [review, setReview] = useState<{ preview: DealerRecord; input: DealerRecord } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestKey = useRef('');
  return (
    <section className={styles.card}>
      <h2>Giao {dealerText(offer['productName'])} cho khách</h2>
      <p>
        {dealerText(offer['variantName'])} · {dealerText(offer['inventoryCode'])}
      </p>
      <DealerDeviceFacts configuration={offer['configuration']} />
      <p className={styles.muted}>
        Xem lại giá và địa chỉ trước khi giữ máy. Mỗi đơn gồm một máy, đại lý thanh toán đủ trước
        khi giao.
      </p>
      <DealerForm
        onChange={() => {
          setReview(null);
        }}
        fields={[
          { name: 'externalOrderId', label: 'Mã đơn tại cửa hàng của bạn' },
          { name: 'receiverName', label: 'Tên người nhận' },
          { name: 'phone', label: 'Điện thoại', type: 'tel' },
          { name: 'email', label: 'Email nhận thông báo giao hàng', type: 'email' },
          { name: 'addressLine', label: 'Số nhà, đường' },
          { name: 'ward', label: 'Phường / xã' },
          { name: 'district', label: 'Quận / huyện' },
          { name: 'province', label: 'Tỉnh / thành phố' },
          { name: 'shippingQuoteId', label: 'Mã báo phí riêng (nếu có)', required: false },
          { name: 'note', label: 'Ghi chú giao hàng', required: false },
        ]}
        submit="Xem lại đơn hàng"
        onSubmit={async (data) => {
          setReview(null);
          setError('');
          const shippingAddress = Object.fromEntries(
            ['receiverName', 'phone', 'addressLine', 'ward', 'district', 'province'].map((key) => [
              key,
              data[key],
            ]),
          );
          const input = {
            inventoryUnitId: offer['inventoryUnitId'],
            shippingAddress,
            shippingQuoteId: data['shippingQuoteId'] || undefined,
            externalOrderId: data['externalOrderId'],
            contact: { fullName: data['receiverName'], phone: data['phone'], email: data['email'] },
            note: data['note'] || undefined,
          };
          const preview = dealerRecord(
            await api.post('dealer/orders/preview', {
              inventoryUnitId: input.inventoryUnitId,
              shippingAddress,
              shippingQuoteId: input.shippingQuoteId,
            }),
          );
          requestKey.current = crypto.randomUUID();
          setReview({ preview, input });
        }}
      />
      {review && (
        <div className={styles.card}>
          <h3>Xác nhận thông tin đã xem lại</h3>
          <p>
            {dealerText(dealerRecord(review.input['shippingAddress'])['receiverName'])} ·{' '}
            {dealerText(dealerRecord(review.input['shippingAddress'])['addressLine'])},{' '}
            {dealerText(dealerRecord(review.input['shippingAddress'])['province'])}
          </p>
          <div className={styles.line}>
            <span>Giá máy</span>
            <strong>{dealerMoney(review.preview['dealerPrice'])}</strong>
          </div>
          <div className={styles.line}>
            <span>Giao hàng</span>
            <span>{dealerMoney(review.preview['shippingFee'])}</span>
          </div>
          <p className={styles.price}>{dealerMoney(review.preview['grandTotal'])}</p>
          <p className={styles.muted}>
            Máy chỉ được giữ sau khi tạo đơn thành công. Nếu sửa thông tin phía trên, hãy bấm “Xem
            lại đơn hàng” để cập nhật bản xác nhận này.
          </p>
          <Button
            loading={busy}
            onClick={() => {
              if (busy) return;
              setBusy(true);
              setError('');
              void api
                .post(
                  'dealer/orders',
                  { ...review.input, previewFingerprint: review.preview['previewFingerprint'] },
                  requestKey.current,
                )
                .then((value) => {
                  created(dealerRecord(dealerRecord(value)['order']));
                })
                .catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : 'Chưa tạo được đơn.');
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            Tạo đơn và giữ máy 30 phút
          </Button>
        </div>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </section>
  );
}
