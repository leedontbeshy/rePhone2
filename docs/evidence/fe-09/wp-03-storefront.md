# FE-09 WP-03 — Storefront hardening

> Trạng thái: **PASS**<br>
> Phạm vi commit: `aa7889c` → `3bc763a`<br>
> Ngày kiểm tra trình duyệt: 01/09/2026

## Kết quả triển khai

| Concern | Commit | Kết quả |
| --- | --- | --- |
| Ngôn ngữ storefront | `aa7889c` | Bỏ `Model`, `Grade`, `pickup` và các từ triển khai khỏi nội dung khách hàng; dùng tiếng Việt tự nhiên trên dòng máy và máy cụ thể |
| Card và tablet | `91bd35e` | Card giữ chiều cao/hàng nút ổn định; CTA máy cụ thể không biến mất ở 1024 px |
| Filter theo vùng | `148d216` | Lọc, sắp xếp và phân trang giữ nguyên shell/danh sách cũ trong lúc cập nhật; không làm trắng toàn trang |
| Gợi ý tìm kiếm | `c3c3409` | Header desktop và menu di động gợi ý đúng các dòng iPhone; hỗ trợ bàn phím và điều hướng trực tiếp |
| Trạng thái ưu đãi | `a17128c` | Tách loading public/account, lỗi mạng và empty state; không biến lỗi thành màn hình trống |
| An toàn phiên ưu đãi | `9f41528` | Dữ liệu dành riêng cho tài khoản không còn lưu lại khi đăng xuất, đổi khách hàng hoặc đổi trang |
| Browser coverage | `66fef7f` | Bổ sung SSR, responsive, lịch sử URL, unavailable recovery, keyboard, footer và visual contract cho sáu route public |
| Hiệu năng storefront | `25edf6a` | Production budget có warm-up, ba lượt đo, profile cố định và báo cáo đã làm sạch dữ liệu nhạy cảm |
| Ảnh lỗi/chậm | `a3cddf8` | Ảnh lỗi hoặc treo chuyển sang trạng thái “Ảnh đang được cập nhật”; không hiện alt text gạch chân chồng lên card |
| Menu di động | `a74b944` | Menu được đưa lên lớp toàn màn hình, không còn bị sticky header cắt gợi ý; Escape đóng và trả focus đúng |
| Visual contract | `3bc763a` | Cập nhật riêng bốn ảnh chuẩn sau khi review ngôn ngữ, layout desktop/mobile và dữ liệu fixture hiện hành |

## Browser và visual evidence

Sáu surface `/`, `/products`, `/products/[slug]`,
`/products/[slug]/units/[inventoryCode]`, `/store` và `/vouchers` được kiểm tra
trực tiếp với API/database seed kiểm thử. Browser review dùng các viewport đại diện
1440×900, 1024×768 và 390×844; browser matrix tự động bổ sung 320 px.

Review trực tiếp đã phát hiện hai lỗi mà DOM-only test trước đó chưa chặn được:

1. Ảnh public không phát sự kiện tải/lỗi có thể giữ vùng trống hoặc hiện alt text
   mặc định. Component nay chuyển sang fallback có chủ đích sau 4 giây.
2. Menu tìm kiếm di động dùng `position: fixed` bên trong sticky header có
   `backdrop-filter`, nên thực tế chỉ cao bằng header. Menu nay render ở lớp gốc
   của trang; overlay đo đúng 390×844 và danh sách gợi ý nằm trong viewport.

Bốn visual baseline đã review và được theo dõi tại:

- `tests/browser/storefront-discovery.spec.ts-snapshots/fe1-model-detail-desktop-1440-chromium-win32.png`
- `tests/browser/storefront-discovery.spec.ts-snapshots/fe1-model-detail-mobile-390-chromium-win32.png`
- `tests/browser/storefront-discovery.spec.ts-snapshots/fe1-exact-unit-dossier-desktop-1440-chromium-win32.png`
- `tests/browser/storefront-discovery.spec.ts-snapshots/fe1-exact-unit-dossier-mobile-390-chromium-win32.png`

Ảnh review bổ sung cho home, products, filter dialog, vouchers, store và menu tìm
kiếm nằm dưới `.local/fe09-wp03-audit/`; không đưa raw artifact vào Git.

## Performance evidence

Đo trên production build, viewport 390×844, CPU chậm 4 lần, độ trễ 40 ms,
10 Mbps tải xuống, 5 Mbps tải lên, media fixture cố định. Mỗi route warm-up một
lần rồi lấy median của ba browser context sạch.

| Route đại diện | LCP median | CLS median | Interaction proxy median | Budget | Kết quả |
| --- | ---: | ---: | ---: | --- | --- |
| Dòng máy | 508 ms | 0 | 71,80 ms | 2.500 ms / 0,1 / 200 ms | PASS |
| Máy cụ thể | 596 ms | 0 | 58,43 ms | 2.500 ms / 0,1 / 200 ms | PASS |

Báo cáo có `commitSha=3bc763a`, ba sample/route, request count, transferred bytes
và route client bundle tại `.local/release-performance/storefront.json`.

## Test evidence

| Gate | Kết quả |
| --- | --- |
| Full web unit | PASS — 126 file, 597/597 test |
| Storefront browser cuối | PASS — 17/17, Chromium, 1 worker, không tự cập nhật snapshot |
| Storefront visual determinism | PASS — 4/4 snapshot ở lượt cuối |
| Mobile accessibility | PASS — zero serious/critical axe violation; 320 px không overflow |
| Executable coverage | PASS — 9/9 |
| Production performance | PASS — 1/1, hai route đều trong budget |
| Root typecheck | PASS — 4/4 Turbo tasks |
| Root lint | PASS — zero warning |
| Root format check | PASS |
| Production build | PASS — API/web build; Next sinh đủ 56 route |
| `git diff --check` | PASS |

Lượt browser đầu không bị xóa khỏi lịch sử: 11/17 test xanh và 6 test đỏ. Một lỗi
là ngưỡng chiều cao gợi ý quá cứng; năm lỗi còn lại là contract/snapshot cũ sau
khi storefront đã Việt hóa và catalog mặc định thay đổi thứ tự. Test được sửa để
đo hành vi cần bảo vệ thay vì phụ thuộc một card cụ thể; unavailable recovery dùng
mã chắc chắn không tồn tại. Sau review ảnh, suite chạy xanh hai lượt liên tiếp:
một lượt cập nhật snapshot và một lượt xác minh không cập nhật.

## Acceptance mapping

- Sáu route storefront đều có success, loading, error, empty/unavailable,
  responsive và keyboard evidence phù hợp.
- Copy khách hàng dùng tiếng Việt, không đưa thuật ngữ code hoặc chi tiết session
  vào giao diện.
- Filter/search/voucher dùng partial loading và giữ context hợp lệ.
- Public SSR không chứa internal field, raw serial, private storage path hoặc claim
  bán hàng chưa được xác minh.
- Menu, filter dialog và media dialog giữ/khôi phục focus; 320–1440 px không có
  document overflow trong route matrix.
- Performance public có baseline định lượng; các route authenticated/backoffice
  vẫn thuộc WP-12 và chưa được coi là hoàn tất chỉ từ kết quả này.

WP-03 đạt acceptance và có thể chuyển sang WP-04 auth/account hardening.
