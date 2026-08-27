# Design QA — Exact-unit Hero Balance & Location Availability

## Findings

Không còn finding P0, P1 hoặc P2 sau vòng kiểm tra cuối.

Sai khác được chấp nhận:

- Mockup dùng iPhone 15 Pro Max với nhiều ảnh; implementation dùng chiếc iPhone 11 `RPH-IP11-64-BLK-U04` và một ảnh thật từ Supabase. Đây là khác biệt dữ liệu, không phải layout drift.
- Panel `Tình trạng của máy` là refinement đã duyệt sau mockup. Panel chỉ dùng ba fact public-safe và không đưa checklist vận hành vào purchase rail.
- Ở đúng breakpoint `1280px`, rail dài hơn gallery khoảng `108px` nhưng không overflow hoặc che control; từ `1440px` trở lên, hai đáy lệch `3px`. Đây là transition responsive chấp nhận được, không dùng chiều cao giả để che sai lệch.

## Source visual truth

- Exact-unit reference: `docs/assets/ui/rephone-exact-unit-detail-canonical-reference.png` — `973 × 1616px`.
- UX contract: `design.md`, mục `12.4.1` và `12.4.2`.
- State: storefront anonymous, light theme, exact unit còn bán.

## Rendered implementation evidence

| Surface                       |  CSS viewport | Screenshot pixels | Density | Evidence                                                  |
| ----------------------------- | ------------: | ----------------: | ------: | --------------------------------------------------------- |
| Warehouse unit desktop        | `1440 × 1000` |     `1440 × 1000` |     `1` | `.local/design-qa/exact-unit-balance-1440-final.png`      |
| Warehouse unit mobile         |   `390 × 844` |       `390 × 844` |     `1` | `.local/design-qa/exact-unit-balance-390-final.png`       |
| Warehouse unit medium desktop | `1280 × 1000` |     `1280 × 1000` |     `1` | `.local/design-qa/exact-unit-balance-1280-two-column.png` |
| Warehouse unit wide desktop   | `2322 × 1000` |     `2322 × 1000` |     `1` | `.local/design-qa/exact-unit-balance-2322.png`            |

## Comparison evidence

- Full-view/focused top-fold comparison: `.local/design-qa/exact-unit-balance-comparison-final.png` — `1946 × 676px`.
- Bên trái là source crop `973 × 676px`. Bên phải là implementation viewport `1440px` được downsample về `973px` rồi crop cùng chiều cao; density normalization scale là `973 / 1440`.
- Không cần comparison region thứ hai: comparison này đã crop riêng header, gallery và toàn bộ purchase rail ở kích thước đọc được — đúng vùng thay đổi của concern.

## Required fidelity surfaces

- **Fonts và typography:** giữ Inter/system stack, hierarchy title/price và tabular price hiện hành; copy location/condition không cắt hoặc tràn.
- **Spacing và layout:** gallery 1:1 và rail `7/5` được giữ. Tại `1440` và `2322px`, rail/gallery lệch đáy `-3px`; `320`, `390`, `768`, `1280`, `1440` và `2322px` đều có `scrollWidth === clientWidth`.
- **Colors và tokens:** surface, border, teal, text hierarchy và focus styles chỉ dùng token hiện hành; không thêm palette hoặc decoration mới.
- **Image quality:** dùng đúng ảnh public của exact unit, `object-fit: contain`; không crop, stretch, placeholder hoặc asset dựng bằng CSS.
- **Copy và content:** unit tại `STORE` hiện `Sẵn hàng`; unit tại `WAREHOUSE` hiện `Đang ở kho` cùng link `Liên hệ cửa hàng` để điều chuyển trước khi xem. UI không hard-code pickup và không nói `Chưa hỗ trợ`.
- **Icons:** giữ Phosphor outline hiện hành; không thêm emoji, SVG tự dựng hoặc CSS art.
- **Accessibility:** Axe serious/critical bằng `0` tại `320`, `1280` và `1440px`; semantic `dl/dt/dd`, focus và link navigation được giữ.

## Primary interactions and runtime checks

- Route live Supabase `RPH-IP11-64-BLK-U04` trả `200`, hiển thị đúng một `Đang ở kho`.
- Link `Liên hệ cửa hàng` điều hướng thành công tới `/store`.
- Route `RPH-IP11-64-BLK-U01` tại location `STORE` hiển thị đúng một `Sẵn hàng`.
- Có đúng ba condition row ở mọi viewport; không có page exception.
- Console chỉ có `401` dự kiến từ optional anonymous-session refresh; public route vẫn hoạt động và không có lỗi runtime.

## Comparison history

### Iteration 0 — blocked

- Condition rows xếp dọc làm purchase rail dài hơn gallery khoảng `105px` ở `1440px`, và chênh tăng ở viewport hẹp hơn.
- Copy `Chưa hỗ trợ` khiến người dùng hiểu sai rằng cửa hàng không hỗ trợ pickup.

### Iteration 1 — blocked

- Condition rows đã compact và hai đáy gần khớp ở desktop rộng.
- Copy `Chỉ giao hàng` đúng về checkout nhưng mâu thuẫn với label `Tại cửa hàng` và không giải thích khả năng điều chuyển.

### Iteration 2 — passed

- Giữ compact row, breakpoint responsive và bổ sung lại padding cuối đúng nhịp.
- Location copy đổi thành `Sẵn hàng` hoặc `Đang ở kho`; warehouse state có link liên hệ điều chuyển.
- Post-fix evidence là screenshot/comparison nêu trên, browser measurements, Axe và test/build xanh.

## Follow-up polish

- P3: khi backend bổ sung workflow yêu cầu điều chuyển, link `/store` có thể được nâng thành CTA tạo yêu cầu; hiện tại không dựng hành vi chưa có contract.

final result: passed
