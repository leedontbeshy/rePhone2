# FE-09 WP-05 — Commerce hardening

> Trạng thái: **PASS — FE9-R14 đã đóng tại WP-14**<br>
> Routes: `/cart`, `/wishlist`, `/checkout`<br>
> Phạm vi commit: `5206793` → `727193d`<br>
> Cây sản phẩm và kiểm thử cuối: `727193d034126cff3886eebe8c781f8ec337a1c8`<br>
> Ngày kiểm tra trình duyệt: 02/09/2026

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Cô lập giỏ hàng theo phiên | `2f9270a`, `2ddc169` | Công việc đang chờ của phiên cũ không thể chạy dưới tài khoản mới; merge chỉ bắt đầu sau khi thao tác guest đang chạy kết thúc |
| Layout checkout và vị trí đầu trang | `d60955d`, `3ea3805`, `cbbb46c` | Ảnh dự phòng nằm gọn trong ô tóm tắt; vào checkout trở về đầu trang và tiêu đề không bị header che |
| Thông tin liên hệ bắt buộc | `7cd5f6c` | API từ chối `contact` thiếu hoặc `null`; form luôn gửi đủ tên, email và số điện thoại đã xác thực |
| Wishlist không làm giảm số lượng giỏ | `e6608e9` | Thêm phụ kiện đã có trong wishlist vào giỏ giữ nguyên hoặc tăng số lượng, không đưa số lượng đang có về `1` |
| Phản hồi checkout đúng phiên | `7d22fc1` | Preview hoặc create trả về sau khi trang đóng/đổi phiên bị bỏ qua |
| Khóa mutation gửi lặp | `c24647a` | Hai thao tác trong cùng frame chỉ phát một mutation cho cart, wishlist và checkout |
| Phục hồi create không chắc chắn | `e8fbf0a` | Không tự tạo lại đơn; chỉ replay cùng yêu cầu sau khi khách chọn “Kiểm tra trạng thái đơn hàng” |
| Local loading | `397ebb5`, `c30548a` | Refresh giỏ giữ hàng và tóm tắt đã tải, chỉ vùng đang cập nhật thể hiện trạng thái chờ |
| Wishlist mobile | `85852b4` | Card ngắn hơn ở 320–390 px, nút mua và xóa xuất hiện sớm, không chạm footer |
| Hiệu năng production | `bfa2e03`, `2d3e5dd` | Có profile production ba lượt cho cart/checkout cùng budget cố định |
| Transaction retry | `0c076c5` | Warning của lần transaction bị rollback không rò sang kết quả retry đã commit |
| State/role browser | `e6dbcd8`, `64e5cfb` | Anonymous và staff không đọc wishlist; customer có đủ empty/loading/error/success và tên hành động phụ kiện rõ nghĩa |
| Checkout authority/recovery | `81743bb` | Form focus lỗi đầu tiên, summary theo preview server, conflict xóa authority cũ và lost response chỉ phục hồi thủ công |
| Responsive, accessibility và visual | `c07c1c4`, `c5d9432`, `12a21c1`, `36c7b59` | 20 ảnh ở năm viewport; không tràn ngang, không có axe serious/critical; màu chữ nhỏ đạt tương phản |
| Tạo đơn full-stack | `bb1d26e` | Guest shipping và customer pickup dùng API/DB thật đến trang chi tiết đơn; không giả lập response tạo đơn |
| Ổn định visual identity | `9bac07e`, `727193d` | Visual matrix có budget riêng và tài khoản test riêng, không va giới hạn đăng nhập của các scenario trước |
| Contract gap ban đầu | `ab1e1c9` | Ghi nhận đúng `FE9-R14`; frontend không suy diễn projection khi API create chưa xác nhận toàn bộ preview |
| Full-preview fingerprint WP-14 | `88b1da9`, `d818e0a`, `890622c` | Backend tạo fingerprint bất biến cho toàn bộ business preview; create bắt buộc gửi fingerprint và trả `409` kèm preview mới khi projection lệch; OpenAPI/client được đồng bộ |

## Browser và visual evidence

`tests/browser/cart-checkout.spec.ts` đăng ký **13 scenario**. Hai scenario chính tạo
đơn xuyên suốt API và PostgreSQL test thật:

- Guest thêm `IP15PM-256-001`, chọn giao tận nơi, preview, tạo đơn `201`, mở trang
  đơn và lưu credential một lần trong `sessionStorage`; token không xuất hiện trong
  URL/hash.
- Customer merge `IP13-MID-001`, lưu/xóa wishlist, chọn nhận tại cửa hàng, preview,
  tạo đơn `201` và xác minh hình thức nhận trên projection chi tiết.

Visual matrix có **20 snapshot**: bốn trạng thái nhân năm viewport `320`, `390`,
`768`, `1024` và `1440` px.

| Trạng thái | Kiểm tra |
| --- | --- |
| Cart có hàng | Card, số lượng, giá, xóa, summary và CTA |
| Wishlist có hàng | Media, trạng thái còn hàng, giá, thêm vào giỏ và xóa |
| Checkout preview | Fulfillment, form, voucher, pricing và CTA |
| Checkout conflict | Cảnh báo, xóa preview cũ và hành động kiểm tra lại |

Mỗi trạng thái đo `scrollWidth <= clientWidth` và chạy axe WCAG A/AA với ngưỡng
zero serious/critical. Ảnh mobile 320 và desktop 1440 của cả bốn trạng thái đã được
review thủ công sau lần tạo lại baseline. Lần review bắt được footer snapshot cũ
thiếu email/mạng xã hội và badge Next dev; helper chung hiện ẩn riêng dev portal,
giữ header ở vị trí ổn định và chụp đúng dữ liệu seed hiện hành.

