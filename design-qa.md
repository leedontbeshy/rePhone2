# Design QA — FE-05 quản trị danh mục và mã ưu đãi

Date: 2026-08-28

Preview: `http://localhost:3000/backoffice/catalog/products`

## Phạm vi và nguồn đối chiếu

- Phương án hình ảnh đã duyệt: catalog board cho sản phẩm và mã ưu đãi.
- Mockup chuẩn: `docs/assets/ui/fe-05/`.
- Sáu màn hình được đối chiếu:
  - `/backoffice/catalog/products`
  - `/backoffice/catalog/products/new`
  - `/backoffice/catalog/products/[id]`
  - `/backoffice/vouchers`
  - `/backoffice/vouchers/new`
  - `/backoffice/vouchers/[id]`

## Điều kiện kiểm tra

| Nhóm | Viewport | Trạng thái |
| --- | ---: | --- |
| Desktop đối chiếu mockup | 1487 × 1058 | Quản trị viên đã đăng nhập, dữ liệu giả lập ổn định |
| Desktop phổ biến | 1366 × 900 | Kiểm tra mật độ form và breakpoint rail |
| Desktop hẹp | 1100 × 900 và 1185 × 900 | Kiểm tra biên chuyển cột catalog |
| Tablet ngang | 1024 × 900 | Kiểm tra tràn ngang và chuyển cột |
| Mobile | 360 × 800 | Kiểm tra điều hướng, form và modal biến thể |

Ảnh triển khai được chụp bằng Chrome điều khiển tự động. Không dùng Playwright CLI.

## Bằng chứng đối chiếu desktop

Mỗi ảnh dưới đây đặt mockup nguồn ở bên trái và bản triển khai ở bên phải:

- Danh sách sản phẩm:
  `.local/product-design-audit/fe05-refinement/20-catalog-list-comparison.png`
- Tạo sản phẩm:
  `.local/product-design-audit/fe05-refinement/21-catalog-create-comparison.png`
- Chi tiết sản phẩm:
  `.local/product-design-audit/fe05-refinement/22-catalog-detail-comparison.png`
- Danh sách mã ưu đãi:
  `.local/product-design-audit/fe05-refinement/23-voucher-list-comparison.png`
- Tạo mã ưu đãi:
  `.local/product-design-audit/fe05-refinement/24-voucher-create-comparison.png`
- Chi tiết mã ưu đãi:
  `.local/product-design-audit/fe05-refinement/25-voucher-detail-comparison.png`

Bằng chứng responsive và trạng thái tương tác:

- Catalog 1024 px sau khi sửa tràn ngang:
  `.local/product-design-audit/fe05-refinement/34-catalog-1024-fixed.png`
- Form mã ưu đãi 1366 px sau khi chuyển rail:
  `.local/product-design-audit/fe05-refinement/35-voucher-create-1366-fixed.png`
- Catalog mobile cuối:
  `.local/product-design-audit/fe05-refinement/40-catalog-mobile-final.png`
- Modal biến thể phụ kiện mobile:
  `.local/product-design-audit/fe05-refinement/38-variant-mobile.png`
- Trạng thái đang cập nhật danh sách mã ưu đãi:
  `.local/product-design-audit/fe05-refinement/39-voucher-updating.png`

## Kết quả trực quan

- Sidebar rộng 272 px, phân cấp và mật độ gần mockup đã duyệt; điều hướng mobile cuộn
  ngang nhưng không lộ thanh cuộn thô.
- Catalog chuyển bộ lọc sang hai cột trước khi vùng nội dung bị bó; các mốc 1024 px,
  1100 px và 1185 px đều không còn tràn ngang.
- Form mã ưu đãi chuyển rail xuống sớm ở màn hình 1366 px, giữ các ô ngày giờ và giới
  hạn đủ rộng, cùng hàng và cùng chiều cao.
- Ở desktop, cặp mã ưu đãi/tên chương trình, ba ô mức giảm và bốn ô thời gian/giới hạn
  đều có chiều cao 44 px và chung tọa độ dọc trong từng hàng.
- Modal biến thể iPhone và phụ kiện có nhóm trường rõ ràng; bản mobile vừa khung và
  cuộn trong modal.
- Không còn P0, P1 hoặc P2 sau vòng sửa cuối. Sai khác P3 chấp nhận được chỉ đến từ dữ
  liệu giả lập và việc sidebar được chủ động phóng lớn theo yêu cầu.

## Tương tác đã kiểm tra

- Catalog mặc định xếp năm ra mắt mới nhất trước; dữ liệu không có năm nằm cuối.
- Tìm `iPhone 17` mở gợi ý gồm iPhone 17e, iPhone 17, iPhone 17 Pro và iPhone 17 Pro
  Max; phím mũi tên và Escape hoạt động.
- Bộ lọc catalog cập nhật URL và giữ card cũ kèm trạng thái “Đang cập nhật danh sách…”
  trong lúc nhận dữ liệu mới, không tải trắng toàn trang.
- Tìm mã `IPHONE5` cập nhật URL tại chỗ, hiển thị trạng thái đang cập nhật và kết thúc
  với đúng một mã phù hợp. Card cũ được khóa nhất quán cho cả chuột và bàn phím trong
  thời gian chờ.
- Biểu mẫu phụ kiện thêm và xóa được dòng thông số; dữ liệu kỹ thuật ẩn được giữ lại,
  nhưng giá trị người dùng nhập luôn được ưu tiên khi trùng tên.
- Viewport 1366 × 900, 1024 × 900 và 360 × 800 đều có
  `documentElement.scrollWidth <= innerWidth` trên các màn hình trọng yếu đã kiểm tra.
- Console không có lỗi sau hành trình kiểm tra cuối.

## Kiểm tra tự động

- Web unit: 61/61 file, 269/269 test đạt.
- Web lint: đạt, không có cảnh báo.
- Web typecheck: đạt.
- Production build: đạt; tạo đủ 36/36 trang.
- API catalog backoffice: 4/4 file, 26/26 test đạt; API typecheck đạt.
- Browser QA được thực hiện bằng Chrome điều khiển tự động; không chạy Playwright CLI
  hoặc PostgreSQL/Docker integration trong lượt nghiệm thu này.

final result: passed
