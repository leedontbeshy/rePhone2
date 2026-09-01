# FE-09 WP-07 — Catalog và voucher administration hardening

> Trạng thái: **PASS**<br>
> Routes: `/backoffice/catalog/products`, `/backoffice/catalog/products/new`,
> `/backoffice/catalog/products/[id]`, `/backoffice/vouchers`,
> `/backoffice/vouchers/new`, `/backoffice/vouchers/[id]`<br>
> Phạm vi commit: `8112c3a` → `f72fd6e`<br>
> Cây code cuối: `f72fd6e`<br>
> Cây browser logic: `ef5708f4cc65ef82f741adf7dd1fa757273391e3`<br>
> Ngày kiểm tra trình duyệt: 02/09/2026

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Variant media | `8112c3a` | Hoàn thiện tải lên, sắp xếp, cập nhật và xóa hình ảnh theo đúng product/variant owner |
| Conflict recovery | `cc22d67` | Khi optimistic concurrency lệch, detail tải lại authoritative state và đóng/reset dialog cũ |
| Warranty options | `884ebbc` | Product form tải chính sách bảo hành có loading, lỗi riêng và retry |
| Empty media | `07dd099` | Khóa regression cho fallback khi product/variant chưa có hình |
| Catalog collection | `57b054a` | Snapshot gắn đúng query/owner; lỗi query mới không trình bày dữ liệu cũ như kết quả mới; page được clamp; pagination mới chuyển focus về board |
| Voucher inputs | `7b8e066` | Chuẩn hóa tiền, phần trăm và date/time; field lỗi giữ hình học và copy đúng nguyên nhân |
| Voucher mutation | `f98fa26` | Mutation refresh cô lập theo action, chống response cũ ghi đè và giữ detail khi cập nhật |
| Voucher pagination | `99d9798` | Trang vượt phạm vi tự trở về trang hợp lệ mà không flash empty state |
| Unsaved product changes | `9de968a` | Create/edit có dirty baseline, custom discard dialog, `beforeunload` và chặn link nội bộ khi chưa lưu |
| A11y remediation | `3d8d18c`, `781bf41`, `16457ba`, `d2e566a` | Sửa tương phản helper/selected option/header bảng và thêm nhãn cho mobile context link |
| Product browser contract | `3b2663f` | Khóa lifecycle product, media, responsive, Axe và conflict flow bằng dữ liệu/API thật |
| Voucher browser contract | `ef5708f` | Khóa lifecycle voucher, quyền employee, validation, responsive và accessibility |
| Format gate | `f72fd6e` | Chuẩn hóa năm tệp catalog; không đổi logic, targeted gate và typecheck được chạy lại sau format |

## Catalog behavior và recovery

- Search suggestion có loading, empty và provider-error riêng; lỗi gợi ý có retry,
  còn Enter vẫn submit từ khóa thay vì biến lỗi provider thành “không tìm thấy”.
- Sort mặc định theo năm ra mắt mới nhất. Filter, sort, status và pagination cập nhật
  collection cục bộ, không dựng lại toàn shell.
- Snapshot danh sách gắn với query và staff owner. Nếu query mới lỗi, UI nói rõ danh
  sách bên dưới là kết quả của bộ lọc trước; lỗi đếm status không che lỗi collection.
- Page vượt `totalPages` được replace về trang hợp lệ. Focus chỉ chuyển về board sau
  pagination thành công; search/filter giữ focus tại control đang dùng.
- Product detail tải authoritative state sau mutation. Conflict không giữ dialog/draft
  cũ; create/edit chỉ bỏ dirty state sau save hoặc authoritative refetch thành công.
- Product và variant media dùng đúng owner, có fallback khi rỗng và validation tệp
  trước khi upload. Catalog lookup không thêm N+1 contract mới.

## Voucher lifecycle, date/time và privacy

- Form create/edit giữ geometry thống nhất giữa text, money, phần trăm và date/time;
  lỗi validation nằm cạnh đúng trường và không làm đổi nghĩa dữ liệu.
- Collection/detail giữ snapshot hợp lệ trong refresh; stale response của action cũ
  không đóng dialog hoặc ghi đè kết quả mutation mới.
- Voucher page vượt phạm vi tự clamp. Lifecycle create, update và archive được browser
  chạy qua API thật, gồm cả recovery/error state.
- EMPLOYEE đọc được projection vận hành được cấp nhưng không thấy hoặc gọi thành công
  mutation chỉ dành cho ADMIN. Browser negative flow xác nhận hành động bị chặn.

## Responsive và accessibility evidence

Browser matrix kiểm đủ sáu route ở `1440 px` và `360 px`. Mỗi route được đo
`scrollWidth <= clientWidth`, không lộ input/file control mặc định, và chạy Axe với
ngưỡng zero serious/critical.

Lượt browser đầu không bị xóa khỏi lịch sử: nó phát hiện bốn lỗi accessibility thật:

1. helper trạng thái được chọn ở catalog thiếu tương phản;
2. hint dùng chung cho selected option thiếu tương phản;
3. header bảng voucher thiếu tương phản;
4. context link trên mobile không có accessible name.

Bốn remediation lần lượt nằm ở `3d8d18c`, `781bf41`, `16457ba` và `d2e566a`.
Sau sửa, full spec đạt `4/4` hai lượt liên tiếp trên logic tree `ef5708f`, mỗi lượt
1,2 phút, không retry. Commit `f72fd6e` sau đó chỉ chuẩn hóa format; targeted gate và
typecheck được chạy lại trên cây đã format.

## Test evidence

| Gate | Kết quả tại tree cuối |
| --- | --- |
| Full web unit/component | PASS — 130 file, 630/630 test |
| Targeted API catalog/voucher | PASS — 4 file, 50/50 test |
| Web lint | PASS — zero warning |
| Web typecheck | PASS |
| Browser catalog/voucher lượt cuối 1 | PASS — 4/4, Chromium, 1 worker, 1,2 phút |
| Browser catalog/voucher lượt cuối 2 | PASS — 4/4, Chromium, 1 worker, 1,2 phút |
| Responsive matrix | PASS — 6 route × 1440/360 px, không overflow |
| Axe | PASS — zero serious/critical |
| `git diff --check` | PASS |

## Acceptance mapping

| Acceptance WP-07 | Đánh giá |
| --- | --- |
| Sáu route dùng được ở 360/1440 px, không overflow hoặc lộ UI mặc định | **PASS** — đủ sáu route, hai viewport, overflow measurement và Axe sau remediation |
| Employee không truy cập admin-only voucher mutation | **PASS** — browser negative role flow xác nhận mutation bị chặn |
| Product/voucher lifecycle và conflict test xanh | **PASS** — product/media/conflict và voucher create/update/archive đạt 4/4 hai lượt liên tiếp |

WP-07 không còn blocker trong phạm vi. `FE9-R14` của checkout vẫn mở độc lập;
kết quả catalog/voucher không đóng WP-05 hoặc toàn bộ FE-09.
