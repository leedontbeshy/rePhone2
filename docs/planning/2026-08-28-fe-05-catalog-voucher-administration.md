# FE-05 — Quản trị danh mục và mã ưu đãi

> Ngày chốt: 2026-08-28  
> Trạng thái: IN PROGRESS  
> Nhánh: `codex/feat-fe-05-catalog-vouchers`

## 1. Mục tiêu đã chốt

FE-05 bổ sung sáu màn hình backoffice cho quản trị sản phẩm, biến thể, hình ảnh và mã ưu đãi. Giao diện phải thay thế việc thao tác qua Swagger, nhưng không thay đổi state machine hoặc quyền hiện có của backend.

- Nhân viên và quản trị viên được dùng ba màn hình Catalog.
- Chỉ quản trị viên được dùng ba màn hình Mã ưu đãi.
- Biến thể và hình ảnh nằm trong trang chi tiết sản phẩm; không tạo route riêng ngoài contract.
- Form dùng trường có kiểu, selector theo tên và lựa chọn nghiệp vụ; không yêu cầu người dùng nhập UUID hoặc JSON.
- Sáu route FE-05 dùng `BackofficeShell`; các trang backoffice cũ chưa được chuyển shell trong phase này.

## 2. Màn hình và nguồn hình ảnh

| Route | Nguồn hình ảnh đã duyệt |
| --- | --- |
| `/backoffice/catalog/products` | `docs/assets/ui/fe-05/catalog-list-desktop.png` |
| `/backoffice/catalog/products/new` | `docs/assets/ui/fe-05/catalog-create-desktop.png` |
| `/backoffice/catalog/products/[id]` | `docs/assets/ui/fe-05/catalog-detail-desktop.png` |
| `/backoffice/vouchers` | `docs/assets/ui/fe-05/vouchers-list-desktop.png` |
| `/backoffice/vouchers/new` | `docs/assets/ui/fe-05/voucher-create-desktop.png` |
| `/backoffice/vouchers/[id]` | `docs/assets/ui/fe-05/voucher-detail-desktop.png` |

Hướng được chọn là phương án 3: danh sách dạng visual board hai cột trên desktop, hàng ngang có hình ảnh hoặc mã nhận diện, metadata căn thẳng hàng, trạng thái dễ quét và mật độ vừa phải. Đây là nguồn sự thật về nhịp bố cục và thứ bậc thị giác; dữ liệu minh họa trong ảnh không thay thế dữ liệu backend.

## 3. Quyết định giao diện

- Giữ token rePhone hiện có: canvas sáng, surface trắng, chữ navy, primary teal, border mảnh, radius 8–10 px và shadow tiết chế.
- Sidebar rộng khoảng 240 px, topbar khoảng 64 px; mobile chuyển sang điều hướng gọn và nội dung xếp một cột.
- Catalog list dùng board hai cột ở desktop, một cột ở tablet/mobile; filter và phân trang vẫn do server làm nguồn dữ liệu.
- Product form tách thông tin cơ bản, thông số theo loại, bảo hành và nội dung tìm kiếm. Product detail nhúng danh sách biến thể và media manager.
- Voucher form dùng rule builder có điều kiện cho kiểu giảm, phạm vi, thời gian, hạn mức và đối tượng nhìn thấy. Detail có lifecycle rail và lịch sử sử dụng phân trang.
- Copy backoffice dùng tiếng Việt tự nhiên như “Danh mục”, “Biến thể”, “Tải ảnh”, “Mã ưu đãi”. Không hiển thị enum tiếng Anh, UUID, JSON hoặc thuật ngữ triển khai.
- Mọi command terminal hoặc thay đổi trạng thái quan trọng đều có dialog xác nhận; pause/archive yêu cầu lý do đúng contract.

## 4. Điều chỉnh contract cần thiết

Các thay đổi sau chỉ hoàn thiện projection/OpenAPI cho UI, không nới lỏng nghiệp vụ:

1. Trả media của từng biến thể trong product detail để có thể quản lý lại sau khi tải trang.
2. Mô tả `scopeConfig` của mã ưu đãi bằng schema có các trường `productType`, `productIds`, `variantIds`; service vẫn xác thực strict theo `scopeType`.
3. Client upload phải nhận `Blob`/`File` thay vì buộc cast chuỗi.
4. `UpdateProductDto.brand` phải optional đúng runtime partial update.
5. Lịch sử dùng mã ưu đãi cần mã đơn và thông tin khách hàng thân thiện để UI không hiển thị UUID thô.

Sau mỗi command, UI refetch dữ liệu authoritative. Không tự retry publish, archive, activate hoặc pause khi nhận conflict.

## 5. Giả định và giới hạn

- Quy mô mục tiêu 20–50 người dùng đồng thời; mọi list tiếp tục phân trang phía server.
- Responsive bắt buộc 360–1440 px; desktop ưu tiên mật độ, mobile ưu tiên thứ tự tác vụ.
- Upload chỉ nhận JPEG, PNG hoặc WebP, tối đa 8 MiB và hiển thị lỗi 413/415/503 bằng tiếng Việt.
- Không làm bulk import, campaign engine, generic JSON editor, unit media hoặc inventory workflow của FE-06.
- Không chuyển toàn bộ backoffice legacy sang shell mới trong FE-05.

## 6. Chia commit

1. `fix(web): align FE-04 coverage ledger`
2. `docs(fe): start catalog voucher administration`
3. `feat(api): expose catalog administration projections`
4. `feat(api): expose typed voucher administration projections`
5. `feat(web): add FE-05 backoffice workspace`
6. `feat(web): add product catalog list and creation`
7. `feat(web): add product lifecycle and variants`
8. `feat(web): add catalog media manager`
9. `feat(web): add voucher list and creation`
10. `feat(web): add voucher lifecycle and usage history`
11. `test(web): verify catalog and voucher administration`
12. `docs(fe): close catalog voucher administration`

Mỗi commit chạy test tập trung, lint, typecheck và coverage contract tương ứng trước khi chuyển sang lát cắt tiếp theo.

## 7. Điều kiện nghiệm thu

- 22/22 operation FE-05 có UI và evidence tự động.
- EMPLOYEE không nhìn thấy hoặc truy cập được Mã ưu đãi; ADMIN dùng đủ lifecycle.
- Catalog publish/archive, variant activate/archive và media upload/update/delete tuân thủ backend.
- Voucher DRAFT/ACTIVE/PAUSED/ARCHIVED và usage pagination hiển thị đúng tiếng Việt.
- Không có raw UUID/JSON/enum kỹ thuật trong UI.
- Browser flow, accessibility, responsive overflow, lint, typecheck, test và production build đều xanh.
- `design-qa.md` so sánh implementation với sáu mockup và có `final result: passed` trước khi bàn giao.
