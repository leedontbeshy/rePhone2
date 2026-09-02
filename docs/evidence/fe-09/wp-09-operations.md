# FE-09 WP-09 — Hoàn thiện không gian vận hành

> Trạng thái: **PASS — còn giới hạn nền tảng FE9-R16**<br>
> Routes: `/backoffice/orders`, `/backoffice/orders/[id]`,
> `/backoffice/payments`, `/backoffice/payments/[id]`, `/backoffice/refunds`,
> `/backoffice/refunds/[id]`, `/backoffice/after-sales`,
> `/backoffice/after-sales/[id]`, `/backoffice/warranties`,
> `/backoffice/warranties/[id]`, `/backoffice/warranty-policies`<br>
> Phạm vi commit: `2caa6da` → `b10a0d4`<br>
> Cây code và browser cuối: `b10a0d495654fd1c47ededd65c8251cfa79acb75`<br>
> Ngày kiểm tra: 02/09/2026<br>
> Rủi ro còn mở: `FE9-R16`

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Mở minh chứng an toàn | `2caa6da` | URL ký được lấy mới theo từng lần bấm, có trạng thái hết hạn/không khả dụng và không cache URL tạm thời |
| Khóa thao tác tài chính | `91aa642`, `6fe1c11` | Duyệt thanh toán và hoàn tiền không gửi lặp trong cùng lượt thao tác; luôn tải lại projection chính thức |
| Làm mới cục bộ hàng đợi | `5ffbf04`, `f598b5d`, `15fa16e` | Giữ danh sách đã tải, loại response cũ và chỉ hiển thị loading ở vùng đang đổi |
| Scroll và focus | `f391e91`, `5a889d2` | Lỗi đọc không kéo người dùng khỏi vị trí hiện tại; filter được trả focus bằng `preventScroll` |
| Tương phản và phân cấp | `aa934db`, `9dc0459` | Status và điểm nhấn vận hành đạt lại ngưỡng tương phản, không chỉ truyền trạng thái bằng màu |
| Thanh toán và hoàn tiền | `680dfa2`, `a904f5a`, `0562d27` | Phủ duyệt/từ chối, conflict, minh chứng nguy hiểm/không khả dụng và các phương thức hoàn tiền |
| Bảo hành và hỗ trợ sau mua | `db09f9f`, `184c3eb` | Phủ quyền EMPLOYEE/ADMIN, vòng đời chính sách và đủ năm cách xử lý hỗ trợ |
| Đơn hàng và route matrix | `1c9a8f3` | Phủ nhận tại cửa hàng, giao thành công, giao thất bại/hoàn hàng và đủ 11 route |
| Chi tiết liên hệ | `91f2870` | Email phổ biến nằm trọn một dòng ở desktop và xuống dòng an toàn ở mobile |
| Dữ liệu ảnh kiểm tra | `b10a0d4` | Chi tiết đơn dùng sản phẩm thực tế thay cho khung sản phẩm rỗng trong bằng chứng visual |
| Idempotency hoàn tiền WP-14 | `e8aefbe`, `26bfa48`, `890622c` | API lưu UUID idempotency key cùng request fingerprint; retry cùng intent hội tụ về một kết quả, payload khác bị từ chối; client tái sử dụng key khi lỗi mạng mơ hồ |

## Hàng đợi, trạng thái tải và điều hướng

- Hàng đợi đơn hàng, thanh toán, hoàn tiền, hỗ trợ sau mua và bảo hành giữ lại
  snapshot hợp lệ khi làm mới. Loading chỉ xuất hiện tại danh sách hoặc chi tiết
  đang thay đổi, không làm trắng shell hay toàn bộ khung trang.
- Mỗi request có owner/sequence. Response cũ hoặc request đã hủy không được ghi đè
  query mới. Khi tổng số trang giảm, trang hiện tại tự clamp về phạm vi hợp lệ.
- Chọn một bản ghi chỉ tải phần chi tiết. Lỗi chi tiết không xóa danh sách đã tải;
  lỗi đọc collection không tự cuộn về đầu trang.
- Sau khi áp dụng filter hoặc phục hồi lỗi, focus quay về control phù hợp bằng
  `preventScroll`, vì vậy người dùng không phải kéo lại danh sách.
- Chi tiết đơn khóa hình học các trường liên hệ; email phổ biến không bị tách một ký
  tự xuống dòng ở desktop. Mobile vẫn được phép xuống dòng để không gây tràn ngang.

## Đơn hàng và giao nhận

- Luồng nhận tại cửa hàng bao gồm xác nhận đơn, bắt đầu chuẩn bị, gia hạn giữ hàng,
  sẵn sàng nhận và hoàn tất giao tại cửa hàng.
- Luồng giao tận nơi bao gồm xác nhận, chuẩn bị, tạo giao hàng, lấy hàng và giao
  thành công. Nhánh thất bại ghi nhận lần giao lỗi, cập nhật lịch giao và hoàn hàng.
- Conflict `409` không được coi là thành công. UI tải lại projection chính thức và
  chỉ hiển thị những thao tác còn được backend cho phép.
- Nút đang gửi bị khóa ngay trong cùng frame để tránh double-submit; terminal state
  không phát command lần hai.

## Thanh toán và hoàn tiền

- Thanh toán hỗ trợ duyệt và từ chối có lý do; sau success hoặc conflict đều tải lại
  trạng thái chính thức thay vì tự suy diễn enum tại client.
- Minh chứng thanh toán không mở trực tiếp storage path. Mỗi lần người dùng bấm xem,
  frontend yêu cầu một URL ký mới. Hết hạn, tệp nguy hiểm hoặc provider unavailable
  có nội dung riêng và không bị gộp thành lỗi “Kiểm tra lại thông tin”.
