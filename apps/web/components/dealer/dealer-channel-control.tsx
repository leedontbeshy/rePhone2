'use client';
import { Button, InlineAlert, StatusChip } from '@/components/ui';
import Link from 'next/link';
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
  openPricing?: () => void;
}) {
  if (configuration['enabled'] === undefined) return <p>Đang tải trạng thái cổng đại lý…</p>;
  const ready = configuration['enabled'] === true;
  const open = configuration['open'] === true;
  const pricingReady = configuration['pricingReady'] === true;
  return (
    <section
      className={[styles.card, styles.channelCard].filter(Boolean).join(' ')}
      aria-label="Điều khiển cổng đại lý"
    >
      <div className={styles.channelHeader}>
        <div>
          <h3>Cổng đại lý</h3>
          <p className={styles.channelEnvironment}>
            {configuration['environment'] === 'TEST'
              ? 'Sandbox · Dữ liệu thử'
              : 'Live · Kinh doanh thực tế'}
          </p>
        </div>
        <StatusChip
          label={!ready ? 'Chưa sẵn sàng' : open ? 'Đang mở' : 'Tạm đóng'}
          tone={!ready ? 'warning' : open ? 'success' : 'neutral'}
        />
      </div>
      <p className={styles.muted}>
        {open ? 'Đang nhận hồ sơ đăng ký và đơn hàng mới.' : 'Tạm ngừng nhận hồ sơ và đơn mới.'}
      </p>
      <p className={styles.muted}>
        Đơn đã có, thanh toán, hoàn tiền và bảo hành tiếp tục được xử lý khi tạm đóng.
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
      {admin && ready && (
        <div className={styles.channelActions}>
          {openPricing === undefined ? (
            <Link className={styles.channelPolicyLink} href="/backoffice/dealers">
              Cấu hình giá & vận chuyển
            </Link>
          ) : (
            <Button variant="ghost" onClick={openPricing}>
              Cấu hình giá & vận chuyển
            </Button>
          )}
        </div>
      )}
      {admin && (!ready || (!pricingReady && !open)) && <Button disabled>Mở cổng đại lý</Button>}
      {admin && ready && (pricingReady || open) && (
        <div className={styles.channelChange}>
          <DealerForm
            key={dealerText(configuration['version'])}
            fields={[
              {
                name: 'reason',
                label: 'Ghi chú thay đổi trạng thái',
                required: false,
                hint: 'Ghi chú được lưu trong lịch sử quản trị.',
              },
            ]}
            submit={open ? 'Tạm đóng cổng đại lý' : 'Mở cổng đại lý'}
            submitVariant={open ? 'secondary' : 'primary'}
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
        </div>
      )}
      {!admin && <p className={styles.muted}>Quản trị viên quản lý việc mở và tạm đóng cổng.</p>}
    </section>
  );
}
