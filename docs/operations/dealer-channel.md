# Vận hành cổng đại lý

## Truy cập và trách nhiệm

Đại lý dùng `/dealer`; nhân viên `/backoffice/dealers`. Chuẩn bị/giao hàng và hậu mãi dùng màn hình chung được liên kết từ đơn/case. Điều khoản mẫu `/dealer/terms`, hướng dẫn `/dealer/api-guide` và [API contract](../api/dealer-channel-contract.md).

Đại lý là bên bán, quyết định giá và thu tiền khách. rePhone bán sỉ, kiểm định, fulfillment và bảo hành. Mỗi đơn một máy, đủ tiền thực nhận trước xuất hàng, không COD/công nợ. rePhone hoàn cho đại lý theo giá sỉ; đại lý hoàn cho khách. Phiếu khách không chứa giá sỉ hoặc hướng dẫn chuyển tiền cho rePhone.

## Chạy TEST

### Sandbox cục bộ dùng ngay

Chạy `pnpm dealer:sandbox:prepare` một lần, sau đó `pnpm dealer:sandbox`. Cần Docker đang chạy. Runner tạo database riêng `rephone_dealer_sandbox` trên PostgreSQL cổng 5433, áp migration và seed; không đọc thông tin kết nối Supabase từ `.env`, không reset database kiểm thử `rephone_test`.

- Đại lý: `http://127.0.0.1:3002/dealer`; admin: `http://127.0.0.1:3002/backoffice/dealers`.
- API: `http://127.0.0.1:4002/api/v1`; Swagger: `http://127.0.0.1:4002/docs`.
- Tài khoản và mật khẩu mẫu nằm ở `.local/dealer-sandbox/accounts.txt`. Chỉ dùng các tài khoản này trong môi trường cục bộ.
- Cấu hình và khóa mã hóa ổn định nằm trong `.local/dealer-sandbox/environment.json` (gitignored). Runner chỉ chấp nhận database local có đúng tên trên.
- API biên dịch vào `.sandbox-dist` để giữ metadata validation như Live; web chạy từ bản sao local ở `.local/dealer-sandbox/web` với cache `.next-dealer-sandbox`, không ghi đè API hay file types của Live. Sau khi sửa mã nguồn, dừng/chạy lại sandbox để cập nhật bản sao.
- Đăng nhập tài khoản đại lý Sandbox → **Kết nối website** → **Tạo khóa API**. Key bắt đầu `rp_test_`; cả key và địa chỉ API phải cùng môi trường.
- Email dùng provider giả, không gửi thư thật. Storage chứng từ chỉ giữ metadata; liên kết tệp riêng chưa hỗ trợ xem nội dung. Ảnh sản phẩm mẫu đọc từ repo. Dùng mô phỏng để kiểm thử tiền và vận chuyển.
- Ctrl+C ở terminal chạy sandbox để dừng; dữ liệu đơn được giữ. Chuẩn bị lại áp seed/chính sách mẫu nhưng không xóa đơn đã tạo.

Muốn hiện nút mở Sandbox từ portal Live, cấu hình `DEALER_SANDBOX_WEB_URL=http://127.0.0.1:3002` và `DEALER_SANDBOX_API_URL=http://127.0.0.1:4002/api/v1` cho API và web rồi khởi động lại. Deployment cho đối tác bên ngoài phải thay bằng URL HTTPS truy cập được; URL local chỉ dùng trên máy phát triển. `DEALER_LIVE_WEB_URL` là liên kết trở về portal Live từ Sandbox. Hai portal dùng hostname khác nhau để tránh trùng cookie phiên đăng nhập.

### Deployment TEST riêng

1. Tạo PostgreSQL riêng tên kết thúc `_test` hoặc `_sandbox`; storage buckets riêng có `test`/`sandbox` trong tên; SMTP localhost/Mailpit/Mailhog.
2. Cấu hình DATABASE_URL/DIRECT_URL, storage/mail; `DEALER_ENABLED=true`, `DEALER_ENVIRONMENT=TEST`. `DEALER_WORKER_ENABLED=true` để chạy expiry/webhook; đặt false nếu muốn diễn tập thủ công không có job nền.
3. Chạy `pnpm db:deploy`, `pnpm db:generate`, `pnpm dealer:sandbox:seed`. Seed bị chặn ở production/database sai. Dùng SEED_CUSTOMER/ADMIN đã cấu hình; tạo đại lý TEST được duyệt, bank giả, chiết khấu 5%, dự phòng/lãi tối thiểu 100.000đ mỗi khoản, phí giao 30.000đ. Không tạo/in API secret.
4. Đăng nhập SEED_CUSTOMER → `/dealer` → Kho máy → preview/tạo đơn; địa chỉ hỗ trợ TP. Hồ Chí Minh/TP.HCM/Hà Nội.
5. SEED_ADMIN → Đại lý → Đơn đại lý → Xem đơn → Diễn tập TEST: nhận đủ tiền rồi giao thành công; kiểm tra phiếu bảo hành. Luồng khác: nhận tiền → giao thất bại → nhận hoàn → chốt phí → hủy → hoàn từng nguồn.

