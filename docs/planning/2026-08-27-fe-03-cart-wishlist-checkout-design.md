# FE-03 — Giỏ hàng, ưa thích và đặt hàng

> Trạng thái: Đã triển khai và kiểm chứng
> Ngày chốt thiết kế: 2026-08-27
> Nhánh triển khai: `feat/fe-3-cart-wishlist-checkout`
> Phụ thuộc: FE-01, FE-02
> Nguồn sự thật: [`plan-fe.md`](../../plan-fe.md), [`design.md`](../../design.md), [Cart/Wishlist API](../api/cart-and-wishlist-endpoints.md), [Checkout API](../api/checkout-and-customer-order-endpoints.md)

## 1. Mục tiêu và phạm vi

FE-03 hoàn thiện hành trình từ sản phẩm đã chọn đến đơn hàng cho khách vãng lai và tài khoản `CUSTOMER`, đồng thời giữ đúng danh tính từng máy/phụ kiện xuyên suốt giỏ hàng và bước xác nhận.

Phạm vi gồm:

- Làm mới `/cart`, `/wishlist`, `/checkout` trong cùng hệ thống giao diện storefront.
- Hoàn thiện trạng thái tải, trống, lỗi, thử lại, gộp giỏ, thay đổi giá/tồn kho, giới hạn số lượng và xác nhận lại.
- Giữ ảnh, tên, phiên bản, mã máy, giá và tình trạng của đúng sản phẩm đã chọn.
- Hỗ trợ giao tận nơi, nhận tại cửa hàng, địa chỉ đã lưu, mã ưu đãi, khách vãng lai và khách đã đăng nhập.
- Bổ sung unit/component test, browser test, responsive và accessibility evidence cho đủ 10 operation FE-03.

Không thuộc FE-03: trang lịch sử đơn hàng, bảo hành, thanh toán trực tuyến, cart drawer, tự áp mã ưu đãi, giữ hàng khi xem trước, ETA giả lập hoặc thông tin vị trí tồn kho.

## 2. Mục tiêu hình ảnh đã chọn

Phương án mockup số 1 — **Biên tập cân bằng** — là visual target cho checkout:

- Header storefront lớn hiện tại được giữ nguyên.
- Nền trắng/xám nhạt, chữ navy, màu nhấn teal và bóng đổ tối thiểu theo token hiện có.
- Bố cục desktop hai cột: biểu mẫu khoảng 62%, bản xác nhận bám theo khoảng 38%.
- Cột trái dùng một bề mặt liên tục, chia nhóm bằng khoảng cách và đường phân cách nhẹ; không lồng nhiều card.
- Cột phải ưu tiên nhận diện sản phẩm, chi tiết tiền, thông báo an tâm và một hành động chính.
- Trên mobile, hai cột xếp dọc; bản xác nhận và hành động chính luôn dễ tiếp cận.
- Toàn bộ nội dung khách hàng dùng tiếng Việt tự nhiên, không hiển thị thuật ngữ triển khai.

Giỏ hàng và ưa thích sử dụng cùng ngôn ngữ thiết kế, token và hệ component này.

## 3. Kiến trúc frontend

- Giữ nguyên URL công khai nhưng đưa ba trang vào `StorefrontFrame` và dùng header/footer/navigation hiện tại.
- Tách component và style FE-03 vào `components/commerce` cùng CSS Module; không mở rộng selector global legacy.
- Giữ `CommerceProvider` làm nguồn dữ liệu giỏ hàng duy nhất.
- Tuần tự hóa toàn bộ mutation giỏ hàng để phản hồi cũ không ghi đè trạng thái mới.
- Chỉ đánh dấu merge hoàn tất sau khi API thành công; retry được bảo vệ khỏi gửi trùng.
- Dọn cart/merge/address state thuộc phiên cũ khi đăng xuất hoặc đổi vai trò.
- Thêm checkout adapter typed để gọi preview/create và kiểm tra an toàn payload `CHECKOUT_REVIEW_REQUIRED` trước khi cập nhật UI.
- Giữ nguyên generated client, CSRF, cookie khách, token transport và order redirect contract hiện tại.

Backend không đổi trừ khi kiểm thử phát hiện lỗi contract thực tế.

## 4. Danh tính sản phẩm và luồng dữ liệu

`cartItemId` là khóa nối preview với cart hiện tại. Khi nối được, checkout hiển thị ảnh, phiên bản, mã máy, đường dẫn exact-unit và dữ liệu trình bày từ cart. Khi không nối được, trang vẫn hiển thị dữ liệu public-safe từ preview và không làm hỏng toàn bộ bản xác nhận.

Luồng chính:

