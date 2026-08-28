# Design QA — FE-04 portal sau mua

Date: 2026-08-28

Preview: `http://localhost:3000/after-sales`

## Nguồn hình ảnh và phạm vi

- Hướng hình ảnh đã duyệt: **Hành trình theo chặng**.
- Mockup chuẩn: `docs/assets/ui/fe-04/`.
- Ảnh lỗi do người dùng cung cấp:
  - `C:/Users/Lee/AppData/Local/Temp/codex-clipboard-07a0d2bf-9b0a-4f1d-8678-3bd6a1c52ff1.png`
  - `C:/Users/Lee/AppData/Local/Temp/codex-clipboard-03c12aa6-f6c1-4e39-b202-f098c2e176f3.png`
- Phạm vi: `/orders`, `/orders/[orderNumber]`, `/warranties`,
  `/warranties/[warrantyCode]`, `/after-sales`, `/after-sales/new` và
  `/after-sales/[requestNumber]`.

## Điều kiện chụp

| Nhóm                    | Viewport logic | Tỉ lệ điểm ảnh | Kích thước ảnh |
| ----------------------- | -------------: | -------------: | -------------: |
| Desktop                 |    1487 × 1058 |              1 |    1487 × 1058 |
| Mobile hành vi          |      390 × 844 |              1 |      390 × 844 |
| Mobile đối chiếu mockup |      390 × 843 |          2.187 |     853 × 1844 |

Trạng thái chung: khách đã đăng nhập, giỏ hàng trống và dữ liệu giả lập ổn định.
Các màn hình được chụp sau khi tải xong phông chữ; không có lỗi console.

## Bằng chứng đối chiếu

Mỗi ảnh desktop tổng hợp có kích thước 2974 × 1114, gồm mockup nguồn và bản triển khai
cùng viewport. Ảnh mobile tổng hợp có kích thước 1706 × 1900.

- Danh sách đơn hàng:
  `.local/product-design-qa/fe04/orders-list-desktop--comparison.png`
- Danh sách hỗ trợ:
  `.local/product-design-qa/fe04/support-list-desktop--comparison.png`
- Form hỗ trợ sau khi đã chọn sản phẩm:
  `.local/product-design-qa/fe04/support-new-form-desktop--comparison.png`
- Chi tiết bảo hành:
  `.local/product-design-qa/fe04/warranty-detail-desktop--comparison.png`
- Chi tiết đơn hàng trên mobile:
  `.local/product-design-qa/fe04/order-detail-mobile--comparison.png`
- Ô minh chứng thanh toán:
  `.local/product-design-qa/fe04/payment-proof-control.png`
- Màn hình mobile 390 px:
  - `.local/product-design-qa/fe04/orders-list-mobile.png`
  - `.local/product-design-qa/fe04/support-list-mobile.png`

## Kết quả theo sáu yêu cầu

1. Danh sách đơn hàng dùng lưới cột ổn định; mã dài được rút gọn trong ô, không làm
   lệch ngày đặt, tổng tiền và trạng thái. Mã đầy đủ vẫn có trong tooltip.
2. Minh chứng thanh toán dùng bộ chọn tệp riêng, có nút “Chọn tệp”, tên tệp, định
   dạng hỗ trợ, trạng thái focus và trạng thái vô hiệu hóa nhất quán.
3. “Chọn sản phẩm từ đơn hàng” mở bộ chọn ngay trong luồng hỗ trợ. Bộ chọn chỉ tải
   đơn đã hoàn tất, hỗ trợ đầy đủ nhiều trang và cho chọn đúng sản phẩm trước khi mở
   form.
4. Trạng thái phiếu và nút “Xem tiến độ” đã căn giữa trên cùng một hàng ở desktop;
   mobile chuyển thành bố cục xếp lớp rõ ràng.
5. Frontend, đường dẫn trực tiếp và máy chủ đều kiểm tra trạng thái hoàn tất. Đơn đã
   đặt, đã xác nhận, đã hủy hoặc vừa đổi trạng thái không thể tạo phiếu.
6. Hai CTA tại trang hỗ trợ và chi tiết bảo hành dùng đúng màu chính ở trạng thái
   thường, hover, active và focus.

## Lịch sử lặp QA

### Lần 1

- P1 accessibility: chữ trạng thái cảnh báo có độ tương phản 4.22:1, chưa đạt ngưỡng
  4.5:1.
- P2 responsive: trang rộng 486 px trong viewport 390 px; thanh điều hướng và bộ lọc
  bị cắt.
- P2 chức năng: bộ chọn hỗ trợ chỉ đọc 100 đơn hoàn tất đầu tiên.

Đã sửa màu cảnh báo thành `#9b5b00` (khoảng 4.94:1), khóa kích thước tối thiểu của
shell, cho bộ lọc xếp một cột, cân ba mục điều hướng trong 390 px và tải tuần tự toàn
bộ trang đơn hoàn tất với giới hạn an toàn.

### Lần 2

- Không còn P0, P1 hoặc P2.
- `documentElement.scrollWidth === 390` tại `/orders`, chi tiết đơn hàng và
  `/after-sales`; không còn phần tử vượt viewport.
- Axe không còn lỗi serious/critical trong hành trình desktop đã kiểm tra.
- Sai khác P3 chấp nhận được: lượng dữ liệu mẫu và ảnh sản phẩm trong bản triển khai
  phụ thuộc dữ liệu API, nên mật độ hàng có thể khác mockup; cấu trúc, nhịp khoảng
  cách, màu, chữ và hành vi chính vẫn nhất quán.

## Tương tác đã kiểm tra

- Lọc và mở danh sách đơn; mở chi tiết; dialog hủy đơn; quyền truy cập khách.
- Hiển thị và thao tác với bộ chọn minh chứng thanh toán.
- Danh sách và chi tiết bảo hành; CTA yêu cầu hỗ trợ.
- Danh sách, chi tiết và hủy phiếu hỗ trợ.
- Chọn đơn hoàn tất, chọn sản phẩm và mở form tạo yêu cầu.
- URL không hợp lệ, trạng thái đơn không hợp lệ và thay đổi trạng thái đồng thời.
- Một vùng nội dung chính, keyboard focus, độ tương phản và không tràn ngang.

## Kiểm tra kỹ thuật

- Web unit: 51 file, 221 test đạt.
- API unit toàn bộ: 104 file, 609 test đạt; kiểm tra mục tiêu sau cùng: 1 file,
  5 test đạt.
- Browser/visual: 5 test đạt, gồm viewport mobile 390 × 844.
- A11y contract: 4 file, 15 test đạt.
- Coverage contract: 1 file, 4 test đạt.
- Lint, typecheck, format và production build đạt; đủ bảy route FE-04.
- Chụp visual cuối: không có lỗi console.

final result: passed
