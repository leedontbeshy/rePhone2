'use client';

import { demoMode } from '@/lib/demo';

import { useState } from 'react';
import Link from 'next/link';
import { DisclosureSummary, Button, InlineAlert } from '@/components/ui';
import {
  dealerDate,
  dealerMoney,
  dealerRecord,
  dealerRows,
  dealerStatus,
  dealerText,
  type DealerApi,
  type DealerRecord,
} from '@/lib/dealer-api';
import { DealerForm, DealerUpload } from './dealer-primitives';
import styles from './dealer.module.css';

export function DealerOrderView({
  order,
  api,
  refresh,
  backoffice = false,
}: {
  order: DealerRecord;
  api: DealerApi;
  refresh: () => Promise<void>;
  backoffice?: boolean;
}) {
  const id = dealerText(order['id']);
  const [warranties, setWarranties] = useState<DealerRecord[]>([]);
  const [error, setError] = useState('');
  const [caseCreated, setCaseCreated] = useState(false);
  const recipient = dealerRecord(order['recipient']);
  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2>{dealerText(order['orderNumber'])}</h2>
          <p className={styles.muted}>Mã của đại lý: {dealerText(order['externalOrderId'])}</p>
        </div>
        <span className={styles.badge}>{dealerStatus(order['status'])}</span>
      </div>
      <div className={styles.grid}>
        <div>
          <strong>{dealerText(recipient['receiverName'])}</strong>
          <p>{dealerText(recipient['phone'])}</p>
          <p className={styles.muted}>
            {['addressLine', 'ward', 'district', 'province']
              .map((key) => dealerText(recipient[key]))
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
        <div>
          <div className={styles.line}>
            <span>Giá đại lý</span>
            <strong>{dealerMoney(order['dealerPrice'])}</strong>
          </div>
          <div className={styles.line}>
            <span>Phí giao</span>
            <span>{dealerMoney(order['shippingFee'])}</span>
          </div>
          <div className={styles.line}>
            <span>Tổng thanh toán</span>
            <strong>{dealerMoney(order['grandTotal'])}</strong>
          </div>
          <div className={styles.line}>
            <span>Đã đối chiếu</span>
            <span>{dealerMoney(order['paidAmount'])}</span>
          </div>
          <div className={styles.line}>
            <span>Đã dành để hoàn</span>
            <span>{dealerMoney(order['refundObligationAmount'])}</span>
          </div>
          <div className={styles.line}>
            <span>Tiền còn bảo đảm đơn</span>
            <span>{dealerMoney(order['fundedAmount'])}</span>
          </div>
          <div className={styles.line}>
            <span>Còn thiếu để xuất hàng</span>
            <span>{dealerMoney(order['fundingShortfall'])}</span>
          </div>
        </div>
      </div>
      {order['reconciliationHold'] === true && (
        <InlineAlert tone="warning">Đơn đang chờ đối soát. Chưa thể xuất hàng.</InlineAlert>
      )}
      {Boolean(order['reviewStartedAt']) && (
        <InlineAlert tone="info">
          Chứng từ đang được kiểm tra. Máy tiếp tục được giữ trong thời gian duyệt.
        </InlineAlert>
      )}
      {dealerRows(order['items']).map((item) => (
        <div className={styles.line} key={dealerText(item['id'])}>
          <strong>
            {dealerText(item['productName'])} · {dealerText(item['variantName'])}
          </strong>
          <span>
            {dealerText(item['inventoryCode'])} · Bảo hành {dealerText(item['warrantyDays'])} ngày
          </span>
        </div>
      ))}
      {dealerRows(order['paymentRequests'])
        .filter((row) => row['status'] === 'OPEN')
        .map((row) => {
          const bank = dealerRecord(row['bank']);
          const reviewing = dealerRows(row['proofs']).some(
            (proof) => proof['status'] === 'UNDER_REVIEW',
          );
          return (
            <section className={styles.card} key={dealerText(row['id'])}>
              <h3>{row['purpose'] === 'BALANCE' ? 'Chuyển bổ sung' : 'Thanh toán cho rePhone'}</h3>
              <p className={styles.price}>{dealerMoney(row['requiredAmount'])}</p>
              {demoMode ? (
                <p>Giao dịch thử nghiệm — không chuyển tiền thật.</p>
              ) : (
                <>
                  <p>
                    {dealerText(bank['bankName'])} · {dealerText(bank['bankAccountNumber'])} ·{' '}
                    {dealerText(bank['bankAccountHolder'])}
                  </p>
                  <p>
                    Nội dung: <strong>{dealerText(row['transferContent'])}</strong>
                  </p>
                </>
              )}
              <p className={styles.muted}>
                Hạn thanh toán: {dealerDate(row['dueAt'])}. Chỉ khoản tiền đã được đối chiếu mới
                được xác nhận.
              </p>
              {dealerRows(row['proofs']).map((proof) => (
                <p key={dealerText(proof['id'])}>
                  {dealerStatus(proof['status'])}
                  {proof['reason'] ? ` · ${dealerText(proof['reason'])}` : ''}
                </p>
              ))}
              {!backoffice && !reviewing && order['status'] === 'PLACED' && (
                <DealerUpload
                  api={api}
                  path={`dealer/payment-requests/${dealerText(row['id'])}/proofs`}
                  done={() => {
                    void refresh();
                  }}
                />
              )}
            </section>
          );
        })}
      {dealerRows(order['shipments']).map((row) => (
        <div key={dealerText(row['id'])}>
          <strong>{dealerStatus(row['status'])}</strong>
          <p>
            {dealerText(row['carrierName'])} · {dealerText(row['trackingCode'])}
          </p>
          {/^https:\/\//.test(dealerText(row['trackingUrl'])) && (
            <a href={dealerText(row['trackingUrl'])} target="_blank" rel="noreferrer">
              Theo dõi giao hàng
            </a>
          )}
        </div>
      ))}
      {dealerRows(order['refunds']).map((row) => (
        <p key={dealerText(row['id'])}>
          Hoàn {dealerMoney(row['amount'])} · {dealerStatus(row['status'])}
          {row['payoutHold'] === true ? ' · Đang tạm giữ chi trả' : ''}
        </p>
      ))}
      {backoffice && (
        <Link href={`/backoffice/orders/${id}`}>Mở màn hình chuẩn bị và giao hàng →</Link>
      )}
      {['PLACED', 'CONFIRMED', 'PROCESSING'].includes(dealerText(order['status'])) && (
        <details>
          <DisclosureSummary>Yêu cầu hủy đơn</DisclosureSummary>
          <DealerForm
            fields={[{ name: 'reason', label: 'Lý do hủy', type: 'textarea' }]}
            submit="Hủy đơn và xử lý khoản đã nhận"
            onSubmit={async (data) => {
              await api.post(
                `${backoffice ? 'backoffice/dealers' : 'dealer'}/orders/${id}/cancel`,
                data,
              );
              await refresh();
            }}
          />
        </details>
      )}
      {!backoffice && order['status'] === 'COMPLETED' && (
        <>
          <Button
            variant="secondary"
            onClick={() => {
              setError('');
              void api
                .get(`dealer/orders/${id}/warranties`)
                .then((value) => {
                  setWarranties(dealerRows(value));
                })
                .catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : 'Không tải được bảo hành.');
                });
            }}
          >
            Xem phiếu bảo hành cho khách
          </Button>
          <details>
            <DisclosureSummary>Gửi yêu cầu hậu mãi</DisclosureSummary>
            <DealerForm
              fields={[
                {
                  name: 'orderItemId',
                  label: 'Máy cần hỗ trợ',
                  options: dealerRows(order['items']).map((item) => ({
                    value: dealerText(item['id']),
                    label: dealerText(item['productName']),
                  })),
                },
                {
                  name: 'type',
                  label: 'Loại yêu cầu',
                  options: [
                    { value: 'WARRANTY', label: 'Bảo hành' },
                    { value: 'RETURN', label: 'Trả máy' },
                  ],
                },
                { name: 'issueDescription', label: 'Mô tả lỗi', type: 'textarea' },
                { name: 'requestedResolution', label: 'Mong muốn xử lý', required: false },
              ]}
              submit="Gửi yêu cầu"
              onSubmit={async (data) => {
                await api.post('dealer/after-sales', {
                  ...data,
                  requestedResolution: data['requestedResolution'] || undefined,
                });
                setCaseCreated(true);
              }}
            />
            {caseCreated && (
              <InlineAlert tone="success">Đã gửi. Theo dõi tại mục Hậu mãi.</InlineAlert>
            )}
          </details>
        </>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {warranties.map((warranty) => (
        <article className={styles.document} key={dealerText(warranty['warrantyCode'])}>
          <h2>{dealerText(warranty['brandName'])}</h2>
          <h3>Phiếu bảo hành · {dealerText(warranty['warrantyCode'])}</h3>
          <p>Bên bán: {dealerText(warranty['seller'])}</p>
          <p>Khách hàng: {dealerText(warranty['recipientName'])}</p>
          <p>
            {dealerText(warranty['productName'])} · {dealerText(warranty['variantName'])} ·{' '}
            {dealerText(warranty['inventoryCode'])}
          </p>
          <p>
            Từ {dealerDate(warranty['startsAt'])} đến {dealerDate(warranty['endsAt'])}
          </p>
          <p>{dealerText(warranty['terms'])}</p>
          <p>Kiểm định và thực hiện bảo hành: rePhone.</p>
          <p>
            Hỗ trợ: {dealerText(warranty['supportPhone'])} · {dealerText(warranty['supportEmail'])}
          </p>
          <p>Hỗ trợ dự phòng rePhone: {dealerText(warranty['backupSupport'])}</p>
          <p className={styles.muted}>Phiếu này không thay thế hóa đơn bán hàng của đại lý.</p>
        </article>
      ))}
    </section>
  );
}
