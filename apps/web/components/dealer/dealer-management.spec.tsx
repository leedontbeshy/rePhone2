import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DealerApi, DealerRecord } from '@/lib/dealer-api';
import { DealerChannelControl } from './dealer-channel-control';
import { DealerProfileAdmin } from './dealer-profile-admin';

const api: DealerApi = { get: vi.fn(), post: vi.fn(), upload: vi.fn() };
const profile: DealerRecord = {
  id: 'dealer-profile-id',
  displayName: 'Đại lý mẫu',
  businessStatus: 'ACTIVE',
  securityStatus: 'NORMAL',
  riskLevel: 'ELEVATED',
  maximumUnfundedOrders: 0,
  approvedDomains: ['example.test'],
  termsVersion: 'dealer-v1.0',
  histories: [{ id: 'history-1', action: 'APPROVE', createdAt: '2026-10-01T00:00:00Z' }],
};

function renderProfile(row: DealerRecord, admin: boolean) {
  return renderToStaticMarkup(
    <DealerProfileAdmin
      row={row}
      api={api}
      admin={admin}
      termsVersion="dealer-v1.0"
      done={async () => {}}
      close={() => {}}
    />,
  );
}

function renderChannel(configuration: DealerRecord, admin = true) {
  return renderToStaticMarkup(
    <DealerChannelControl
      api={api}
      configuration={configuration}
      admin={admin}
      done={async () => {}}
    />,
  );
}

describe('dealer management presentation boundaries', () => {
  it('keeps profile facts and history visible to employees without exposing admin forms', () => {
    const html = renderProfile(profile, false);
    expect(html).toContain('Thông tin hồ sơ');
    expect(html).toContain('dealer-profile-id');
    expect(html).toContain('example.test');
    expect(html).toContain('1 lần xử lý');
    expect(html).not.toContain('Quản lý hồ sơ');
    expect(html).not.toContain('Cập nhật giới hạn');
    expect(html).not.toContain('Khóa truy cập');
    expect(html).not.toContain('<form');
  });

  it('uses actual risk limits including zero and preserves allowed state and security actions', () => {
    const html = renderProfile(profile, true);
    expect(html).toContain('Cần theo dõi');
    expect(html).toContain('Tối đa 0 đơn chưa đủ tiền');
    expect(html).toContain('Tạm ngừng đơn mới');
    expect(html).toContain('Chấm dứt kinh doanh');
    expect(html).not.toContain('Tiếp tục kinh doanh');
    expect(html).toContain('Khóa truy cập');
    expect(html).not.toContain('Gỡ khóa bảo mật');
    const locked = renderProfile({ ...profile, securityStatus: 'SECURITY_LOCKED' }, true);
    expect(locked).toContain('Gỡ khóa bảo mật');
    expect(locked).not.toContain('Khóa truy cập');
  });

  it('shows honest empty profile facts and history without fabricating summaries', () => {
    const html = renderProfile({ id: 'empty', businessStatus: 'CLOSED' }, true);
    expect(html).toContain('Chưa đăng ký');
    expect(html).toContain('Chưa chấp nhận');
    expect(html).toContain('Chưa có thông tin');
    expect(html).toContain('Chưa có lịch sử xử lý hồ sơ.');
    expect(html).not.toContain('Tối đa 0 đơn');
    expect(html).not.toContain('Lưu trạng thái');
  });

  it('separates channel environment and business state and puts configuration before state changes', () => {
    const html = renderChannel({
      enabled: true,
      open: true,
      pricingReady: true,
      environment: 'TEST',
    });
    expect(html).toContain('Sandbox · Dữ liệu thử');
    expect(html).toContain('Đang mở');
    expect(html.indexOf('Cấu hình giá &amp; vận chuyển')).toBeLessThan(
      html.indexOf('Ghi chú thay đổi trạng thái'),
    );
    expect(html).toContain('Tạm đóng cổng đại lý');
    expect(html).toContain('name="reason"');
    const employee = renderChannel({ enabled: true, open: true, pricingReady: true }, false);
    expect(employee).not.toContain('<form');
    expect(employee).not.toContain('Cấu hình giá &amp; vận chuyển');
  });

  it('keeps opening disabled until setup is ready and preserves pricing resolution', () => {
    const notReady = renderChannel({ enabled: false, open: false });
    expect(notReady).toContain('Chưa sẵn sàng');
    expect(notReady).toContain('disabled=""');
    expect(notReady).not.toContain('<form');
    const needsPricing = renderChannel({ enabled: true, open: false, pricingReady: false });
    expect(needsPricing).toContain('Chưa có giá sàn bảo vệ lợi nhuận');
    expect(needsPricing).toContain('Cấu hình giá &amp; vận chuyển');
    expect(needsPricing).toContain('disabled=""');
    expect(needsPricing).not.toContain('<form');
  });
});
