import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DealerApiGuide } from './dealer-api-guide';
import { DealerWorkspaceHeader } from './dealer-workspace';

describe('single dealer API connection guide', () => {
  it('keeps all commerce APIs and shows one current connection without a product sandbox', () => {
    const html = renderToStaticMarkup(
      <DealerApiGuide apiBaseUrl="https://api.example.test/api/v1" currentEnvironment="LIVE" />,
    );
    expect(html).toContain('Danh sách 16 API');
    expect(html.match(/id="endpoint-/g)).toHaveLength(16);
    expect(html).toContain('https://api.example.test/api/v1');
    expect(html).toContain('&lt;TOAN_BO_KHOA_API_DUOC_CAP&gt;');
    expect(html).toContain('href="/dealer"');
    expect(html).toContain('Cấu hình trên máy chủ website của bạn');
    expect(html).not.toMatch(/sandbox|rp_test_|rp_live_|Đổi môi trường|Thực tế · LIVE/i);
    expect(html).not.toContain('Dữ liệu phát triển');
    expect(html).toContain('Gửi thông báo thử');
    expect(html).toContain('không tạo đơn với thông tin giả');
  });

  it('preserves the development warning and actual webhook environment without offering a switch', () => {
    const html = renderToStaticMarkup(
      <DealerApiGuide apiBaseUrl="http://localhost:4000/api/v1" currentEnvironment="TEST" />,
    );
    expect(html).toContain('Dữ liệu phát triển — không chuyển tiền thật');
    expect(html).toContain('http://localhost:4000/api/v1');
    expect(html).toContain('&quot;environment&quot;: &quot;TEST&quot;');
    expect(html).not.toMatch(/sandbox|rp_live_|Live ·/i);
  });

  it('explains a missing API address instead of displaying a made-up production address', () => {
    const html = renderToStaticMarkup(<DealerApiGuide apiBaseUrl="" currentEnvironment="LIVE" />);
    expect(html).toContain('Chưa có địa chỉ API được cấu hình trên trang này.');
    expect(html).toContain('&lt;DIA_CHI_API_DO_REPHONE_CAP&gt;/api/v1');
  });

  it('shows development status only when the current runtime requires it', () => {
    const live = renderToStaticMarkup(
      <DealerWorkspaceHeader title="Đại lý" description="Quản lý đơn" test={false} />,
    );
    expect(live).not.toMatch(/sandbox|live|dữ liệu phát triển/i);
    const development = renderToStaticMarkup(
      <DealerWorkspaceHeader title="Đại lý" description="Quản lý đơn" test />,
    );
    expect(development).toContain('Dữ liệu phát triển — không chuyển tiền thật');
  });
});