Không chuyển tiền thật theo TEST. Không đổi marker, prefix key hoặc sửa trạng thái để chuyển đơn TEST thành LIVE. Giữ key mã hóa ổn định để đọc ciphertext cũ.

`pnpm exec playwright test tests/browser/dealer-flow.spec.ts` chuẩn bị database `_test` theo TEST_DATABASE_URL, seed và mở API/web tạm; không chạy đồng thời integration/E2E vì reset cùng database. Browser server luôn ép TEST, không tác động deployment LIVE.

## Rollout LIVE

Mặc định `.env.example` tắt dealer. Backup, áp bảy migration forward-only, generate/build rồi kiểm tra health. Dữ liệu cũ nhận channel STOREFRONT; không backfill tiền đại lý từ Payment/chứng từ cũ.

LIVE dùng database/storage/mail riêng, `DEALER_ENVIRONMENT=LIVE`, `DEALER_ENCRYPTION_KEY` ngẫu nhiên 32-byte base64 riêng với identifier key. Không thay key khi còn ciphertext nếu chưa re-encrypt. Bật DEALER_ENABLED chỉ sau setup; pricing policy vẫn disabled cho tới ADMIN cấu hình sàn/vùng giao. Máy thiếu cost hoặc giá đại lý không thấp hơn giá công khai bị ẩn.

Trước pilot thật, chủ dự án chốt thỏa thuận thương mại, chứng từ/hóa đơn, thông tin bên bán, chính sách hậu mãi/PII, phí và người đối soát. Những cấu hình kinh doanh này chưa được áp vào production trong nhánh này. Bắt đầu với nhóm đại lý nhỏ đã duyệt.

## Công việc vận hành

**Mở / tạm đóng cổng:** sau khi backend đã được cấu hình một lần cho LIVE hoặc TEST, ADMIN dùng thẻ **Cổng đại lý** ở đầu `/backoffice/dealers`. Lưu dự phòng và lãi tối thiểu ở **Giá & vận chuyển** trước khi mở. Thao tác lưu vào `DealerPricingPolicy.enabled`, có kiểm tra phiên bản và audit, không cần khởi động lại. Tạm đóng chặn hồ sơ đăng ký và đơn mới; profile, đơn cũ, tiền, hậu mãi và worker vẫn hoạt động. Đây không phải công tắc đổi LIVE/Sandbox. Nhân viên chỉ xem trạng thái.

**Giá từng máy:** giá nhập kho là giá bán công khai. Giá đại lý tự tính theo chiết khấu và giá sàn; ADMIN mở hồ sơ máy vật lý, xem mục **Giá đại lý** dưới phần chi phí để xem giá sàn, giá tính ra, đặt giá riêng hoặc ngừng chào bán máy đó. Để trống giá riêng để trở lại chính sách chung; bấm **Tính lại giá** sau khi cập nhật chi phí. Giá riêng vẫn phải đạt sàn và thấp hơn giá công khai. Thiếu giá vốn / cấu hình sàn thì chưa có giá đủ điều kiện.

**Khóa mã hóa:** `DEALER_ENCRYPTION_KEY` là bí mật 32-byte base64 phía máy chủ, dùng mã hóa tài khoản ngân hàng nhận hoàn và webhook secret. Không phải API key đại lý, không đưa vào frontend, không thay ngẫu nhiên khi khởi động. Cần giữ cùng khóa khi khôi phục backup dữ liệu. Cấu hình Compose dev/demo chuyển tiếp các biến DEALER_* từ `.env.docker`; việc mở bán vẫn thực hiện bằng UI.

**Hồ sơ:** đối chiếu pháp nhân/MST/domain; chủ đại lý gửi bank và xác nhận email; ADMIN xem có audit và verify, sau đó duyệt ACTIVE. Bank thay thế chờ 24 giờ, refund cũ giữ snapshot.

**Nhận tiền:** kiểm tra queue chứng từ, chú ý review >120 phút. Đối chiếu sao kê rồi ghi bankAccountKey/reference/amount/receivedAt/order/proof. Proof không cộng tiền. Chuyển thiếu tạo hạn bổ sung 30 phút một lần; thừa tiền ở receipt để hoàn riêng; tiền đến sau hủy không phục hồi đơn.

**Đối soát ngày:** so sao kê với receipt theo bank account/ngày; effective receipt = received + corrections. Allocation ròng + direct refund obligations không vượt effective receipt; tiền còn lại = effective receipt − completed refunds. Kiểm tra receipt chưa gán, proof quá hạn, reconciliation cases, refund REQUESTED/PROCESSING/UNKNOWN và webhook FAILED. Dùng ledger, không suy tiền từ ảnh hoặc chỉ dựa trên Order summary.

