# Design QA — Exact-unit Condition Refinement

## Findings

Không còn finding P0, P1 hoặc P2 sau vòng kiểm tra cuối.

Các khác biệt được chấp nhận:

- Mockup dùng iPhone 15 Pro Max; implementation snapshot tự động dùng fixture iPhone 14 Pro và QA live dùng iPhone 11 đang `AVAILABLE`. Đây là khác biệt nội dung động, không phải layout drift.
- Số ảnh và số thông số phụ thuộc public projection. UI giữ gallery và tự ẩn field rỗng, không tạo thumbnail, thông số hoặc claim giả.
- Panel `Tình trạng của máy` là phần mở rộng đã duyệt sau mockup: panel lấp khoảng trống purchase rail bằng ba fact public-safe, không đưa checklist vận hành vào khu vực mua hàng.

## Source visual truth

- Exact-unit reference: `docs/assets/ui/rephone-exact-unit-detail-canonical-reference.png` — `973 × 1616` px.
- UX contract: `design.md`, mục `12.4.1 Exact-unit condition refinement`.
- State: storefront anonymous, light theme, exact unit còn bán.

## Rendered implementation evidence

Implementation evidence SHA: `6c26039`.

| Surface                                        | CSS viewport | Screenshot pixels | Density | Evidence                                                                                                      |
| ---------------------------------------------- | -----------: | ----------------: | ------: | ------------------------------------------------------------------------------------------------------------- |
| Exact unit desktop, deterministic fixture      | `1440 × 900` |     `1440 × 3128` |     `1` | `tests/browser/storefront-discovery.spec.ts-snapshots/fe1-exact-unit-dossier-desktop-1440-chromium-win32.png` |
| Exact unit mobile, deterministic fixture       |  `390 × 844` |      `390 × 5579` |     `1` | `tests/browser/storefront-discovery.spec.ts-snapshots/fe1-exact-unit-dossier-mobile-390-chromium-win32.png`   |
| Exact unit desktop, source-width normalization |  `973 × 900` |      `973 × 3012` |     `1` | `.local/design-qa/exact-unit-reference-width-973.png`                                                         |
| Exact unit narrow mobile, live Supabase data   |  `320 × 800` |      `320 × 5218` |     `1` | `.local/design-qa/exact-unit-mobile-320.png`                                                                  |

Desktop source và normalized implementation dùng cùng chiều rộng `973px`. Full-page height khác nhau do dữ liệu thật, panel condition mới và related-unit count; không scale density.

## Comparison evidence

- Full-view side-by-side: `.local/design-qa/exact-unit-reference-comparison.png` — `1946 × 1616` px. Hai ảnh được đặt chung một canvas, mỗi bên rộng `973px`; implementation được crop theo cùng chiều cao để so hierarchy đầu trang, fact matrix và section rhythm.
- Focused purchase-rail side-by-side: `.local/design-qa/exact-unit-purchase-rail-comparison.png` — `860 × 840` px. Dùng để kiểm tra title, color, price, benefits, CTA và panel condition mới ở kích thước đọc được.
- Focused region riêng cho fact matrix không cần thêm: hai nhóm `Cấu hình` và `Thông tin riêng của máy` đọc rõ trong full-view source-width comparison; DOM contract và snapshot suite kiểm tra riêng cấu trúc này.

## Required fidelity surfaces

- **Fonts và typography:** dùng Inter/system stack hiện hành, title/price giữ hierarchy technical-retail, giá dùng tabular numerals; label, fact value và copy dài không bị cắt ở `1440`, `390` hoặc `320px`.
- **Spacing và layout:** gallery lớn được giữ; purchase rail nay cân chiều cao tốt hơn nhờ condition panel. Fact matrix dùng 3/2/1 cột desktop/tablet/mobile. Đo DOM xác nhận `scrollWidth === clientWidth` tại `1440`, `390` và `320px`.
- **Colors và tokens:** toàn bộ surface, border, teal, success/warning dùng token hiện hành; panel mới không thêm palette riêng hoặc hiệu ứng trang trí ngoài design system.
- **Image quality:** dùng ảnh exact unit thật từ public media, giữ `object-fit` và không thay bằng placeholder, CSS art hoặc SVG tự dựng. Số thumbnail phụ thuộc dữ liệu.
- **Copy và content:** purchase rail chỉ nói tổng quát về ngoại hình, pin và lịch sử sửa chữa. Inspection summary dùng `KIỂM TRA TRƯỚC KHI BÁN`, không còn `5/18` hoặc `18 hạng mục`, vẫn giữ tối đa năm kết quả public-safe.
- **Icons:** dùng cùng bộ Phosphor outline, cùng stroke language với storefront; không dùng emoji hoặc icon tự dựng.
- **Accessibility:** Axe serious/critical bằng `0` tại `1440`, `390` và `320px`; skip link nhận focus đầu tiên; section có accessible name và semantic `dl`.

## Primary interactions and runtime checks

- Route exact unit trả `200` trên full stack local + Supabase.
- CTA/cart/wishlist hiện hành vẫn render; mobile purchase bar xuất hiện sau CTA và tự ẩn trước footer theo browser regression.
- Color navigation, gallery, unavailable-unit recovery và SSR-without-JavaScript tiếp tục nằm trong browser suite.
- Console không có page exception. Có một network `401` dự kiến từ optional anonymous-session refresh; public page vẫn render bình thường.
- Ba viewport có đúng `3` condition row, `2` specification group và `5` public inspection result; không có horizontal overflow hoặc old operational-count copy.

## Comparison history

### Iteration 0 — blocked

- Purchase rail cũ để khoảng trống lớn dưới CTA.
- Fact matrix là danh sách phẳng và chỉ hiện ít field khi dữ liệu thưa.
- Inspection copy dùng cách viết `5/18`, mang sắc thái hồ sơ vận hành.

### Iteration 1 — passed

- Thêm `UnitConditionSummary` gồm ngoại hình, pin và lịch sử sửa chữa; không đọc checklist, repair detail, replaced parts hoặc identifier.
- Tách fact matrix thành `Cấu hình` và `Thông tin riêng của máy`, tự bỏ field null/blank.
- Tách `PublicInspectionSummary`, giữ năm kết quả nhưng thay copy theo contract đã duyệt.
- Post-fix evidence: hai comparison image nêu trên, snapshot desktop/mobile và browser suite `14/14` xanh.

## Follow-up polish

- P3: có thể làm gọn breadcrumb inventory code ở màn `320px`; hiện tại vẫn đọc được, không tràn và không che control.
- Enrich chip, RAM, màn hình, model number hoặc region là data concern riêng; UI không tự suy đoán.

final result: passed
