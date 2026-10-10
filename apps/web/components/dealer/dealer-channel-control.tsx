'use client';
import { Button, InlineAlert } from '@/components/ui';
import type { DealerApi, DealerRecord } from '@/lib/dealer-api';
import { dealerText } from '@/lib/dealer-api';
import { DealerForm } from './dealer-primitives';
import styles from './dealer.module.css';

export function DealerChannelControl({
  api,
  configuration,
  admin,
  done,
  openPricing,
}: {
  api: DealerApi;
  configuration: DealerRecord;
  admin: boolean;
  done: () => Promise<void>;
  openPricing: () => void;
}) {
  if (configuration['enabled'] === undefined) return <p>Đang tải trạng thái cổng đại lý…</p>;
  const ready = configuration['enabled'] === true;
  const open = configuration['open'] === true;
  const pricingReady = configuration['pricingReady'] === true;
  return (
    <section className={styles.card} aria-label="Điều khiển cổng đại lý">
      <div className={styles.header}>
        <h2>Cổng đại lý · {configuration['environment'] === 'TEST' ? 'Sandbox' : 'Thực tế'}</h2>
        <span className={styles.badge}>
          {!ready ? 'Chưa sẵn sàng' : open ? 'Đang mở' : 'Tạm đóng'}
        </span>
      </div>
      <p className={styles.muted}>
        {open
          ? 'Đang nhận hồ sơ đăng ký và đơn hàng mới.'
          : 'Tạm ngừng nhận hồ sơ và đơn mới. Đơn đã có vẫn được xử lý.'}
      </p>
      {!ready ? (
        <InlineAlert tone="warning">
          Backend chưa được cấu hình cho môi trường này. Cần hoàn tất cấu hình môi trường và khóa mã
          hóa trước khi sử dụng nút mở cổng.
        </InlineAlert>
      ) : !pricingReady ? (
        <InlineAlert tone="info">
          Chưa có giá sàn bảo vệ lợi nhuận. Lưu dự phòng và lãi tối thiểu trong Giá & vận chuyển
          trước khi mở cổng.
        </InlineAlert>
      ) : null}
      {admin && (!ready || (!pricingReady && !open)) && <Button disabled>Mở cổng đại lý</Button>}
      {admin && ready && (pricingReady || open) && (
        <details className={styles.profileDisclosure}>
          <summary>Quản lý trạng thái cổng</summary>
          <p className={styles.muted}>
            Khi tạm đóng, đại lý vẫn theo dõi đơn cũ, thanh toán, hoàn tiền và bảo hành.
          </p>
          <DealerForm
            key={dealerText(configuration['version'])}
            fields={[
              {
                name: 'reason',
                label: 'Ghi chú thay đổi trạng thái cổng',
                required: false,
                hint: 'Ghi chú được lưu trong lịch sử quản trị.',
              },
            ]}
            submit={open ? 'Tạm đóng cổng đại lý' : 'Mở cổng đại lý'}
            onSubmit={async (data) => {
              await api.post('backoffice/dealers/configuration', {
                open: !open,
                expectedVersion: configuration['version'],
                reason:
                  data['reason'] ||
                  (open ? 'Tạm đóng cổng từ trang quản trị' : 'Mở cổng từ trang quản trị'),
              });
              await done();
            }}
          />
        </details>
      )}
      {admin && ready && (
        <Button variant="secondary" onClick={openPricing}>
          Cấu hình giá & vận chuyển
        </Button>
      )}
      {!admin && <p className={styles.muted}>Quản trị viên quản lý việc mở và tạm đóng cổng.</p>}
    </section>
  );
}
