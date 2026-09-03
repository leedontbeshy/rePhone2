# FE-09 WP-06 — Customer post-purchase hardening

> Trạng thái: **PASS**<br>
> Routes: `/orders`, `/orders/[orderNumber]`, `/warranties`,
> `/warranties/[warrantyCode]`, `/after-sales`, `/after-sales/new`,
> `/after-sales/[requestNumber]`<br>
> Phạm vi commit: `0c5c073` → `0de508c`<br>
> Cây sản phẩm và kiểm thử cuối: `0de508c12ac9f8af37e3f47a345bbdaffd06c6fe`<br>
> Ngày kiểm tra trình duyệt: 02/09/2026

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Collection loading | `0c5c073` | Đổi filter/phân trang giữ collection đã tải, chỉ đánh dấu vùng kết quả đang bận; URL vượt trang hợp lệ tự trở về trang cuối và không kéo document lên đầu |
| Order detail loading và mutation | `e59e610` | Refresh giữ detail hiện tại; hủy đơn/minh chứng thanh toán có khóa đồng bộ, pending đúng vùng và response cũ không xóa trạng thái thao tác mới |
| Guest storage fail-closed | `580d926` | `sessionStorage` bị chặn không làm vỡ trang hoặc gửi credential sai; đọc/ghi/xóa token đều có đường thất bại an toàn |
| Warranty detail safety | `ce0bbf6` | Không giải mã route hai lần, không xóa token đơn hợp lệ khi riêng bảo hành trả `404`, refresh giữ detail và page quá lớn về trạng thái an toàn |
| After-sales retry ownership | `fcf9ee0` | Retry gắn đúng read/attachment; lỗi upload hoặc hủy không gọi lại attachment cũ; signed URL phải còn hạn và thuộc giao thức an toàn |
| After-sales creation | `1374550` | Form báo lỗi theo trường và đưa focus đúng chỗ; chống gửi lặp; có retry; picker chỉ tải một trang đơn hoàn tất và phân trang cục bộ |
| Guest credential privacy | `2d11cce` | Lookup warranty/after-sales con thất bại không hủy credential của đơn; API E2E bổ sung owner, non-owner, guest, anonymous và staff |
| Status accessibility | `6e40241` | Chữ trạng thái tích cực dùng token đậm hơn; tương phản tăng từ `4,08:1` lên `5,93:1`, đạt WCAG AA |
| Browser contract | `0de508c` | Mở rộng luồng hủy đơn, privacy guest, warranty Axe, eligibility hỗ trợ, validation/focus, double-submit, retry tệp và ma trận 390 px |

## Ownership, privacy và eligibility

- Danh sách bảo hành chỉ trả hồ sơ thuộc khách đang đăng nhập. Detail của khách khác,
  anonymous không credential và guest token giả đều trả safe not-found, không phân
  biệt hồ sơ tồn tại hay không.
- EMPLOYEE không thể dùng customer warranty detail; phản hồi là `403 FORBIDDEN` và
  không trả projection riêng tư.
- Guest có cookie giỏ đã chuyển đổi đọc được bảo hành/after-sales của đúng đơn. Khi
  header guest token giả được gửi, credential đó có độ ưu tiên cao hơn cookie và bị
  từ chối fail-closed.
- Token guest không nằm trong URL/hash. `sessionStorage` bị chặn không làm component
  crash và không biến thành quyền truy cập rộng hơn.
- Warranty hoặc after-sales subresource trả `404` không xóa token đơn đang hợp lệ;
  khách vẫn có thể quay lại detail đơn.
- Tạo hỗ trợ chỉ nhận order item từ đơn `COMPLETED`. Direct URL của đơn `CANCELLED`
  hoặc `CONFIRMED` không hiện form và không gửi mutation; picker cũng không liệt kê
  hai trạng thái này.
- Projection browser/API không chứa `customerId`, guest token hash, source cart,
  internal note hoặc trường lưu trữ attachment riêng tư.

## Loading, action và recovery

