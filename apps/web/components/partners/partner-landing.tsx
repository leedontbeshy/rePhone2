'use client';

import Link from 'next/link';
import styles from './partner.module.css';

export function PartnerLanding({
  kind,
  signedIn = false,
}: {
  kind: 'affiliate' | 'dealer';
  signedIn?: boolean;
}) {
  const affiliate = kind === 'affiliate';
  const destination = affiliate ? '/affiliate' : '/dealer';
  const join = signedIn ? '#dang-ky' : `/login?returnTo=${encodeURIComponent(destination)}`;
  const steps = affiliate
    ? [
        [
          'Đăng ký cộng tác viên',
          'Gửi thông tin liên hệ và kênh bạn muốn giới thiệu sản phẩm. rePhone xét duyệt trước khi kích hoạt tài khoản.',
        ],
        [
          'Chia sẻ link sản phẩm',
          'Chọn iPhone trong kho, sao chép link và gửi cho người có nhu cầu. Khách bấm link sẽ đến thẳng trang máy.',
        ],
        [
          'Theo dõi và nhận hoa hồng',
          'Hoa hồng từ đơn hợp lệ được cập nhật trong tài khoản. Khi đủ điều kiện, bạn gửi yêu cầu nhận tiền qua ngân hàng.',
        ],
      ]
    : [
        [
          'Đăng ký đối tác',
          'Gửi thông tin kinh doanh và thương hiệu cửa hàng. Hoàn tất xét duyệt hồ sơ, xác minh tài khoản nhận hoàn.',
        ],
        [
          'Chọn máy, đặt đơn',
          'Xem tình trạng và giá đại lý của từng máy. Bạn tự bán, thu tiền khách và thanh toán đơn cho rePhone.',
        ],
        [
          'rePhone giao hàng',
          'Máy được giao trực tiếp đến người nhận sau khi đơn thanh toán đủ. Bạn theo dõi giao hàng và yêu cầu hậu mãi trên cổng.',
        ],
      ];
  const faqs = affiliate
    ? [
        [
          'Tôi có cần nhập hàng hoặc đóng phí tham gia không?',
          'Không. Bạn chỉ giới thiệu sản phẩm qua đường link riêng. rePhone trực tiếp tư vấn, thu tiền, giao máy và bảo hành. Chương trình một cấp, không trả thưởng tuyển người.',
        ],
        [
          'Hoa hồng được tính như thế nào?',
          'Hoa hồng tính trên tiền iPhone sau giảm giá, không gồm phí vận chuyển. Tỷ lệ tùy chương trình và từng máy, tối đa 5%, có giới hạn để bảo đảm lợi nhuận của máy. Số tiền được chốt khi khách đặt hàng; hoàn tiền có thể làm giảm khoản chưa chi.',
        ],
        [
          'Khi nào tôi được rút hoa hồng?',
          'Sau 14 ngày kể từ thời điểm muộn hơn giữa hoàn tất đơn và thu đủ tiền, nếu không có vướng mắc hậu mãi hoặc hoàn tiền. Bạn có thể rút toàn bộ số dư khả dụng từ 200.000đ về tài khoản ngân hàng đã xác minh.',
        ],
        [
          'Khách không mua ngay thì có được ghi nhận không?',
          'Link hợp lệ gần nhất được ghi nhận trong 30 ngày trên cùng trình duyệt có cookie. Chương trình áp dụng cho iPhone bán lẻ, không áp dụng cho tự mua, phụ kiện hoặc đơn đại lý.',
        ],
      ]
    : [
        [
          'Đại lý hưởng lợi nhuận như thế nào?',
          'Bạn mua theo giá đại lý rePhone cung cấp và tự quyết định giá bán cho khách. Phần chênh lệch thuộc về bạn trước chi phí bán hàng, vận chuyển và các nghĩa vụ liên quan. Giá được xác định riêng cho từng máy.',
        ],
        [
          'Chưa có website thì có tham gia được không?',
          'Có. Bạn có thể chọn máy và đặt hàng ngay trên cổng đại lý. Khi có website riêng, bạn có thể tích hợp API để đồng bộ kho máy và đơn hàng, thử kết nối trong sandbox trước khi dùng môi trường thực tế.',
        ],
        [
          'Tôi thanh toán đơn hàng như thế nào?',
          'Mỗi đơn đại lý gồm một máy. Đại lý thanh toán đủ giá máy và phí giao hàng cho rePhone trước khi xuất hàng. Hiện chưa hỗ trợ COD hoặc công nợ.',
        ],
        [
          'Ai hỗ trợ khách khi máy gặp vấn đề?',
          'Đại lý là bên bán và tiếp nhận hỗ trợ ban đầu. rePhone phụ trách kiểm định, giao hàng và thực hiện bảo hành theo chính sách đã chốt. Khoản hoàn từ rePhone trả về đại lý; đại lý hoàn cho khách của mình.',
        ],
      ];
  const facts = affiliate
    ? [
        ['Hoa hồng', 'Tối đa 5%'],
        ['Ghi nhận link hợp lệ', '30 ngày'],
        ['Yêu cầu rút từ', '200.000đ'],
      ]
    : [
        ['Giá mua', 'Giá riêng từng máy'],
        ['Giá bán cho khách', 'Bạn quyết định'],
        ['Đặt hàng', 'Qua cổng hoặc API'],
      ];
  return (
    <div className={styles.landing}>
      <header className={styles.intro}>
        <div className={styles.introCopy}>
          <p className={styles.kicker}>
            {affiliate ? 'Cộng tác viên rePhone' : 'Đối tác kinh doanh'}
          </p>
          <h1>
            {affiliate
              ? 'Giới thiệu iPhone và nhận hoa hồng cùng rePhone.'
              : 'Chương trình đại lý rePhone.'}
          </h1>
          <p className={styles.description}>
            {affiliate
              ? 'Chia sẻ sản phẩm đến người đang cần mua máy. Bạn nhận hoa hồng từ đơn hàng hợp lệ, rePhone phụ trách tư vấn, giao hàng và bảo hành.'
              : 'Kinh doanh iPhone từ nguồn máy của rePhone. Bạn chủ động giá bán và chăm sóc khách hàng; rePhone cung cấp máy, giao trực tiếp và thực hiện bảo hành.'}
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryLink} href={join}>
              {affiliate ? 'Đăng ký cộng tác viên' : 'Đăng ký đại lý'}
            </Link>
            <Link
              className={styles.textLink}
              href={affiliate ? '#cach-tham-gia' : '/dealer/api-guide'}
            >
              {affiliate ? 'Cách tham gia' : 'Tìm hiểu kết nối API'}{' '}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <p className={styles.note}>
            {affiliate
              ? 'Tham gia miễn phí. Không cần nhập hàng.'
              : 'Có thể bắt đầu ngay trên cổng, chưa cần website riêng.'}
          </p>
        </div>
        <section className={styles.programInfo} aria-label="Thông tin chương trình">
          <h2>{affiliate ? 'Thông tin hoa hồng' : 'Hình thức hợp tác'}</h2>
          <dl>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>
            {affiliate
              ? 'Mức cụ thể tùy chính sách và từng máy, có giới hạn theo lợi nhuận. Xem hoa hồng dự kiến trước khi chia sẻ.'
              : 'Đại lý thanh toán cho rePhone theo từng đơn. Phần chênh lệch giá bán là doanh thu của bạn trước chi phí.'}
          </p>
          <Link className={styles.textLink} href={`${destination}/terms`}>
            Xem điều khoản chương trình <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </header>
      <section className={styles.process} id="cach-tham-gia">
        <h2>{affiliate ? 'Tham gia như thế nào?' : 'Đặt hàng với rePhone như thế nào?'}</h2>
        <ol className={styles.steps}>
          {steps.map(([title, description], index) => (
            <li key={title}>
              <span className={styles.stepNumber}>Bước {index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className={styles.questions}>
        <div className={styles.questionHeading}>
          <h2>Câu hỏi thường gặp</h2>
          <p>
            {affiliate
              ? 'Một vài thông tin cần biết trước khi bắt đầu.'
              : 'Tìm hiểu cách bán hàng, thanh toán và hỗ trợ khách.'}
          </p>
        </div>
        <div className={styles.faqs}>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      {!signedIn && (
        <div className={styles.joinLine}>
          <p>
            {affiliate
              ? 'Bạn đã sẵn sàng trở thành cộng tác viên?'
              : 'Bạn muốn đăng ký cửa hàng làm đại lý?'}
            <span>Đăng nhập hoặc tạo tài khoản rePhone để gửi hồ sơ.</span>
          </p>
          <Link className={styles.primaryLink} href={join}>
            {affiliate ? 'Đăng ký tham gia' : 'Gửi hồ sơ đại lý'}
          </Link>
        </div>
      )}
    </div>
  );
}
