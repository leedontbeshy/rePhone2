# Tầm nhìn và phạm vi sản phẩm

## 1. Tầm nhìn

rePhone là website thương mại điện tử cho một cửa hàng bán iPhone cũ và phụ kiện. Điểm khác biệt cốt lõi là tính minh bạch của từng máy: ảnh thật, định danh nội bộ, tình trạng pin, ngoại hình, kiểm định, lịch sử sửa chữa đã biết, giá và bảo hành riêng.

Dự án là đồ án tốt nghiệp có thời gian triển khai dự kiến một tháng và đồng thời là sản phẩm portfolio/CV. Ưu tiên cao nhất là hoàn thiện luồng end-to-end, code dễ giải thích, tài liệu tốt và kiểm thử các bài toán cốt lõi; không mô phỏng mọi yêu cầu của một hệ thống production.

## 2. Người dùng

- `ADMIN`: quản trị hệ thống, nhân viên, cấu hình và toàn bộ nghiệp vụ.
- `EMPLOYEE`: vận hành sản phẩm, tồn kho, đơn hàng, thanh toán, giao nhận và hậu mãi.
- `CUSTOMER`: quản lý hồ sơ, địa chỉ, đơn hàng, yêu thích và bảo hành của mình.
- `GUEST`: xem catalog, dùng giỏ hàng, voucher công khai và đặt hàng không cần tài khoản.

## 3. Phạm vi sản phẩm

### iPhone cũ

- Mỗi máy vật lý là một `InventoryUnit` duy nhất.
- Mỗi máy có mã tồn kho, IMEI/serial/EID nếu có, tình trạng khóa mạng, pin, kiểm định, ảnh thật, giá và bảo hành riêng.
- Một máy chỉ có thể thuộc tối đa một reservation đang hoạt động và không được bán cho hai đơn.

### Phụ kiện

- Quản lý theo sản phẩm, biến thể/SKU và số lượng.
- Theo dõi tồn thực tế, tồn đang giữ, vị trí và lịch sử biến động.
- Có thể khai báo thiết bị tương thích và thuộc tính cơ bản.

## 4. Năng lực MVP

- Catalog, tìm kiếm và bộ lọc.
- Chi tiết từng iPhone và từng sản phẩm phụ kiện.
- Giỏ hàng cho guest và tài khoản.
- Wishlist cho khách đã đăng nhập.
- Voucher cố định hoặc phần trăm, một voucher trên mỗi đơn.
- Checkout giao hàng hoặc nhận tại cửa hàng.
- Cọc thủ công cho đơn giao hàng.
- Quản lý tồn kho, kiểm định, đơn hàng, thanh toán, ship và khách hàng.
- Phát hành bảo hành và theo dõi yêu cầu hậu mãi cơ bản.
- Email quên mật khẩu, mời nhân viên và trạng thái đơn; xác minh email customer được hoãn khỏi MVP demo.
- Audit các thao tác nhạy cảm.

## 5. Tiêu chí thành công

Luồng chính phải hoạt động end-to-end và bảo toàn dữ liệu:

1. Khách tìm được đúng máy và biết rõ tình trạng.
2. Checkout không thể bán trùng một iPhone hoặc giữ quá số lượng phụ kiện.
3. Nhân viên xác minh cọc, xử lý pickup/shipping và hoàn tất đơn.
4. Tồn kho được cập nhật và truy vết được.
5. Bảo hành được phát hành từ dữ liệu đơn đã snapshot.
6. Quyền truy cập và dữ liệu nhạy cảm được bảo vệ đúng role.

## 6. Ngoài phạm vi MVP

- iPad, Apple Watch, MacBook hoặc marketplace nhiều người bán.
- Nhiều chi nhánh, nhiều pháp nhân hoặc kiến trúc multi-tenant.
- SePay và đối soát ngân hàng tự động.
- API tạo/đồng bộ vận đơn với hãng vận chuyển.
- Đánh giá sản phẩm, tích điểm, flash sale, referral và recommendation engine.
- Quản lý sửa chữa, kỹ thuật viên, linh kiện và chi phí sửa chữa chi tiết.
- Mobile app, microservice, Redis/queue bắt buộc và Elasticsearch.
- Dark mode hoặc animation UI phức tạp trong giai đoạn core.

## 7. Giả định vận hành

- Một cửa hàng và một kho là hai vị trí tồn kho logic.
- Ngôn ngữ tiếng Việt, tiền tệ VND, múi giờ nghiệp vụ `Asia/Ho_Chi_Minh`.
- Dữ liệu thời gian lưu UTC và chuyển đổi khi hiển thị.
- Một người phát triển chính chịu trách nhiệm triển khai và bảo trì ban đầu.
