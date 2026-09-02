# FE-09 WP-04 — Auth và account hardening

> Trạng thái: **PASS**<br>
> Phạm vi commit: `e618bd7` → `7551933`<br>
> Ngày kiểm tra trình duyệt: 02/09/2026

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Làm mới phiên | `e618bd7` | Các lượt refresh được xếp hàng theo phiên; phản hồi của phiên cũ không thể ghi đè hoặc phát sinh request xác thực cho phiên mới |
| Form xác thực và token một lần | `dfc64e1` | Khóa gửi lặp, khóa trường khi đang chờ, thêm nút hiện/ẩn mật khẩu, xóa lỗi theo trường và đưa token đã bị API từ chối về trạng thái kết thúc |
| Cô lập dữ liệu tài khoản | `b32c738` | Hồ sơ, địa chỉ và bảo mật gắn với đúng chủ phiên; phản hồi chậm của khách A không thể hiện hoặc sửa dữ liệu của khách B |
| Điều hướng bằng bàn phím | `76fec3b` | Dùng câu “Chuyển đến nội dung chính” tự nhiên và giữ liên kết bỏ qua đúng semantic |
| Browser contract | `5eaded0` | Mở rộng registry và browser suite cho token, đăng ký, nhân viên, hồ sơ, địa chỉ, đăng xuất, bảo mật, lỗi mạng và privacy |
| Responsive 320 px | `11af652` | Bỏ giới hạn chiều rộng gốc gây thanh cuộn ngang khi trang dài có scrollbar; thêm regression cho `/account/security` tại 320 px |
| Visual helper | `7551933` | Giữ hành vi chụp ảnh ổn định nhưng tuân thủ lint bắt buộc |
| Quyền riêng tư đăng ký WP-14 | `266e2ce`, `fdc4242`, `890622c` | Email mới và email đã tồn tại cùng trả HTTP `201`, nội dung chung và không phát tín hiệu `DUPLICATE_RESOURCE`; OpenAPI/client được đồng bộ |

## Browser và visual evidence

Tám route FE-2 được kiểm tra với API và PostgreSQL test thật:

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/accept-invitation`
- `/account`
- `/account/addresses`
- `/account/security`

Kiểm tra trực tiếp trong trình duyệt dùng viewport 1440×900, 390×844 và 320×844.
Trang hồ sơ, sổ địa chỉ và bảo mật giữ cùng customer shell; form, card, nút hiện mật
khẩu và empty state không bị cắt hoặc lệch. Ở lần kiểm tra 320 px, browser phát hiện
thanh cuộn ngang 15 px do `html` có chiều rộng tối thiểu 20 rem trong môi trường
scrollbar không phủ lên nội dung. Concern này được sửa riêng và đo lại:
`scrollWidth === clientWidth === 320`.

Hai visual baseline đã review và được theo dõi tại:

- `tests/browser/auth-account.spec.ts-snapshots/fe2-login-error-mobile-390-chromium-win32.png`
- `tests/browser/auth-account.spec.ts-snapshots/fe2-account-profile-success-desktop-chromium-win32.png`

Ảnh đầu tiên chưa được chấp nhận vì liên kết bỏ qua che logo và ảnh hồ sơ được chụp
khi trang đang cuộn, làm header/sidebar bị cắt. Sau khi sửa copy, ổn định vị trí cuộn
và ẩn riêng skip link trong visual capture, hai ảnh được tạo lại, review và chạy
không-update `2/2`.

## State, session và privacy evidence

- Submit xác thực dùng khóa đồng bộ nên hai thao tác trong cùng frame chỉ phát một
  mutation; trường nhập và nút đều thể hiện pending rõ ràng.
- Token reset/invitation thiếu, sai định dạng, hết hạn hoặc đã dùng chuyển sang trạng
  thái kết thúc; nhấn Enter hoặc submit lại không phát mutation lần hai.
- Token fragment bị xóa trước khi form xuất hiện và không còn trong query, URL,
  browser storage, HTML hoặc request xác thực sau reset.
- Đăng ký trùng và quên mật khẩu dùng nội dung chung, không xác nhận email có tồn tại
  trong giao diện.
- Hồ sơ/địa chỉ/bảo mật chỉ nhận completion thuộc đúng account hiện tại; logout hoặc
  đổi phiên xóa state chủ cũ trước khi render dữ liệu mới.
- Lỗi tải hồ sơ/địa chỉ phục hồi ngay tại vùng lỗi, không biến toàn shell thành
  skeleton. Create/edit/default/archive địa chỉ giữ navigation count và list hợp lệ.
- Nhân viên vào sổ địa chỉ nhận permission state trước khi request địa chỉ được gửi.
- Lỗi mạng khi đăng xuất giữ context, hiện cảnh báo có độ tương phản đạt chuẩn và cho
  thử lại; không tự phát lại mutation.

Remediation WP-14 đã đóng `FE9-R13`: endpoint đăng ký trả cùng HTTP `201` và response
chung cho email mới lẫn email đã tồn tại. Browser kiểm response không chứa
`DUPLICATE_RESOURCE`, UI giữ nội dung “Đã tiếp nhận yêu cầu” trong cả hai trường hợp;
OpenAPI/generated client không còn quảng bá nhánh duplicate riêng cho operation này.

## Test evidence

| Gate | Kết quả |
| --- | --- |
| Full web unit | PASS — 126 file, 602/602 test |
| Auth/account browser cuối | PASS — 9/9, Chromium, 1 worker, 1,2 phút |
| Auth/account browser lượt xác nhận trước đó | PASS — 9/9 |
| Visual determinism | PASS — 2/2 snapshot, không update |
| Executable coverage | PASS — 9/9 |
| Shared accessibility | PASS — 4 file, 21/21 test |
| Responsive browser | PASS — 320, 390 và 1440 px; zero document overflow sau remediation |
| Web typecheck | PASS |
| Root lint | PASS — zero warning |
| Production web build | PASS — Next sinh đủ 56 route |
| `git diff --check` | PASS |

Lịch sử lỗi không bị xóa khỏi evidence: review độc lập tìm thấy ba P1 về response
sai chủ phiên, skeleton vĩnh viễn và reset flash; browser review tìm thấy skip-link,
ảnh chụp sai vị trí, warning-link contrast và tràn ngang 320 px. Các concern được
sửa riêng, có regression test và được chạy lại trước khi đóng WP-04. Lint cuối cũng
bắt một arrow function trả về `void` trong visual helper; commit `7551933` sửa cú
pháp mà không đổi hành vi.

## Acceptance mapping

- Tám route FE-2 có browser owner thật và coverage cho success, loading, error,
  warning, permission, pending và terminal state phù hợp.
- Form dùng lỗi theo trường cùng summary có focus; người dùng sửa trường nào thì lỗi
  liên quan được gỡ ở trường đó.
- Critical auth/account flow dùng bàn phím, focus được trả đúng và không có axe
  serious/critical violation trong state đại diện.
- Customer shell và form account ổn định từ 320 đến 1440 px; không lộ dữ liệu phiên
  cũ trong lúc refresh hoặc đổi tài khoản.
- Không thay đổi backend capability, OpenAPI hoặc business state trong WP-04.

WP-04 đạt acceptance và có thể chuyển sang WP-05 commerce hardening.