- Hoàn tiền kiểm tra luồng tiền mặt, chuyển khoản ngân hàng và xuất PDF. Double-click
  chỉ tạo một command trong lượt thao tác đang diễn ra.
- Pending lock vẫn chặn double-submit trong cùng frame. Với thao tác tạo hoàn tiền,
  WP-14 bổ sung UUID idempotency key và request fingerprint ở backend; client giữ
  nguyên key theo intent khi retry sau lỗi mạng mơ hồ. Replay tuần tự hoặc đồng thời
  trả cùng kết quả; dùng cùng key cho payload khác bị từ chối. `FE9-R15` đã đóng đúng
  phạm vi critical mutation này, không được diễn giải thành mọi mutation FE-7 đều có
  idempotency contract.

## Hỗ trợ sau mua và bảo hành

- Hỗ trợ sau mua phủ phân công, tiếp nhận, kiểm tra, duyệt và từ chối; UI kiểm tra đủ
  năm resolution hiện có thay vì chỉ một đường thành công.
- Minh chứng hỗ trợ dùng signed URL mới theo từng lần bấm; provider failure không
  làm mất hồ sơ đang xem.
- EMPLOYEE được xử lý nghiệp vụ bảo hành nhưng không thấy thao tác hủy bảo hành dành
  cho ADMIN. Negative role assertion kiểm tra cả control và request phát ra.
- Chính sách bảo hành phủ tạo, sửa, kích hoạt, ngừng áp dụng, lưu trữ và conflict.
  Terminal/archived policy không hiện action không còn hợp lệ.

## Phạm vi chứng minh của browser và API

Bốn spec browser dùng `page.route` để trả fixture xác định cho UI. Vì vậy hai lượt
Playwright chứng minh đúng giao diện, request path/body, trạng thái loading, focus,
scroll, role presentation, conflict presentation, responsive và accessibility;
chúng **không phải** bằng chứng rằng database hoặc side effect backend thật đã chạy.

Backend được kiểm riêng bằng 16 file unit/service với 106/106 test và năm file E2E
với 42/42 test. Lớp này chứng minh policy, authorization, transition và side effect
ở API. Các cảnh báo deprecation `pg client.query()` xuất hiện trong E2E nhưng không
làm test thất bại; cần xử lý riêng nếu thư viện nâng cấp biến cảnh báo thành lỗi.

## Responsive, accessibility và visual evidence

Route matrix mở đủ 11 route ở `1440×900` và `360×844`, kiểm tra một shell
backoffice, một landmark `main` và `scrollWidth <= clientWidth`. Axe chạy trên từng
route/viewport với ngưỡng zero serious/critical.

Lượt cuối có `FE09_CAPTURE_SCREENSHOTS=1` tạo 22 ảnh current-run trong
`.local/fe09/wp09-audit/`. Tất cả 22 ảnh đã được review trực quan sau remediation;
chi tiết đơn dùng sản phẩm thực tế và email đã được đo không tràn. Ảnh chụp chỉ là
bằng chứng visual; Axe và assertion về focus/overflow/accessible name mới là phần
bằng chứng tự động cho accessibility.

Ô `datetime-local` native trên Windows Chromium vẫn hiển thị chuỗi trống theo thiết
lập vùng của hệ điều hành. `lang`, browser locale/timezone và `placeholder` không
kiểm soát được chuỗi này. Label, giá trị và validation vẫn đúng, nhưng việc Việt hóa
ổn định cần shared accessible field hoặc quyết định chấp nhận tại `FE9-R16`.

## Test evidence

| Gate | Kết quả tại tree cuối |
| --- | --- |
| Full web unit/component | PASS — 137 file, 663/663 test |
| Browser ownership + queue model | PASS — 2 file, 10/10 test |
| Web typecheck | PASS |
| Web lint | PASS, zero warning |
| API unit/service operations | PASS — 16 file, 106/106 test |
| API E2E operations | PASS — 5 file, 42/42 test |
| API typecheck và lint | PASS |
| Browser operations cuối, lượt A có capture | PASS — 11/11, Chromium, khoảng 2,1 phút |
| Browser operations cuối, lượt B | PASS — 11/11, Chromium, khoảng 2,1 phút |
| Responsive matrix | PASS — 11 route × 1440/360 px, không overflow |
| Axe | PASS — zero serious/critical |
| Visual review | PASS — 22/22 ảnh current-run đã kiểm tra |

## Acceptance mapping

| Acceptance WP-09 | Đánh giá |
| --- | --- |
| FE-7 operation owner không còn trỏ tới suite giả | **PASS** — `operations-lifecycle` có 11 flow đăng ký qua bốn spec và coverage contract xanh |
| Critical mutation có pending lock, success/refetch và conflict/replay test | **PASS** — chặn double-submit, refetch projection và xử lý 409 đã được khóa; tạo hoàn tiền có idempotency persistence/replay riêng tại WP-14 |
| Tất cả 11 route có desktop/mobile/axe representative evidence | **PASS** — đủ 11 route ở hai viewport, zero serious/critical, không overflow và 22 ảnh đã review |

WP-09 không còn lỗi triển khai đã biết trong phạm vi contract hiện tại. `FE9-R15` đã
đóng bằng schema/service/API E2E và client retry regression ở WP-14; `FE9-R13` và
`FE9-R14` cũng được đóng bởi remediation độc lập của auth và checkout. `FE9-R16` về
hiển thị native date/time theo regional locale vẫn là giới hạn mức thấp cần Product
chấp nhận hoặc thay bằng shared field trước khi FE-09 chuyển `DONE`. Chi tiết tại
[WP-14 release closeout](./wp-14-release-closeout.md).
