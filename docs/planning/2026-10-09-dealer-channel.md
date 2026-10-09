# Dealer channel — bàn giao triển khai

Nhánh `codex/dealer-portal`, base `main` tại `569b564`. Nguồn nghiệp vụ [spec v1.0](../requirements/dealer-channel.md); [API](../api/dealer-channel-contract.md); [vận hành/TEST](../operations/dealer-channel.md); [state matrix](../architecture/state-machines.md#12-dealer-channel--spec-v10); [invariants](../quality/dealer-invariants.md).

## Phạm vi đã tích hợp

| Gói | Kết quả |
|---|---|
| G0 | Policy tiền/access/clock, state matrix, invariant và exception registry |
| G1 | Bảy migration, 23 bảng domain mới (51 tổng), kiểm tra constraints/tenant/append-only/aggregate money, mặc định STOREFRONT và upgrade harness có dữ liệu bán lẻ |
| G2 | Hồ sơ/điều khoản/duyệt; bank mã hóa/email/verify/cooling; risk metrics và hold limit; business suspension/security lock/credential revocation |
| G3 | Giá có cost floor, override, vùng giao/quote địa chỉ; preview/create; snapshot; durable idempotency/externalOrderId; reservation chung web chính |
| G4 | PaymentRequest/Proof/BankTransaction/Allocation, tiền thiếu/thừa/muộn; pause/resume clock và expiry; correction/reversal/reconciliation; refund đúng một nguồn/record, quota/payout hold/frozen destination/rebind |
| G5 | Funding guard ở chuẩn bị/bàn giao/giao; không COD; return INSPECTING/fee settlement; assessment hậu mãi; đổi tương đương hoặc refund+new order; cộng ngày bảo hành; thông báo và phiếu theo vai trò đại lý/rePhone |
| G6 | API key hash/raw-once/expiry/scopes/quota, audit API_CLIENT; outbox/lease/retry/replay/HMAC/rotation; public HTTPS/DNS pin/SSRF guard; OpenAPI/client đồng bộ |
| G7 | Portal `/dealer`, backoffice `/backoffice/dealers`, terms/API guide; isolated TEST marker/storage/mail/key, seed/simulator gọi engine thật; simulation không đăng ký LIVE |
| G8 | Runbook bật/tắt/đối soát/ngân hàng/hậu mãi/sự cố; bộ kiểm thử và đường đi browser. Pilot thương mại thực tế chưa được mở |

Không thêm AI, affiliate, phụ kiện, COD, ví/công nợ, đơn nhiều máy, carrier integration hoặc gateway nhận tiền tự động. Phí giao dùng policy/quote nội bộ; vận đơn và đối chiếu ngân hàng do nhân viên nhập. Đây là phạm vi v1 được duyệt.

## Điểm cần biết khi review

- Schema và contract được tích hợp tập trung; không clone engine tồn kho/giao/bảo hành. Tiền đại lý dùng ledger riêng, không tạo Payment bán lẻ giả.
- PostgreSQL bảo vệ reservation, identity/source, nguồn tiền và snapshot. Tổng qua nhiều hàng được kiểm bằng deferred constraint triggers và transaction locks, không dùng CHECK đơn hàng để thay concurrency guard.
- TEST dùng dữ liệu tổng hợp. Default dealer flag tắt; LIVE cần secret riêng, bảng giá, hồ sơ/bank/điều khoản thật. Dừng đơn mới bằng pricing policy, vẫn giữ xử lý đơn cũ.
- 64 operation đại lý trong OpenAPI chuẩn, cộng hai simulation operations chỉ xuất hiện khi TEST được bật. FE-10 nối vào registry route/operation/browser; registry chứng minh ownership, không khẳng định browser đã chạy từng endpoint tài chính.
- Đổi máy khác giá tạo giao dịch mới, không sửa snapshot giá cũ. Bảo hành khách không kèm giá sỉ hoặc QR ngân hàng của rePhone.

## Validation

Bằng chứng ngày 2026-10-09 nằm dưới `.local/dealer/` và `.local/playwright-results/` (không commit log hay credential).

| Kiểm tra | Kết quả |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | Qua toàn workspace |
| `pnpm --filter @rephone/api test` | 790 tests / 125 files qua |
| Web Vitest (`--maxWorkers=4`) | 681 tests / 139 files qua |
| API client + Node script tests | 7 + 17 tests qua |
| Dealer HTTP/PostgreSQL suite | 19 tests qua, gồm stock/money races, scope, worker concurrency và repair retry |
| `pnpm test:e2e` toàn API | 122 tests / 15 files qua, gồm kênh bán lẻ và đại lý |
| PostgreSQL integration | 55 tests: 54 qua trong lượt toàn bộ, 1 readiness qua khi chạy riêng sau timeout khởi động |
| Browser Chromium trên production build | 5 tests qua: portal → admin → phiếu bảo hành; public terms/guide; mua hàng bán lẻ → giao thành công; chặn truy cập backoffice ẩn danh; skip links/axe. Portal 360px không tràn ngang, có pin/cấp ngoại hình, axe không có lỗi serious/critical |
| `pnpm api:openapi`, `pnpm api:client` | Regenerate ổn định, hash không thay đổi |
| `pnpm build` | API, web và client build thành công |

Đã xem ảnh portal đặt hàng và phiếu bảo hành mobile. Một lượt browser trước hết thời gian khởi động khi chạy cùng các kiểm tra khác; chạy riêng đã qua. Không dùng lượt timeout làm bằng chứng đạt. Hook khởi động Nest trong integration/E2E được tăng từ 20 lên 60 giây cho cold import của toàn bộ module; timeout từng test nghiệp vụ vẫn 20 giây. Readiness đã chạy lại và qua với cấu hình mới, không cần CLI override. Toàn bộ API E2E/integration được chạy tuần tự vì dùng chung database test. Browser regression cuối chạy bốn file `dealer-flow`, `critical-commerce-flow`, `backoffice-access`, `release-matrix`, lọc năm scenario đã ghi ở bảng; không tuyên bố đã chạy toàn bộ browser suite.

Đã xác minh upgrade: 13 migration baseline + 7 migration mới trên PostgreSQL 17, đơn/Payment bán lẻ và số tiền giữ nguyên, channel STOREFRONT backfill đúng, dealer receipts không tự sinh; identity constraint vẫn chặn dữ liệu sai. Lượt kiểm thử này dùng database riêng.

## Đồng bộ Supabase ngày 2026-10-09

Sau khi người dùng xác nhận, đã sao lưu schema `public` và dữ liệu ứng dụng, rồi áp dụng tám migration đang chờ lên Supabase được cấu hình trong `.env`: một migration idempotency hoàn tiền cũ và bảy migration đại lý. `db:check` xác nhận đủ 20 migration, không còn pending, incomplete hoặc checksum mismatch.

Đối chiếu số hàng và checksum trên các cột cũ của toàn bộ 28 bảng hiện hữu đều khớp trước/sau; thêm 23 bảng đại lý, tổng 51 bảng ứng dụng. Không cấp quyền các bảng đại lý cho `anon`, `authenticated`, `service_role` hoặc `PUBLIC`. Bản sao lưu và kết quả kiểm chứng nằm trong `.local/dealer/`, không commit.

Đã kiểm tra tạo iPhone bằng `BackofficeCatalogService` và ghi `AuditWriter` với tài khoản database runtime: thành công, sau đó rollback giao dịch kiểm tra để không để lại sản phẩm thử. Cấu hình host được sửa để API dùng TLS và Next dev đọc `.env` ở gốc workspace. Cache Next dev cũ gây 404 ở trang thêm/chi tiết sản phẩm đã được tạo lại; các trang trả HTTP 200. Việc đồng bộ database không tự bật cổng đại lý LIVE hoặc chính sách giá.

## Khi mở pilot

### Bổ sung điều khiển cổng và giá máy ngày 2026-10-09

Theo yêu cầu người dùng, ADMIN mở/tạm đóng cổng từ UI sau khi backend được chuẩn bị một lần. Dùng lại `DealerPricingPolicy.enabled` thay vì thêm cột hoặc ghi file môi trường từ HTTP. Đóng nghĩa là dừng đăng ký và đơn mới, vẫn phục vụ nghĩa vụ cũ; `DEALER_ENABLED` giữ vai trò sẵn sàng hạ tầng/bảo trì. Quyết định này dùng cùng điều kiện chào bán hiện hữu, không tạo hai công tắc kinh doanh khác nhau. Quy mô pilot nhỏ, truy vấn trạng thái trực tiếp database để các tiến trình nhận thay đổi ngay, có version và audit cho ADMIN. Khóa mã hóa giữ phía backend, không xuất qua UI/API. Sandbox tiếp tục là deployment riêng.

Hồ sơ máy bổ sung giá sàn, giá đại lý tính ra, override và bật/tắt riêng từng máy; form nhập kho giải thích giá nhập là giá bán công khai. Không thay snapshot giá đơn cũ. Không cần migration mới cho phần này.

Kiểm chứng bổ sung: API/web typecheck, lint các file ảnh hưởng, format và web production build đều qua. 12 API unit/contract tests, 18 web contract/intake/detail tests qua sau đồng bộ ledger tài liệu; 21 dealer HTTP/PostgreSQL tests qua trên database local `rephone_test` (đã chuẩn bị migration trước khi chạy). Hai bài browser trên production build qua: đóng/mở cổng giữ truy cập đơn cũ, xem/lưu giá máy, nhận tiền/giao hàng/phiếu bảo hành và trang tài liệu. Đã xem ảnh hai phần UI mới. OpenAPI/client được sinh lại, giữ operationId cấu hình cũ và bổ sung hai operations, tổng 66 operations đại lý chuẩn.

Backend native hiện tại đã được cấu hình LIVE và khóa mã hóa riêng trong các file môi trường cục bộ bị git ignore, Compose đã chuyển tiếp cùng biến. Database Supabase xác nhận marker LIVE và chính sách còn `enabled=false`; chưa tự chọn dự phòng/lãi tối thiểu hoặc mở bán. Chỉ thêm marker và chính sách mặc định lúc khởi động; không đổi schema hoặc tạo đơn thật cho kiểm thử. Người dùng cấu hình giá và bấm mở từ UI. Sandbox dùng cho browser test là bản chạy tạm riêng, chưa có Sandbox thường trực dành cho đối tác.

Người vận hành chốt thông tin pháp nhân/chứng từ, thỏa thuận phí/hậu mãi/PII, ngân hàng thực và người trực đối soát theo [runbook](../operations/dealer-channel.md). Thử nhóm nhỏ đã được duyệt; việc triển khai nhánh này không tự bật LIVE, không chuyển tiền hoặc tạo vận đơn thật.
