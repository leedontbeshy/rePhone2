# Design QA — FE-03 giỏ hàng, ưa thích và đặt hàng

Date: 2026-08-27

Preview: `http://localhost:3000/checkout`

## Nguồn hình ảnh và phạm vi triển khai

- Visual target đã được duyệt — phương án 1, “Biên tập cân bằng”: `C:\Users\Lee\.codex\generated_images\01a0411f-37e0-7011-9f4b-b7c3ee17d7b5\exec-a7c4f307-d556-46be-896a-27851ade70c8.png` (1487×1058).
- Bản chụp checkout cuối: `D:\Dev\rePhone2\.local\fe3-design-qa\checkout-1440x1024-top.png` (1425×1013).
- Bản so sánh cùng một khung nhìn: `D:\Dev\rePhone2\.local\fe3-design-qa\checkout-source-vs-implementation.png` (2850×1013).
- Bằng chứng desktop bổ sung:
  - `D:\Dev\rePhone2\.local\fe3-design-qa\cart-1440x1024.png` (1425×1013).
  - `D:\Dev\rePhone2\.local\fe3-design-qa\wishlist-1440x1024.png` (1425×1013).
- Bằng chứng responsive:
  - `D:\Dev\rePhone2\.local\fe3-design-qa\checkout-content-320x800.png` (320×764).
  - `D:\Dev\rePhone2\.local\fe3-design-qa\checkout-content-320-summary.png` (320×764).
  - `D:\Dev\rePhone2\.local\fe3-design-qa\checkout-content-768x900.png` (768×883).
  - `D:\Dev\rePhone2\.local\fe3-design-qa\cart-content-320x800.png` (320×764).
  - `D:\Dev\rePhone2\.local\fe3-design-qa\wishlist-content-320x800.png` (320×764).
- Phần triển khai chính: `apps/web/components/commerce/`, `apps/web/app/commerce-provider.tsx`, `apps/web/lib/checkout-api.ts`, `/cart`, `/wishlist` và `/checkout`.

## Viewport, dữ liệu và trạng thái

- Kiểm tra bằng in-app Browser trên local preview, phiên `CUSTOMER` `customer@rephone.local`.
- Desktop đặt viewport 1440×1024; thanh cuộn cổ điển của browser làm vùng nội dung và ảnh chụp còn 1425×1013. `clientWidth` và `scrollWidth` đều bằng 1425, không có tràn ngang.
- Mobile dùng vùng nội dung thật 320 px; `clientWidth` và `scrollWidth` đều bằng 320 trên cart, wishlist và checkout. Ảnh chụp cao 764 px vì phần chrome của in-app Browser.
- Tablet 768 px chuyển checkout về một cột; biểu mẫu và bản xác nhận cùng rộng 735 px, không tràn ngang.
- Giỏ hàng dùng exact unit `RPH-IPX-64-GRY-U01`; Wishlist dùng `RPH-IP17P-256-DBL-U01`.
- Checkout đã kiểm tra cả `SHIPPING` và `PICKUP`. Bản xác nhận giao tận nơi trả về tạm tính 3.490.000 ₫, phí giao hàng 30.000 ₫, đặt cọc 500.000 ₫ và tổng thanh toán 3.520.000 ₫. Bản nhận tại cửa hàng trả về phí giao hàng 0 ₫ và đúng cửa hàng Hồ Chí Minh.
- Không bấm hành động tạo đơn trong phiên kiểm tra thủ công; browser specs dùng phản hồi tạo đơn được kiểm soát để xác minh redirect mà không tiêu thụ máy seed.

## So sánh visual target và implementation