**Hoàn tiền:** tạo theo giá sỉ, START → xem destination snapshot → chuyển ngoài ngân hàng → MARK_SENT → complete với chứng từ. Không rõ kết quả chọn MARK_UNKNOWN, xác nhận ngân hàng trước khi xử lý tiếp, không gửi lần hai. Mỗi nguồn có một Refund. Hold không giải phóng quota. Bank bị disable gây hold; chỉ khoản chưa gửi mới được rebind sang bank đã xác minh và RELEASE sau kiểm tra.

**Giao/hoàn hàng:** engine kiểm funding trước chuẩn bị/bàn giao/giao thành công, không COD. Giao thất bại → nhận hoàn → INSPECTING. Chốt trách nhiệm và phí outbound/return thực tế trước hủy. Giữ phí theo settlement một lần, không cộng phí đã thu lần nữa. Chỉ kiểm định riêng mới đưa máy về AVAILABLE.

**Hậu mãi:** nhận và kiểm định trên engine chung; assessment tại Đại lý (nguyên nhân/phạm vi/bên chịu phí/phần đã đối trừ), rồi approve/resolve trên màn hình hậu mãi chung. Lỗi sẵn có rePhone chịu phí. Sửa/đổi cộng ngày máy nằm bảo hành một lần, retry không cộng lại. Đổi tương đương cùng cấu hình/giá đại lý; khác giá hoàn cũ và tạo đơn mới linkedOriginalOrderId. Đại lý ngừng hoạt động: staff backup intake sau đối chiếu người nhận/phiếu.

## Sự cố

**Xác nhận tài khoản nhận hoàn:** nhập ngân hàng chỉ là bước lưu yêu cầu. Chủ đại lý xác nhận liên kết gửi tới email đăng nhập, sau đó ADMIN mở hồ sơ, đối chiếu số tài khoản/chủ tài khoản và xác minh. Tài khoản đầu tiên có hiệu lực ngay khi xác minh; tài khoản thay thế chờ 24 giờ. Hồ sơ chỉ được duyệt khi có tài khoản có hiệu lực.

Nếu gửi email thất bại, tài khoản vẫn được giữ và UI báo rõ “Đã lưu tài khoản, nhưng chưa gửi được email”. Dùng **Gửi lại email xác nhận** trên tài khoản đó, không nhập thêm. Mỗi lần gửi lại cần mật khẩu hiện tại, cách lần trước ít nhất một phút; liên kết mới có hạn 30 phút và thay thế liên kết cũ.

Khi chạy API trực tiếp trên máy với `SMTP_HOST=localhost`, Mailpit trong `compose.dev.yaml` xuất cổng SMTP `127.0.0.1:1025` và hộp thư `http://localhost:8025`. Có thể khởi động riêng mail bằng `docker compose --env-file .env.docker -f compose.yaml -f compose.dev.yaml up -d --no-deps mailpit`. Thư local chỉ xuất hiện trong Mailpit, không tới Gmail. Deployment thật phải cấu hình SMTP gửi thư thật.

| Tình huống | Xử lý |
|---|---|
| Dừng bán mới | Tắt **pricing policy enabled**, giữ DEALER_ENABLED=true để xử lý đơn/tiền/hậu mãi/callback cũ |
| Vi phạm kinh doanh | BUSINESS_SUSPENDED giữ truy cập đơn cũ |
| Lộ khóa/tài khoản | SECURITY_LOCKED thu hồi session/key, suppress webhook; staff tiếp quản. Unlock không khôi phục key cũ |
| Proof giả/giữ máy | Xem metrics, giảm maximumUnfundedOrders hoặc BLOCKED; ADMIN force-cancel có reason/audit, vẫn xử lý tiền muộn |
| Receipt nhập sai | Không sửa/xóa. Reverse allocation nếu được phép rồi append correction; đã có side effect mở case/hold, đối chiếu resolve/release |
| Refund UNKNOWN | Giữ quota, lấy xác nhận ngân hàng; không auto-resend |
| Worker crash | Restart; lease hết hạn được tiếp quản. Consumer dedupe eventId và kiểm version |
| Webhook FAILED | Kiểm HTTPS/domain/DNS/firewall, test/replay từ portal; đơn không rollback theo lỗi callback |

Không xóa ledger để rollback khi đã có giao dịch. Dừng đơn mới bằng policy, backup và sửa forward. DEALER_ENABLED=false tắt toàn bộ chức năng: chỉ dùng trước rollout hoặc bảo trì có staff tiếp quản, không phải công tắc dừng bán thông thường.

## Xác minh

`pnpm test:dealer:upgrade` cần TEST_DATABASE_URL và quyền CREATEDB; tạo/dọn database tạm riêng, chạy 13 migration baseline, chèn đơn/Payment cũ, áp bảy migration đại lý và kiểm dữ liệu/constraints. `pnpm test:integration`, `pnpm test:e2e`, API/web unit, browser và build kiểm tra phần còn lại. Bằng chứng ở [bàn giao](../planning/2026-10-09-dealer-channel.md).