## State, session và reliability evidence

- Cart queue gắn với owner phiên; guest mutation đang chạy được drain trước merge,
  còn hàng chờ của phiên cũ bị loại bỏ khi account đổi.
- Refresh cart giữ collection và summary đã tải; failure hiện retry tại chỗ thay vì
  biến toàn trang thành skeleton.
- Wishlist chặn anonymous/staff trước request, giữ dữ liệu customer cũ trong local
  refresh hợp lệ và không giảm quantity phụ kiện đã có trong cart.
- Checkout dùng khóa đồng bộ cho preview/create; double-click trong cùng frame không
  tạo side effect thứ hai.
- Preview/create response stale không thể ghi vào trang hoặc phiên mới.
- Conflict không yêu cầu review làm mất preview cũ, focus cảnh báo và buộc lấy
  projection mới. Conflict có projection mới yêu cầu khách xác nhận rõ trước khi
  submit lại.
- Khi response tạo đơn bị mất sau khi backend đã commit, UI không auto-retry. Khách
  phải chọn phục hồi; backend trả lại đúng đơn của cart đã chuyển đổi.
- API bắt buộc `contact`; validation thiếu dữ liệu trả `400` thay vì để lỗi muộn ở
  create flow.

## Performance evidence

Artifact raw: `.local/release-performance/storefront.json`  
SHA trong artifact: `727193d034126cff3886eebe8c781f8ec337a1c8`  
Profile: viewport `390×844`, CPU ×4, latency 40 ms, 10 Mbps download, ba lượt lấy
median, production build.

| Route | LCP | CLS | Tương tác | Điều hướng | Request | Dữ liệu | Bundle route |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/cart` | 1.664 ms | 0 | 58,13 ms | 655,4 ms | 21 | 232.736 B | 228.913 B |
| `/checkout` | 1.620 ms | 0 | 61,2 ms | 628,5 ms | 21 | 236.447 B | 233.658 B |

Cả hai đạt budget không nới: LCP `<= 2.500 ms`, CLS `<= 0,1`, interaction proxy
`<= 200 ms`. Báo cáo này là evidence theo surface WP-05; baseline/after toàn bộ
representative route vẫn thuộc WP-12.

## Test evidence

| Gate | Kết quả tại tree cuối |
| --- | --- |
| Full web unit | PASS — 127 file, 612/612 test |
| API unit | PASS — 117 file, 683/683 test |
| Commerce + checkout API E2E | PASS — 2 file, 18/18 test |
| Browser cart/wishlist/checkout lượt cuối 1 | PASS — 13/13, Chromium, 1 worker, 2,0 phút |
| Browser cart/wishlist/checkout lượt cuối 2 | PASS — 13/13, Chromium, 1 worker, 2,0 phút |
| Visual compare, không update | PASS — 20/20 snapshot trong browser matrix |
| Executable coverage | PASS — 162/162 operation, 56/56 route, 13/13 state |
| Shared accessibility | PASS — 4 file, 21/21 test |
| Production performance/build | PASS — 1/1; Next sinh 56 route, 43 trang tĩnh |
| Root format | PASS |
| Root lint | PASS — zero warning |
| Root typecheck | PASS — 4/4 task |
| `git diff --check` | PASS |

Lịch sử lỗi không bị xóa khỏi evidence. Lượt browser đầu tại `c5d9432` đạt 11/13:
test scroll đòi `<= 1 px` trong khi browser dừng ở `7 px`, và snapshot cũ không còn
khớp footer seed. Sau khi review và sửa test, flow tạo đơn thật tiếp tục lộ một máy
nằm ở kho không hợp lệ cho pickup và response body không còn đọc được sau navigation;
scenario được chuyển sang máy tại cửa hàng và xác minh projection sau điều hướng.
Full suite sau đó lộ tài khoản customer vượt giới hạn năm lần đăng nhập/phút ở visual
scenario; fixture commerce riêng đóng flake này. Hai lượt cuối đều xanh không retry.
`format:check` cũng từng bắt `auth-provider.tsx` lệch Prettier; commit `8121362` chỉ
chuẩn hóa định dạng rồi gate cuối xanh.

## Acceptance mapping và closeout

| Acceptance WP-05 | Đánh giá |
| --- | --- |
| Guest shipping và customer pickup end-to-end xanh | **PASS** — cả hai tạo đơn bằng API/DB thật và mở projection chi tiết |
| Merge/reconfirm/conflict không mất sản phẩm hoặc double submit | **PASS** — unit, API E2E và browser state/recovery đều xanh |
| Money, voucher và fulfillment option luôn từ server | **PASS** — create gắn với fingerprint của toàn bộ preview server và buộc review lại khi fingerprint đổi |

Preview trả đủ item, line price/discount, voucher, shipping fee, fulfillment và
pickup store. Remediation WP-14 băm projection nghiệp vụ ổn định, không phụ thuộc
`calculatedAt`; create nhận `expectedPreviewFingerprint`. Nếu giá, phân bổ, metadata,
voucher, fulfillment hoặc điểm nhận thay đổi, backend trả `409` cùng preview mới để
khách xác nhận lại, không commit projection khác với màn hình vừa duyệt.

`FE9-R14` được đóng bằng `88b1da9`, `d818e0a` và generated contract `890622c`.
Fixture downstream được đồng bộ tại `467bc48`, `cc2cb1d`; checkout E2E và toàn bộ
release gate chạy xanh trên release candidate `de82f60`. Chi tiết tổng hợp nằm tại
[WP-14 release closeout](./wp-14-release-closeout.md).