- Bản so sánh ghép nguồn bên trái và implementation bên phải trong cùng một ảnh, cùng kích thước 1425×1013.
- Giữ đúng cấu trúc đã duyệt: header storefront, tỷ lệ hai cột gần 62/38, biểu mẫu biên tập liên tục, hai lựa chọn nhận hàng, summary rail, teal/navy, ảnh sản phẩm và một CTA chính.
- Khác biệt dữ liệu là chủ ý: visual target dùng hai sản phẩm minh họa và ít trường hơn; implementation dùng exact unit thật cùng các trường người nhận/quận-huyện bắt buộc bởi backend.
- Breadcrumb được đưa vào cột biểu mẫu để mép trên của summary cân với phần nội dung chính.
- Không còn CTA chữ teal trên nền teal, giá hiện tại bị gạch ngang, ảnh méo, card lệch, clipping hoặc khoảng trắng bất thường.

## Kiểm tra chức năng chính

- Cart: exact-unit identity, giá hiện tại, số lượng cố định cho iPhone, xóa theo dòng, warning gate, summary và CTA checkout hoạt động; CTA desktop cao 52 px.
- Wishlist: trạng thái còn hàng, ảnh đúng máy, thêm vào giỏ và xóa độc lập; trạng thái tải ổn định thành card thật, CTA mobile cao 52 px.
- Checkout: sao chép địa chỉ đã lưu, chuyển Shipping/Pickup, preview có thẩm quyền, voucher invalidation, summary, review-required và khóa double-submit đều có test.
- Browser specs bổ sung guest create + token handoff, CUSTOMER pickup create, merge retry và 409 buộc xác nhận lại; create response được mock để không thay đổi inventory seed.
- Sau thao tác preview, nút `Đặt hàng` cao 56 px và chỉ mở khi preview hợp lệ. Không có hành động tài chính nào được thực hiện trong QA thủ công.

## Responsive, accessibility và runtime

- 320 px: cart, wishlist và checkout đều có `scrollWidth === clientWidth`; tổng tiền xếp dọc an toàn, không cắt chữ hoặc CTA.
- 768 px: checkout xếp một cột; hai lựa chọn nhận hàng, field grid và summary vẫn đọc đúng thứ tự.
- 1440 px: cart/checkout dùng rail bên phải; rail không che focus hoặc nội dung. Wishlist giữ card đồng đều và khoảng trống còn lại tự nhiên.
- Focus ring của trường checkout là teal solid 2 px; semantic heading, label, `required`, `aria-live`, `role="alert"` và focus-after-remove được giữ.
- Các hành động chính đo được 52–56 px, đạt vùng bấm tối thiểu 44 px.
- Nhật ký Browser không có console error. Chỉ có cảnh báo Fast Refresh do chỉnh file trong lúc dev; cảnh báo này không xuất hiện trong production build.
- Toàn bộ nội dung khách hàng dùng tiếng Việt tự nhiên; không hiển thị thuật ngữ access token, refresh session, cookie hoặc localStorage.

## Lịch sử phát hiện và chỉnh sửa

1. P1 — CTA chính bị kế thừa màu link teal trên nền teal. Đã khóa màu chữ trắng cho cart và checkout.
2. P1 — giá hiện tại của cart bị selector gạch ngang. Đã tách class `oldPrice`, chỉ giá cũ mới có gạch.
3. P1 — checkout có thể giữ dữ liệu người dùng cũ trong một khung hình khi đổi phiên. Đã remount session theo danh tính auth; Wishlist áp dụng cùng nguyên tắc.
4. P1 — lỗi mạng khi tạo đơn có thể khiến người dùng gửi lại một đơn chưa rõ kết quả. Đã khóa create ở trạng thái chờ xác nhận và không auto-retry.
5. P2 — review-required 409, payload pickup/store và số tiền chưa được kiểm tra đủ chặt. Parser và regression tests đã được bổ sung.
6. P2 — thông báo wishlist, focus sau khi xóa, fulfillment disabled và tổng tiền 320 px chưa hoàn chỉnh. Đã sửa trạng thái, focus recovery và responsive stacking.
7. P2 — copy “đồng bộ/gộp” và một đoạn giải thích bị lặp chưa phù hợp khách hàng. Đã chuyển sang tiếng Việt tự nhiên và rút gọn.

Không còn phát hiện P0, P1 hoặc P2.

final result: passed
