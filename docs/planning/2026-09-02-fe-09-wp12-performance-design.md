# FE-09 WP-12 — Thiết kế đo performance, client boundary và media

> Trạng thái: **APPROVED FOR IMPLEMENTATION**<br>
> Nguồn xác nhận: kế hoạch FE-09 đã được người dùng chốt và yêu cầu triển khai<br>
> Parent plan: [2026-09-01-fe-09-comprehensive-release-hardening-plan.md](./2026-09-01-fe-09-comprehensive-release-hardening-plan.md)<br>
> Ngày: 02/09/2026

## Understanding summary

- WP-12 phải đo bản dựng production trên một SHA sạch trước mọi tối ưu.
- Kết quả phục vụ release owner và maintainer frontend, không phải số liệu marketing.
- Harness dùng Nest API thật, PostgreSQL test, Next production và Chromium đã được
  chọn cho FE-09; dữ liệu/session được chuẩn bị ngoài đoạn đo.
- Mỗi route warm-up một lần, đo ít nhất ba lần và dùng median.
- Gate tuyệt đối là LCP `<= 2.500 ms`, CLS `<= 0,1`, interaction proxy `<= 200 ms`;
  baseline/after còn khóa regression tương đối lớn hơn 10%.
- Report phải có navigation, request count/path, transferred bytes, client JS,
  hydration/page error và commit SHA; artifact thô nằm trong `.local/`.
- Chỉ sửa client boundary, skeleton hoặc media khi baseline chứng minh hotspot;
  không trộn legacy cleanup của WP-13.

## Assumptions và non-functional requirements

- Profile cố định: viewport `390×844`, CPU ×4, latency 40 ms, download 10 Mbps,
  upload 5 Mbps và deterministic public media.
- Quy mô WP-12 là representative route, không phải load/concurrency test nhiều người
  dùng. Backend throughput/availability nằm ngoài scope frontend performance này.
- Session customer/admin dùng tài khoản test và cookie trong context cục bộ; report
  không ghi cookie, token, email, database URL hoặc query chứa dữ liệu riêng tư.
- Reliability: zero retry trong performance test; setup thất bại, thiếu metric hoặc
  runtime issue luôn làm run đỏ. Chế độ `baseline` chỉ ghi nhận budget để giữ được
  mốc so sánh ban đầu; chế độ `after` mới dùng budget tuyệt đối làm release gate.
  Một context xác thực được giữ tuần tự để refresh-cookie rotation luôn dùng token
  mới nhất.
- Maintenance: route descriptor sở hữu ready condition và interaction an toàn;
  comparator độc lập sở hữu baseline/after contract.
- Browser hiện tại là Chromium/Windows theo lựa chọn đã khóa ở WP-11. Kết luận không
  được nâng thành cross-browser performance.

## Phương án đã cân nhắc

| Phương án | Mô tả | Đánh đổi | Quyết định |
| --- | --- | --- | --- |
| A — Production route descriptor + API thật | Chuẩn bị customer/admin/order ngoài timed path, đo từng route bằng interaction riêng | Nhiều setup hơn nhưng phản ánh đúng boundary/request | **Chọn** |
| B — Intercept API bằng fixture | Nhanh, hoàn toàn deterministic | Che network/request/N+1 và backend projection; không đủ cho WP-12 | Loại |
| C — Chỉ phân tích bundle tĩnh | Dễ chạy CI | Không có LCP/CLS/interaction hay runtime request | Chỉ dùng bổ trợ, không thay A |

## Thiết kế cuối

### Runtime và dữ liệu

1. Build web production với API URL test cố định.
2. Test server reset/migrate/seed PostgreSQL test và chạy compiled Nest API.
3. Setup một customer context và một admin context bằng login UI ngoài timed path.
4. Customer dùng máy `IP14P-256-001` để tạo một đơn shipping đại diện; máy
   `IP14P-128-001` giữ cho exact-unit và guest cart/checkout.
5. Admin discovery lấy product ID và order ID từ UI/API thật. Context xác thực được
   giữ tuần tự; trước mỗi sample xóa browser cache nhưng không tái dùng refresh cookie
   cũ trong context khác.

### Route matrix

- storefront model và exact-unit;
- login và account;
- guest cart và checkout;
- customer order detail;
- backoffice catalog product detail;
- inventory intake;
- backoffice order detail;
- audit log và system health.

Mỗi descriptor khai báo role, path, ready condition và một interaction không gây
mutation nghiệp vụ. Guest cart được tạo lại ngoài navigation timing. Route động dùng
ID/order number được discover trong setup nhưng report chỉ ghi tên route/template.

### Metric và lỗi

- `PerformanceObserver`: LCP và CLS.
- Hai `requestAnimationFrame` sau interaction: interaction proxy.
- Navigation Timing: navigation duration.
- Resource Timing: request count, transferred bytes và JS chunk bytes.
- Request listener: aggregate pathname đã bỏ query để phát hiện N+1 mà không lưu dữ
  liệu riêng tư.
- `pageerror` luôn làm sample đỏ; console hydration mismatch/server-render warning
  cũng làm đỏ.
- Metric bắt buộc bằng 0, route chưa ready, setup thất bại hoặc runtime issue đều
  làm test đỏ. Absolute budget vượt ngưỡng được ghi vào baseline để phục vụ chẩn
  đoán; cùng vi phạm đó ở report `after` làm test đỏ.

### Report và comparator

Report schema version mới ghi SHA, profile, threshold, route template, từng sample,
median, request-path median và lỗi runtime đã sanitize. Baseline và after là hai file
riêng; không ghi đè báo cáo lịch sử. Comparator yêu cầu cùng schema/profile/route set,
áp absolute budget và đánh dấu regression hơn 10% ở LCP, interaction, navigation,
transferred bytes, client JS hoặc request count. Regression chỉ được chấp nhận bằng
decision trong evidence, không tự tăng threshold.

## Decision log

| Quyết định | Lựa chọn khác | Lý do |
| --- | --- | --- |
| Đo API thật, không route interception | Fixture browser | Cần nhìn thấy request/N+1 và boundary production |
| Setup order bằng flow thật ngoài timed path | Seed order trực tiếp hoặc đo không có order | Giữ contract route và ownership giống người dùng, không làm bẩn thời gian đo |
| Giữ context auth tuần tự | Reuse một storageState cho nhiều context | Refresh token rotation làm storageState gốc stale |
| Giữ raw `<img>` cho baseline | Đổi ngay sang `next/image` | Chưa có allowlist/build proof và chưa có số đo lợi ích |
| Đo trước khi chuyển `CommerceProvider` | Di chuyển provider ngay | Root boundary là giả thuyết, không phải bằng chứng hotspot |
| Tách WP-13 cleanup | Xóa legacy cùng lúc | Giữ baseline/rollback và attribution rõ |

## Điều kiện bắt đầu implementation

Understanding, assumptions, approach và decision log đã được khóa bởi parent plan
được người dùng chốt. Implementation phải đi theo thứ tự: harness → commit sạch →
baseline → phân tích hotspot → một concern tối ưu → after/comparator → evidence.
