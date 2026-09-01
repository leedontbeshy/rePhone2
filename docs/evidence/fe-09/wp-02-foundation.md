# FE-09 WP-02 — Foundation và shared UX consistency

> Trạng thái: **PASS**<br>
> Phạm vi commit: `3ededca` → `eb9820e`<br>
> Ngày kiểm tra trình duyệt: 01/09/2026

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Hình học filter/form | `3ededca` | Help/error có vùng riêng, không kéo lệch control cùng hàng |
| Phân trang | `ca40721` | Sau mua, bảo hành và chính sách dùng `nav` có tên truy cập |
| Chọn tệp | `5f106fa` | Primitive dùng chung có tên tệp, lỗi, trợ giúp, disabled và focus-visible; không còn lộ UI mặc định tại hồ sơ máy/hỗ trợ sau mua |
| Cuộn sidebar | `2988831` | Backoffice shell là owner duy nhất của cuộn active item; không gọi `scrollIntoView` từ shell con |
| Loading nhập máy | `0efa2ab` | Có skeleton lần tải đầu, loading cục bộ khi đổi dòng máy, resume không chớp bước một và scroll lỗi tôn trọng reduced motion |
| Focus token | `d825522` | Loại token màu không tồn tại; contract quét toàn bộ CSS và fail khi có tham chiếu màu global chưa định nghĩa |
| Dialog storefront/shared | `3988fe5` | Native modal giữ trigger và trả focus bằng `preventScroll` |
| Dialog backoffice | `1cd1357` | Payment, refund, tồn phụ kiện, chuyển máy và dialog danh mục cùng dùng lifecycle chung |
| Dialog Strict Mode | `aa88f09` | Effect replay không xóa điểm trả focus của dialog render có điều kiện |
| Intake stale data | `143ed82` | Không thể chọn hoặc gửi cấu hình của dòng máy cũ khi request dòng mới lỗi |
| Forced colors | `3223086` | Upload control và legacy card luôn có focus ring nhìn thấy |
| Primitive coverage | `862d615` | Select, Textarea và Checkbox có contract label/help/error thực thi |
| Lỗi tệp động | `12c2eb3` | Lỗi upload sau mua được thông báo bằng live alert và vẫn nối với control |
| Forced-colors browser smoke | `eb9820e` | Shared và legacy picker có đúng một focus ring trong Chromium forced-colors |

## Browser và visual evidence

Kiểm tra trực tiếp trên API/database seed kiểm thử và Next dev hiện hành, không dùng
container web cũ đang phục vụ tại cổng 3000. Viewport đại diện là 1440×900 và
390×844.

- Hồ sơ máy desktop trước khi sửa còn hiển thị nút hệ thống tiếng Anh:
  [before — file input mặc định](../../assets/ui/fe-09/wp02-unit-upload-before-1440.png).
- Hồ sơ máy desktop sau khi sửa dùng nút “Chọn ảnh”, tên trạng thái bằng tiếng
  Việt và hàng control giữ đúng geometry:
  [after — desktop 1440](../../assets/ui/fe-09/wp02-unit-upload-after-1440.png).
- Cùng picker tại 390 px không tạo document overflow:
  [after — mobile 390](../../assets/ui/fe-09/wp02-unit-upload-after-390.png).
- Trang nhập máy sau khi tải xong giữ shell, progress và form hai cột ổn định:
  [intake — desktop 1440](../../assets/ui/fe-09/wp02-intake-loaded-1440.png).

Manual browser smoke tại `/backoffice/inventory/stock` xác nhận đóng dialog bằng
nút Hủy làm dialog biến mất, focus quay về đúng nút “Nhận hàng” và `scrollY` giữ
nguyên. Escape/focus restoration được kiểm tra thêm bằng Playwright để dùng sự kiện
bàn phím thật.

## Test evidence

| Gate | Kết quả |
| --- | --- |
| FilePicker focused unit | PASS — 9/9 |
| Form/pagination focused unit | PASS — 24/24 |
| Sidebar/intake focused unit | PASS — 30/30 |
| Dialog focused unit | PASS — 21/21 |
| Inventory intake/responsive browser | PASS — 2/2 |
| Dialog inventory stock/transfer browser | PASS — 2/2 |
| Storefront mobile axe + dialog focus browser | PASS — 1/1 |
| Full web unit | PASS — 124 file, 588/588 test |
| Shared accessibility | PASS — 4 file, 21/21 test |
| Web typecheck | PASS |
| Full lint | PASS — không warning |
| Full format check | PASS |
| Full Chromium browser regression | PASS — 48/48, 1 worker, 3 phút 36 giây |

## Acceptance mapping

- Shared interaction primitives có contract cho file picker, focus token, dialog,
  pagination, reduced motion và shell scroll ownership.
- Mỗi thay đổi được tách theo concern và có consumer test tương ứng.
- Raw screenshot/report vẫn ở `.local/`; chỉ ba ảnh picker và một ảnh intake đã
  review mới được theo dõi trong repo.
- Không thay API, state machine, quyền hoặc dữ liệu nghiệp vụ.
- Hai lượt review độc lập kết thúc với zero P0/P1/P2 sau remediation; lần review
  đầu đã phát hiện và buộc sửa stale variant, Strict Mode focus, forced-colors và
  live validation trước khi cho phép đóng work package.

WP-02 đạt acceptance. Checkout voucher-row geometry, page-count announcement và
legacy token cleanup tiếp tục được xử lý theo owner WP-05/WP-13 thay vì mở rộng
shared refactor tại WP-02.