1. Tải hoặc gộp giỏ hiện hành.
2. Phân loại cảnh báo và cho khách điều chỉnh item bị chặn.
3. Thu thập thông tin liên hệ/cách nhận hàng.
4. Gọi preview có thẩm quyền, không ghi dữ liệu và không giữ hàng.
5. Hiển thị bản xác nhận đầy đủ để khách chủ động đặt hàng.
6. Tạo đơn một lần; nếu dữ liệu đổi, thay bằng preview mới và yêu cầu xác nhận lại.

Thay đổi giỏ hàng, cách nhận hàng hoặc mã ưu đãi làm preview cũ mất hiệu lực ngay. Phản hồi preview chậm không được ghi đè lựa chọn mới.

## 5. Giỏ hàng

- Mỗi dòng luôn có ảnh, tên, phiên bản/màu, mã máy nếu có, giá hiện tại và số lượng.
- iPhone cố định số lượng 1; phụ kiện cho phép 1–99 với trạng thái chờ theo từng dòng.
- Hiển thị cả cảnh báo cấp cart và cấp item.
- `ITEM_UNAVAILABLE` và `QUANTITY_NOT_AVAILABLE` là cảnh báo chặn; CTA sang bước đặt hàng bị khóa cho đến khi khách điều chỉnh.
- `PRICE_CHANGED` là cảnh báo cần chú ý, hiển thị giá cũ/mới rõ ràng nhưng không tự sửa snapshot.
- `QUANTITY_CAPPED_ON_MERGE` được diễn đạt tự nhiên và chỉ dẫn số lượng hiện có.
- Khối tổng tiền bám theo trên desktop, xuống cuối nội dung trên mobile.
- Có loading, empty, load error, merge error/retry, update error, remove pending và thông báo `aria-live`.

## 6. Sản phẩm ưa thích

- Thẻ có chiều cao đồng đều và hiển thị trạng thái còn hàng, tạm hết hoặc không còn bán.
- Item còn sẵn có hành động thêm đúng máy/phụ kiện vào giỏ; item stale vẫn xem và xóa được.
- Khách chưa đăng nhập được chuyển tới đăng nhập với `returnTo=/wishlist`.
- Tài khoản nhân viên không dùng trải nghiệm mua hàng.
- Add/remove có pending state riêng, thông báo thành công/lỗi và thử lại phù hợp.
- Bố cục card responsive, không làm lệch hàng khi tên hoặc trạng thái dài.

## 7. Checkout

- Khi cart đang tải, lỗi hoặc merge chưa xử lý, biểu mẫu không được phép hoạt động như một checkout hợp lệ.
- Biểu mẫu gồm thông tin liên hệ, giao tận nơi/nhận tại cửa hàng, địa chỉ giao hàng, địa chỉ đã lưu, mã ưu đãi và ghi chú.
- Địa chỉ đã lưu được sao chép inline vào payload; `PICKUP` không gửi shipping address.
- Trường nhập có `required`, `maxLength`, `autocomplete`, `inputMode`, lỗi theo trường và focus vào lỗi đầu tiên.
- Preview hiển thị ảnh, danh tính chính xác, đơn giá, số lượng, giảm giá, voucher, tổng tiền, tiền đặt trước, số còn lại và warning.
- Chỉ mở nút đặt hàng sau preview hợp lệ; một pending lock ngăn double-submit.
- `CHECKOUT_REVIEW_REQUIRED` thay bản xác nhận bằng dữ liệu an toàn mới, làm nổi bật thay đổi và bắt buộc khách xác nhận lại.
- Không auto-retry create và không tạo lại đơn khi client không chắc phản hồi đầu tiên.
- Thành công chuyển khách đăng nhập/khách vãng lai đến đúng trang đơn theo contract hiện tại.

## 8. Yêu cầu phi chức năng

- Responsive từ 320–1440 px; kiểm tra tối thiểu tại 320, 768 và 1440 px.
- Vùng bấm tối thiểu 44 px, keyboard navigation, focus visible, `aria-live` và tương phản WCAG AA.
- Phù hợp mục tiêu 20–50 người dùng đồng thời; hạn chế refetch/N+1 ở frontend và luôn có trạng thái tải/lỗi rõ ràng.
- Access token chỉ ở bộ nhớ; guest cookie và CSRF giữ nguyên; không ghi hoặc hiển thị raw token/cookie/session detail.
- Consistency ưu tiên hơn availability ở bước tạo đơn.
- Component commerce, adapter typed và CSS Module phải tách trách nhiệm để FE-04 có thể tái sử dụng mà không phụ thuộc page legacy.

## 9. Test matrix và quality gates