- Orders, warranties và after-sales giữ snapshot đã tải khi đổi filter/page; shell,
  filter, scroll và nội dung cũ không biến thành skeleton toàn khung.
- Detail order/warranty/after-sales chỉ dùng full skeleton trước lần tải đầu. Refresh
  hoặc mutation refetch giữ hierarchy, timeline và thông tin đang đọc.
- Cancel order, payment proof và create after-sales dùng synchronous operation lock;
  hai submit trong cùng frame chỉ phát một request.
- Sau lỗi mở attachment, một lỗi upload mới không còn dùng nút retry để mở lại tệp
  cũ. Upload/cancel giữ control gốc để người dùng thử đúng hành động.
- Signed URL bị từ chối nếu hết hạn, sắp hết hạn, dùng giao thức không an toàn hoặc
  không phải HTTPS/localhost. Lỗi nhà cung cấp và giới hạn năm tệp dùng thông báo cụ
  thể, không bị quy thành “Thông tin chưa hợp lệ”.
- Form tạo hỗ trợ nối lỗi tới textarea bằng `aria-invalid`/`aria-describedby` và đưa
  focus về trường đầu tiên cần sửa. Lỗi tải đơn/direct item có hành động thử lại.

## Responsive và accessibility evidence

Browser matrix kiểm tra đủ bảy route ở viewport `390 px`:

| Surface | Trạng thái đã kiểm |
| --- | --- |
| Orders | Collection, detail, long content, hủy đơn |
| Warranties | Collection, detail, status pill, safe not-found |
| After-sales | Collection, create, detail, attachment/provider error |

Mỗi route đại diện đo `scrollWidth <= clientWidth`, chỉ có một landmark `main` và
chạy Axe WCAG A/AA với ngưỡng zero serious/critical. Status pill “Còn hiệu lực” từng
bị Axe bắt ở `4,08:1`; token chữ được sửa rồi cả desktop và mobile đều xanh.

## Test evidence

| Gate | Kết quả tại tree cuối |
| --- | --- |
| Full web unit/component | PASS — 127 file, 614/614 test |
| API unit | PASS — 117 file, 683/683 test |
| Targeted post-purchase web | PASS — 7 file, 44/44 test |
| After-sales/warranty API E2E | PASS — 1 file, 6/6 test |
| Browser post-purchase lượt cuối 1 | PASS — 5/5, Chromium, 1 worker, 57,7 giây |
| Browser post-purchase lượt cuối 2 | PASS — 5/5, Chromium, 1 worker, 56,2 giây |
| Web lint và typecheck | PASS — zero warning |
| API lint và typecheck | PASS — zero warning |
| `git diff --check` | PASS |

Lịch sử lỗi không bị xóa: browser đầu tiên không vào test vì Docker Desktop bị kẹt
ở Windows runtime socket. Sau khi khôi phục runtime và tắt Docker AI cục bộ, lượt
thực thi đầu đạt `1/5`: test lộ locator collection chưa đúng, status success thiếu
tương phản và picker đọc option trước khi tải xong. Lượt tiếp theo đạt `3/5`; hai
failure còn lại là strict locator và cùng race chờ option. Sau remediation, hai lượt
đầy đủ liên tiếp đều đạt `5/5` không retry.

## Acceptance mapping

| Acceptance WP-06 | Đánh giá |
| --- | --- |
| Customer/guest ownership negative test không lộ hồ sơ | **PASS** — API E2E và browser phủ owner, non-owner, anonymous, staff, valid/forged guest credential |
| Order/warranty/after-sales collection và detail hoạt động ở 390 px | **PASS** — đủ bảy route, không overflow, Axe zero serious/critical |
| Error/provider failure copy cụ thể, không báo validation chung sai nguyên nhân | **PASS** — storage, expired URL, attachment limit, field validation và permission có copy/interaction riêng |

WP-06 không còn blocker trong phạm vi. Tại thời điểm đóng WP-06, `FE9-R14` của
checkout vẫn mở độc lập và không được coi là đã giải quyết bởi post-purchase;
remediation riêng của WP-14 sau đó đã đóng risk này.
