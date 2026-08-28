# Design QA — FE-05 quản trị danh mục và mã ưu đãi

Date: 2026-08-28

Preview: `http://localhost:3000/backoffice/catalog/products`

## Phạm vi và nguồn đối chiếu

- Phương án hình ảnh đã duyệt: catalog board cho sản phẩm và mã ưu đãi.
- Mockup chuẩn: `docs/assets/ui/fe-05/`.
- Sáu màn hình được nghiệm thu:
  - `/backoffice/catalog/products`
  - `/backoffice/catalog/products/new`
  - `/backoffice/catalog/products/[id]`
  - `/backoffice/vouchers`
  - `/backoffice/vouchers/new`
  - `/backoffice/vouchers/[id]`

## Điều kiện kiểm tra

| Nhóm              |    Viewport | Tỉ lệ điểm ảnh | Trạng thái                                          |
| ----------------- | ----------: | -------------: | --------------------------------------------------- |
| Desktop đối chiếu | 1487 × 1058 |              1 | Quản trị viên đã đăng nhập, dữ liệu giả lập ổn định |
| Mobile hành vi    |   360 × 800 |              1 | Cùng tài khoản và dữ liệu                           |

Ảnh triển khai được chụp bằng in-app browser ở cùng viewport với mockup. Không dùng
Playwright CLI trong lượt đóng phase này.

## Bằng chứng đối chiếu desktop

Mỗi ảnh dưới đây đặt mockup nguồn ở bên trái và bản triển khai ở bên phải trong cùng
một ảnh để đánh giá trực tiếp:

- Danh sách sản phẩm:
  `.local/product-design-qa/fe05/catalog-list-desktop--comparison.png`
- Tạo sản phẩm:
  `.local/product-design-qa/fe05/catalog-create-desktop--comparison.png`
- Chi tiết sản phẩm:
  `.local/product-design-qa/fe05/catalog-detail-desktop--comparison.png`
- Danh sách mã ưu đãi:
  `.local/product-design-qa/fe05/vouchers-list-desktop--comparison.png`
- Tạo mã ưu đãi:
  `.local/product-design-qa/fe05/voucher-create-desktop--comparison.png`
- Chi tiết mã ưu đãi:
  `.local/product-design-qa/fe05/voucher-detail-desktop--comparison.png`

Bằng chứng mobile:

- `.local/product-design-qa/fe05/catalog-list-mobile-final.png`
- `.local/product-design-qa/fe05/voucher-create-mobile.png`

## Kết quả trực quan

- Cấu trúc hai cột, phân cấp tiêu đề, bộ lọc, tab trạng thái, card dữ liệu, panel bên
  phải và CTA chính giữ đúng hướng hình ảnh đã duyệt.
- CTA chính giữ tương phản chữ ở trạng thái thường, hover và focus.
- Dải trạng thái mã ưu đãi không còn xuất hiện thanh cuộn dọc thừa.
- Header backoffice trên mobile chỉ giữ các thao tác thiết yếu, không còn cắt tên hay
  chia chữ thành nhiều cột hẹp.
- Các dải tab vẫn cuộn ngang được trên màn hình hẹp nhưng không hiển thị thanh cuộn
  thô; toàn trang không tràn ngang.
- Không còn P0, P1 hoặc P2 sau vòng sửa cuối. Sai khác P3 chấp nhận được đến từ số
  lượng dữ liệu, trạng thái bản ghi và mật độ nội dung của dữ liệu giả lập; cấu trúc và
  hành vi chính không thay đổi.

## Tương tác đã kiểm tra

- Bộ lọc loại sản phẩm tự cập nhật URL và danh sách đúng dữ liệu.
- Tab trạng thái mã ưu đãi cập nhật URL và chỉ giữ các chương trình phù hợp.
- Hộp xác nhận lưu trữ sản phẩm mở bằng modal thật, giữ focus và đóng sạch bằng nút
  hủy.
- Sáu route đều có đúng một vùng nội dung chính và một tiêu đề cấp một.
- Các điều khiển hiển thị đều có nhãn; nút tải ảnh ẩn khỏi luồng bàn phím trùng lặp và
  thao tác qua nút “Tải ảnh” có tên rõ ràng.
- Sáu route không hiển thị UUID, enum thô hoặc nội dung kỹ thuật dành cho lập trình
  viên.
- `documentElement.scrollWidth <= documentElement.clientWidth` ở cả sáu route tại
  1487 × 1058 và 360 × 800.
- Console không có lỗi sau hành trình kiểm tra cuối.

## Kiểm tra tự động

- Web unit: 59 file, 257/257 test đạt.
- API unit: 105 file, 612/612 test đạt.
- A11y contract: 4 file, 15/15 test đạt.
- Coverage contract: 1 file, 4/4 test đạt.
- Lint, typecheck và production build đạt; build tạo 36 trang tĩnh.
- Browser evidence spec cho sáu route đã có trong
  `tests/browser/catalog-voucher-admin.spec.ts`, nhưng không chạy Playwright CLI trong
  lượt nghiệm thu này.
- PostgreSQL/Docker integration chưa chạy trong lượt này; kết quả trên không tuyên bố
  integration hoặc E2E cơ sở dữ liệu đã đạt.

final result: passed