| Lớp | Coverage bắt buộc |
|---|---|
| Provider/unit | mutation queue, merge/retry, session reset, response ordering, cart warning projection |
| Cart component | loading/empty/error, blocking/advisory warning, quantity 1–99, remove/update pending, CTA gate |
| Wishlist component | anonymous/customer/staff, add/remove, stale item, return-to-login |
| Checkout component | preview/create payload, pickup omission, address copy, validation/focus, warning/identity, stale response, malformed 409, reconfirm, double-submit |
| Browser guest | add cart, shipping, preview, create, guest order redirect |
| Browser customer | login merge, wishlist, pickup, saved address, preview/create |
| Browser recovery | merge retry/cap, stale price/stock, invalid voucher/preview, 409 explicit reconfirm |
| Visual/a11y | 320/768/1440, keyboard, focus, overflow, 44 px target, customer-facing Vietnamese |

Quality gates: lint, typecheck, unit/component test, production build và browser flow liên quan. FE-03 chỉ chuyển `DONE` khi cả [`plan-fe.md`](../../plan-fe.md) và `apps/web/lib/frontend-coverage.ts` có đủ bằng chứng cho 10/10 operation.

## 10. Commit, rollout và rollback

Commit dự kiến:

1. `feat(web): redesign cart and wishlist`
2. `feat(web): redesign authoritative checkout`
3. Test/docs-only commit nếu cần để giữ từng concern dễ review.

Rollout chỉ thay presentation/component/provider behavior trong phạm vi frontend. Không thay contract request/response hoặc cơ chế tạo đơn. Rollback về commit FE-02 phải không cần migration và không hủy đơn đã tạo thành công.

## 11. Decision log

| Ngày | Quyết định | Lý do |
|---|---|---|
| 2026-08-27 | Triển khai đầy đủ FE-03, chưa làm FE-04 | Giữ đúng dependency và Definition of Done trong `plan-fe.md` |
| 2026-08-27 | Giữ backend contract, refactor frontend có kiểm soát | Backend đã có contract và concurrency evidence mạnh |
| 2026-08-27 | Dùng `CommerceProvider` thay vì viết lại commerce state | Giảm rủi ro với auth, guest cart và luồng hiện có |
| 2026-08-27 | Chọn mockup phương án 1, bố cục biên tập cân bằng | Dễ đọc, giữ nhận diện storefront và phù hợp checkout hai cột |
| 2026-08-27 | Cảnh báo availability chặn; giá đổi là cảnh báo cần xem | Phản ánh đúng mức độ rủi ro và không tự sửa snapshot |
| 2026-08-27 | Preview không giữ hàng; create không auto-retry | Giữ nguyên invariant checkout có thẩm quyền |
| 2026-08-27 | Nội dung khách hàng dùng tiếng Việt tự nhiên | Tuân theo quy ước nội dung đã chốt cho rePhone |
| 2026-08-27 | Chỉ giữ năm mục công khai ở menu desktop; chuyển bốn lối tắt khách hàng vào popup `Tài khoản` | Nhóm đúng ngữ cảnh quản lý tài khoản, giúp menu chính gọn và cân giữa; mobile vẫn dùng drawer để tránh chật |
| 2026-08-27 | Đặt popup cân giữa dưới nút `Tài khoản` và cho phép phủ lên hàng điều hướng | Giữ liên kết thị giác rõ với nút mở, tránh khoảng cách dọc hoặc độ lệch ngang khiến popup trông rời rạc |

## 12. Assumptions và câu hỏi mở

- Giả định generated client và backend hiện tại tiếp tục là nguồn sự thật cho payload/status.
- Giả định asset/media hiện có đủ để hiển thị exact-unit identity; fallback public-safe được dùng khi thiếu ảnh.
- Không còn câu hỏi mở trước implementation.

## 13. Bằng chứng hoàn tất

- `/cart`, `/wishlist` và `/checkout` dùng chung `StorefrontFrame`, component commerce và CSS Module riêng.
- `CommerceProvider` có mutation queue, session reset, merge single-flight/retry và không để phản hồi phiên cũ ghi đè cart mới.
- Checkout adapter kiểm tra payload authoritative, pickup/store, tiền và `CHECKOUT_REVIEW_REQUIRED`; create không tự thử lại khi kết quả chưa chắc chắn.
- Unit/component tests bao phủ provider, cart/wishlist presenter, checkout component và checkout adapter.
- Browser specs bao phủ guest shipping create + token handoff, CUSTOMER pickup create, merge retry, Wishlist và 409 xác nhận lại; create được mock để không tiêu thụ inventory seed.
- QA trực quan tại 320/768/1440 px và bản so sánh với mockup đã duyệt được ghi trong [`design-qa.md`](../../design-qa.md); kết quả cuối `passed`.
- Backend contract, Prisma schema và inventory state không thay đổi.
