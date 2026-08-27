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

---

# Design QA — Customer Language, Store, Header & Account Alignment

## Findings

Không còn finding P0, P1 hoặc P2 sau vòng kiểm tra cuối.

## Source visual truth

- Ảnh phản hồi hồ sơ của người dùng: `C:/Users/Lee/AppData/Local/Temp/codex-clipboard-b2183161-cde5-43fa-a1d1-7d1b11084052.png` — `869 × 269px`, `96dpi`.
- UX contract: `design.md` phiên bản `1.6` và `docs/planning/2026-08-27-customer-language-store-header-polish.md`.
- Baseline store/header trước chỉnh sửa: `.local/product-design-audit/storefront-header/01-store-desktop.png`, `02-store-mobile.png` và `03-mobile-menu.png`.
- Trạng thái kiểm tra: giao diện sáng; store ẩn danh; account dùng dữ liệu QA tổng hợp, không dùng mật khẩu hoặc dữ liệu thật.

## Rendered implementation evidence

| Surface                  | CSS viewport | Screenshot pixels | Density | Evidence                                                      |
| ------------------------ | -----------: | ----------------: | ------: | ------------------------------------------------------------- |
| Store desktop            | `1440 × 900` |      `1425 × 891` | `96dpi` | `.local/product-design-qa/store-desktop-1440-raw.jpg`         |
| Store mobile             |  `390 × 844` |       `375 × 812` | `96dpi` | `.local/product-design-qa/store-mobile-390.jpg`               |
| Store mobile menu        |  `390 × 844` |       `390 × 844` | `96dpi` | `.local/product-design-qa/store-mobile-menu-390.jpg`          |
| Account desktop viewport | `1280 × 900` |      `1265 × 889` | `96dpi` | `.local/product-design-qa/account-profile-viewport.jpg`       |
| Account contact panel    | `1280 × 900` |       `962 × 303` | `96dpi` | `.local/product-design-qa/account-profile-implementation.jpg` |
| Account mobile           |  `390 × 844` |       `375 × 812` | `96dpi` | `.local/product-design-qa/account-mobile-390.jpg`             |

## Comparison evidence

- Focused account comparison: `.local/product-design-qa/account-comparison.jpg` — `1794 × 306px`.
- Bên trái là ảnh người dùng `869 × 269px`; bên phải là implementation crop `962 × 303px`, được chuẩn hóa về rộng `869px` trước khi ghép.
- Comparison bao phủ đúng vùng thay đổi: heading, mô tả, hai label, hai input, helper text và CTA.
- Source có input họ tên thấp hơn input số điện thoại; implementation có hai input cùng `top = 709.59375px`, sai lệch `0px`.

## Required fidelity surfaces

- **Typography:** giữ font stack và hierarchy hiện hành; heading, label, helper text và CTA không bị cắt hoặc tràn.
- **Spacing và layout:** account desktop cân bằng hai cột; mobile xếp dọc đúng thứ tự. Store desktop dùng header hai hàng `72px + 48px`; navigation rộng `48rem`, nằm giữa và phân bố đều.
- **Colors và tokens:** giữ surface, border, teal, text hierarchy và focus ring hiện hành; không thêm palette hoặc decoration lạ.
- **Copy và content:** storefront, auth, account, cart, thanh toán, đơn hàng, hậu mãi và bảo hành dùng ngôn ngữ khách hàng tự nhiên; không đưa thuật ngữ kỹ thuật về phiên xác thực hay lưu trữ trình duyệt ra UI khách hàng.
- **Icons và assets:** giữ icon library và asset hiện có; không tạo emoji, SVG hoặc CSS art thay thế.
- **Responsive và accessibility:** store/account đều có `scrollWidth <= clientWidth`; menu có dialog semantics, focus vào nút đóng khi mở, đóng bằng `Escape` và trả focus về trigger.

## Primary interactions and runtime checks

- Menu mobile mở thành công, `aria-expanded=true`, route `Cửa hàng` có current state; `Escape` đóng menu, dialog count về `0` và focus trở lại `Mở danh mục`.
- CTA store giữ đúng `tel:0900000000`; link bản đồ là URL Google Maps an toàn với địa chỉ đã encode.
- Account desktop: hai input cao `50px`, cùng top và cùng độ rộng theo grid.
- Account mobile: họ tên ở `top=916.59375px`, số điện thoại ở `top=1010.59375px`, xác nhận xếp dọc; document width `375px` trong CSS viewport `390px`, không overflow ngang.
- Console của các tab QA cuối chỉ có React DevTools/HMR info; không có lỗi runtime.
- `pnpm --filter @rephone/web test`: `38` files, `143` tests passed.
- `pnpm --filter @rephone/web typecheck`, `lint` và `build`: passed.

## Comparison history

### Iteration 0 — blocked

- Ảnh người dùng cho thấy helper text ở cột số điện thoại làm hai field không cân theo trục dọc.
- Header nhỏ, navigation lệch trái; `/store` chưa có hierarchy rõ và còn pha thuật ngữ Anh–Việt.
- Auth/account còn giải thích chi tiết triển khai mà khách hàng không cần biết.

### Iteration 1 — blocked

- Form grid đã được neo đầu hàng và browser geometry test được bổ sung.
- Copy auth/account được làm sạch nhưng store, header và các customer commerce surfaces chưa đồng bộ hoàn toàn.

### Iteration 2 — passed

- Account desktop đạt sai lệch input top `0px`; mobile stack và overflow đều đạt.
- Header lớn hơn, navigation desktop căn giữa/phân bố đều; menu mobile hoạt động đầy đủ.
- Store được thiết kế lại với hierarchy, contact/address/pickup information và CTA rõ ràng bằng tiếng Việt tự nhiên.
- Customer-facing error/status/copy ở commerce, hậu mãi và bảo hành đã được Việt hóa; raw contracts và backoffice behavior không bị đổi.
- Post-fix evidence, browser interaction checks và toàn bộ test/typecheck/lint/build đều xanh.

## Follow-up polish

Không có follow-up bắt buộc cho concern hiện tại.

final result: passed
