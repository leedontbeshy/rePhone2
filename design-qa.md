# Design QA — Model & Exact-unit Detail

## Findings

Không còn finding P0, P1 hoặc P2 sau vòng kiểm tra cuối.

Các khác biệt được chấp nhận:

- Mockup dùng iPhone 15 Pro Max với nhiều ảnh và nhiều máy; implementation dùng dữ liệu Supabase hiện hành của iPhone 14 Pro, một ảnh model và một exact unit. UI không tạo dữ liệu hoặc thumbnail giả để lấp chỗ trống.
- Exact-unit reference ban đầu có dossier dài. Theo quyết định đã xác nhận ngày 2026-08-26, storefront chỉ giữ năm kết quả kiểm tra tiêu biểu; full checklist, repair note và masked identifier không còn xuất hiện trên trang mua hàng.
- Claim đổi trả, giao hàng toàn quốc, VAT, ETA và các thông số không có trong contract không được sao chép từ mockup.

## Source visual truth

- Model: `docs/assets/ui/rephone-model-detail-canonical-reference.png` — `1006 × 1563` px.
- Exact unit: `docs/assets/ui/rephone-exact-unit-detail-canonical-reference.png` — `973 × 1616` px.
- State: storefront anonymous, light theme, dữ liệu catalog công khai.

## Rendered implementation evidence

Tất cả ảnh được chụp bằng Chromium headless với `deviceScaleFactor: 1` trên production build local.

Implementation evidence SHA: `31cfa5b`.

| Surface                  | CSS viewport | Screenshot pixels | Evidence                                  |
| ------------------------ | -----------: | ----------------: | ----------------------------------------- |
| Model desktop            | `1006 × 900` |     `1006 × 1956` | `.local/design-qa/model-desktop-1006.png` |
| Exact-unit desktop       |  `973 × 900` |      `973 × 1955` | `.local/design-qa/exact-desktop-973.png`  |
| Model mobile             |  `390 × 844` |      `390 × 3095` | `.local/design-qa/model-mobile-390.png`   |
| Exact-unit mobile        |  `390 × 844` |      `390 × 4179` | `.local/design-qa/exact-mobile-390.png`   |
| Model narrow mobile      |  `320 × 900` |      `320 × 3031` | `.local/design-qa/model-mobile-320.png`   |
| Exact-unit narrow mobile |  `320 × 900` |      `320 × 4217` | `.local/design-qa/exact-mobile-320.png`   |

Không có density scaling. Desktop source và implementation dùng cùng chiều rộng; khác chiều cao do dữ liệu thật chỉ có một exact unit và do dossier dài đã được loại bỏ theo quyết định mới.

## Comparison evidence

- Full model comparison: `.local/design-qa/model-full-comparison.png` — `2032 × 2000` px.
- Focused model comparison: `.local/design-qa/model-top-comparison.png` — `2032 × 994` px.
- Full exact-unit comparison: `.local/design-qa/exact-full-comparison.png` — `1966 × 1999` px.
- Focused exact-unit comparison: `.local/design-qa/exact-top-comparison.png` — `1966 × 994` px.

Focused comparisons được dùng cho header, breadcrumb, hero/gallery, purchase rail, giá, benefit cells, CTA và đầu fact matrix. Full comparisons được dùng cho section rhythm, card density, inspection summary và footer.

## Required fidelity surfaces

- **Fonts và typography:** Inter/system stack, weight hierarchy, tabular price, line-height và wrapping giữ đúng technical-retail direction; một `h1` trên mỗi route.
- **Spacing và layout:** desktop giữ hierarchy gallery/copy `7/5`; mobile đi một cột đúng task order. Không overflow ở `1006`, `973`, `390` hoặc `320` px. Radius, border và shadow nhất quán, không còn footer overflow.
- **Colors và tokens:** canvas/surface/ink/teal lấy từ design tokens. Purchase-benefit label đã tăng contrast; Axe không còn serious/critical violation.
- **Image quality:** dùng đúng asset catalog thật, `object-fit: contain`, không kéo méo hoặc thay bằng placeholder/CSS art. Badge phân biệt rõ ảnh model và ảnh đúng mã máy.
- **Copy và content:** copy ngắn, tự nhiên, không còn từ “checkout”; summary ghi rõ `5/18` kết quả tiêu biểu và không làm người mua hiểu nhầm đó là checklist đầy đủ.

## Browser and accessibility checks

- Cả hai route trả `200`, mỗi route có đúng một `h1`.
- Gallery zoom mở và đóng được ở cả sáu viewport.
- Điều hướng từ card model sang exact unit hoạt động.
- Mobile purchase bar xuất hiện sau CTA gốc và tự ẩn khi footer vào viewport, nên không che footer.
- Exact-unit không còn “Dữ kiện của đúng máy này”, “Kết quả đầy đủ” hoặc link “Xem toàn bộ kết quả kiểm tra”; compact summary có đúng năm dòng.
- Exact unit không còn công khai trả `404`, hiển thị recovery state và link về đúng model.
- Axe serious/critical: `0` trên cả sáu capture.
- Console chỉ có `401` dự kiến từ optional anonymous-session refresh; không có page exception.

## Comparison history

### Iteration 0 — blocked

- Bản detail cũ chưa bám hai mockup, hierarchy và storefront shell chưa đồng nhất.
- Đã thay bằng shared gallery, breadcrumb, fact grid, exact-unit card, purchase rail và responsive page composition.

### Iteration 1 — blocked

- Comparison đầu phát hiện desktop footer overflow, card quá cao, fact/inspection density và section gap lớn.
- Đã sửa grid footer, media ratio/card spacing, desktop fact rows, inspection spacing và model page gap; post-fix evidence là bốn comparison image hiện hành.

### Iteration 2 — blocked

- Axe phát hiện label trong purchase-benefit chỉ đạt contrast `4.34:1`.
- Đã đổi label sang body token; post-fix Axe serious/critical bằng `0`.

### Iteration 3 — passed

- User khóa compact inspection summary và bỏ full dossier.
- Đã xóa hai section dài cùng link, ghi rõ summary `5/18`, bảo vệ mobile purchase bar, thêm unavailable recovery và đồng bộ `design.md`/`plan-fe.md`.
- Capture production cuối không overflow, không lỗi accessibility nghiêm trọng và không còn nội dung bị loại.

## Residual test gap

- Deterministic Playwright snapshot suite cần PostgreSQL test qua Docker Desktop. Docker daemon hiện tắt nên snapshot refresh chưa chạy; visual QA thay thế đã chạy trên production build + Supabase live seed, nhưng không thay cho lần refresh snapshot khi test database khả dụng.

final result: passed
