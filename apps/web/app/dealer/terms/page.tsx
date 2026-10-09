import Link from 'next/link';
import { StorefrontFrame } from '@/components/storefront/storefront-frame';
import partnerStyles from '@/components/partners/partner.module.css';
import styles from '@/components/dealer/dealer.module.css';
export default function Page() {
  return (
    <StorefrontFrame>
      <div className={partnerStyles.page}>
        <Link href="/dealer">← Cổng đại lý</Link>
        <article className={styles.document}>
          <h1>Điều khoản chương trình đại lý thử nghiệm</h1>
          <p>Phiên bản dealer-v1.0</p>
          <h2>Vai trò và thanh toán</h2>
          <p>
            Đại lý là bên bán cho khách cuối, tự quyết định giá, thu tiền, cung cấp chứng từ bán
            hàng và tiếp nhận yêu cầu đầu tiên. rePhone bán máy cho đại lý, kiểm định, giao trực
            tiếp và thực hiện bảo hành theo chính sách đã chốt trong đơn.
          </p>
          <p>
            Mỗi đơn có một máy. Đại lý thanh toán đủ giá máy và phí giao cho rePhone trước khi xuất
            hàng. Không áp dụng COD, công nợ hoặc voucher bán lẻ. Chứng từ tải lên cần được đối
            chiếu với giao dịch ngân hàng thực nhận.
          </p>
          <h2>Giữ máy, giao và hậu mãi</h2>
          <p>
            Việc xem giá không giữ máy. Máy được giữ khi tạo đơn thành công, với thời hạn và số tiền
            hiển thị trong đơn. Khi chứng từ đang chờ duyệt, thời gian chờ nộp được tạm dừng. Nếu
            nhận thiếu tiền, hạn bổ sung được thiết lập một lần; chuyển thêm không kéo dài hạn đó.
            Tiền đến sau khi đơn hủy không khôi phục đơn.
          </p>
          <p>
            Đại lý không được thay đổi kết quả kiểm định, quảng cáo máy cũ thành máy mới hoặc tự
            nhận là chi nhánh rePhone. Khách cần thấy rõ tên bên bán, rePhone là đơn vị kiểm định /
            bảo hành và kênh hỗ trợ dự phòng trên phiếu bảo hành.
          </p>
          <p>
            rePhone hoàn tiền cho đại lý theo giao dịch giữa hai bên, không theo giá bán cuối. Đại
            lý chịu trách nhiệm hoàn tiền cho khách của mình. Việc đổi máy khác giá được xử lý bằng
            hoàn đơn cũ và tạo đơn mới, với sự đồng ý của các bên.
          </p>
          <h2>Tài khoản, dữ liệu và kết nối</h2>
          <p>
            Thông tin pháp nhân, tên miền và tài khoản nhận hoàn phải chính xác. Thay tài khoản nhận
            hoàn cần xác nhận email, duyệt của rePhone và thời gian chờ 24 giờ. Các khoản hoàn đang
            xử lý giữ tài khoản đã chốt, trừ quy trình điều chỉnh có ghi nhận.
          </p>
          <p>
            Giá đại lý và khóa API là thông tin nội bộ. Chỉ sử dụng API trên máy chủ, tại tên miền
            đã được duyệt. Không tiết lộ khóa, giá sỉ hay dữ liệu khách. Chỉ xử lý dữ liệu người
            nhận để thực hiện giao hàng và hậu mãi đã được khách đồng ý.
          </p>
          <p>
            rePhone có thể tạm ngừng đơn mới khi phát hiện lạm dụng giữ máy, thông tin sai hoặc vi
            phạm điều khoản. Các nghĩa vụ với đơn cũ vẫn được xử lý. Khi có rủi ro bảo mật, quyền
            truy cập bị thu hồi và nhân viên rePhone tiếp quản đơn đang mở.
          </p>
          <h2>Phạm vi thử nghiệm</h2>
          <p>
            Dữ liệu TEST không có giá trị mua bán và không được chuyển tiền thật. Trước khi mở bán
            LIVE, hai bên phải hoàn tất duyệt hồ sơ và thỏa thuận vận hành về chứng từ, phí giao /
            hoàn, bảo hành, tiếp nhận khi đại lý ngừng hoạt động và bảo vệ dữ liệu khách.
          </p>
        </article>
      </div>
    </StorefrontFrame>
  );
}
