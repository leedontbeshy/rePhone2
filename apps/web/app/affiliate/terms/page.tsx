import Link from 'next/link';
import { StorefrontFrame } from '@/components/storefront/storefront-frame';
import partnerStyles from '@/components/partners/partner.module.css';
import styles from '@/components/affiliate/affiliate.module.css';
export const metadata = { title: 'Điều khoản cộng tác viên | rePhone' };
export default function Page() {
  return (
    <StorefrontFrame>
      <div className={partnerStyles.page}>
        <article className={[styles.card, styles.document].join(' ')}>
          <span className={styles.eyebrow}>affiliate-v1.0</span>
          <h1>Chương trình cộng tác viên rePhone</h1>
          <p>
            Tham gia miễn phí sau khi hồ sơ được duyệt. Bạn giới thiệu iPhone; khách đặt hàng, thanh
            toán và nhận bảo hành trực tiếp tại rePhone. Chương trình chỉ có một cấp, không trả
            thưởng tuyển người.
          </p>
          <h2>Ghi nhận đơn giới thiệu</h2>
          <p>
            Lượt mở link hợp lệ gần nhất được ghi nhận trong 30 ngày trên cùng trình duyệt. Trình
            duyệt cần cho phép cookie. Đơn đã đặt không được gán thêm hoặc đổi người giới thiệu.
            Không ghi nhận tự mua qua link của mình, phụ kiện hay đơn đại lý.
          </p>
          <h2>Cách tính hoa hồng</h2>
          <p>
            Hoa hồng dựa trên tiền iPhone sau giảm giá, không gồm phí giao hàng. Tỷ lệ tùy chương
            trình và từng máy, tối đa 5%; hoa hồng có thể giảm để bảo đảm mức lợi nhuận tối thiểu
            của máy. Số tiền trên trang link chỉ là dự kiến. Chính sách và hoa hồng của đơn được
            chốt khi đặt hàng.
          </p>
          <h2>Khi nào được rút tiền?</h2>
          <p>
            Hoa hồng khả dụng sau 14 ngày tính từ thời điểm muộn hơn giữa hoàn tất đơn và thu đủ
            tiền. Đơn đang xử lý hậu mãi hoặc hoàn tiền được tạm giữ. Bạn có thể yêu cầu rút toàn bộ
            số dư khả dụng từ 200.000đ, mỗi lần chỉ có một yêu cầu đang xử lý.
          </p>
          <h2>Tài khoản nhận tiền</h2>
          <p>
            Tài khoản cần được bạn xác nhận qua email và rePhone xác minh. Tài khoản đầu tiên có
            hiệu lực ngay sau khi duyệt; thay thế tài khoản có thời gian chờ 24 giờ. Yêu cầu rút
            tiền đã gửi giữ nguyên tài khoản nhận tại thời điểm gửi.
          </p>
          <h2>Hủy đơn và hoàn tiền</h2>
          <p>
            Hoa hồng chưa chi sẽ được tính lại khi khách được hoàn tiền iPhone. Hoàn phí giao hàng,
            phụ kiện hoặc tiền chuyển thừa không làm giảm hoa hồng iPhone. Khoản hoa hồng đã trả
            không bị truy thu; tài khoản không phát sinh số dư âm vì hoàn tiền sau đó.
          </p>
          <h2>Giới thiệu trung thực</h2>
          <p>
            Không tự mua để nhận hoa hồng, mạo danh rePhone, gây hiểu nhầm về tình trạng máy, gửi
            spam hay tạo đơn giả. rePhone có thể tạm dừng giới thiệu mới và đối soát các khoản nghi
            ngờ, có lưu lý do xử lý. Việc đóng chương trình không tự hủy hoa hồng đã phát sinh hợp
            lệ.
          </p>
          <Link href="/affiliate">Về cổng cộng tác viên</Link>
        </article>
      </div>
    </StorefrontFrame>
  );
}
