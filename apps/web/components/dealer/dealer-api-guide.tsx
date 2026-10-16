'use client';
import Link from 'next/link';
import {
  BookOpenIcon as BookOpen,
  ArrowLeftIcon,
  ArrowRightIcon as ArrowRight,
  ShieldCheckIcon as ShieldCheck,
} from '@phosphor-icons/react';
import { DealerCode, DealerWorkspaceHeader } from './dealer-workspace';
import { DealerApiReference } from './dealer-api-reference';
import styles from './dealer.module.css';

const sections = [
  ['connect', 'Gọi API đầu tiên'],
  ['reference', 'Danh sách 16 API'],
  ['start', 'Bắt đầu'],
  ['connection', 'Cấu hình kết nối'],
  ['keys', 'Tạo khóa kết nối'],
  ['catalog', 'Đọc kho máy'],
  ['orders', 'Tạo đơn đầu tiên'],
  ['payments', 'Thanh toán & hậu mãi'],
  ['webhooks', 'Nhận webhook'],
  ['errors', 'Xử lý lỗi kết nối'],
] as const;
const scopes = [
  ['catalog:read', 'Đọc kho máy và giá đại lý'],
  ['orders:read', 'Đọc đơn và trạng thái giao hàng'],
  ['orders:write', 'Xem lại, tạo và hủy đơn'],
  ['payments:read', 'Đọc yêu cầu thanh toán và hoàn tiền'],
  ['payments:write', 'Nộp chứng từ thanh toán'],
  ['after-sales:read', 'Đọc hậu mãi và phiếu bảo hành'],
  ['after-sales:write', 'Tạo yêu cầu hậu mãi, bổ sung chứng từ'],
] as const;

export function DealerApiGuide({
  apiBaseUrl,
  currentEnvironment,
}: {
  apiBaseUrl: string;
  currentEnvironment: 'TEST' | 'LIVE';
}) {
  const connectionBase = apiBaseUrl || '<DIA_CHI_API_DO_REPHONE_CAP>/api/v1';
  return (
    <div className={styles.page}>
      <DealerWorkspaceHeader
        title="Tích hợp API đại lý"
        description="Tạo khóa, gọi yêu cầu đầu tiên, sau đó tra cứu đầy đủ 16 API để đọc kho, đặt đơn, thanh toán và hậu mãi."
        test={currentEnvironment === 'TEST'}
      >
        <Link href="/dealer" className={styles.secondaryLink}>
          <ArrowLeftIcon size={18} aria-hidden /> Cổng đại lý
        </Link>
      </DealerWorkspaceHeader>
      <div className={styles.actions}>
        <a href="#connect" className={styles.primaryLink}>
          Kết nối lần đầu
        </a>
        <a href="#reference" className={styles.secondaryLink}>
          Tra cứu danh sách API
        </a>
      </div>
      <div className={styles.guideLayout}>
        <nav className={styles.guideNavigation} aria-label="Mục lục hướng dẫn">
          <span>
            <BookOpen size={18} aria-hidden />
            Trong hướng dẫn
          </span>
          {sections.map(([id, label], index) => (
            <a key={id} href={`#${id}`}>
              <small>{String(index + 1).padStart(2, '0')}</small>
              {label}
            </a>
          ))}
        </nav>
        <article className={styles.guideArticle}>
          <section id="connect" className={styles.guideSection}>
            <span className={styles.eyebrow}>Bắt đầu tại đây</span>
            <h2>Gọi API đầu tiên trong 4 bước</h2>
            <p>
              Bạn đang kết nối hệ thống của cửa hàng mình với rePhone. Thực hiện các bước dưới đây
              trên máy chủ hoặc máy phát triển của bạn; chưa cần tạo đơn hay cấu hình webhook để
              kiểm tra khóa đọc kho.
            </p>
            <ol>
              <li>
                <strong>Đăng nhập cổng đại lý.</strong> Mở <Link href="/dealer">Cổng đại lý</Link>{' '}
                để đăng nhập và tạo khóa. Nếu chưa có tài khoản hoặc hồ sơ chưa được duyệt hoạt
                động, liên hệ rePhone trước khi tạo khóa. Xem{' '}
                <a href="#connection">cấu hình kết nối</a> bên dưới.
              </li>
              <li>
                <strong>Tạo khóa trong Kết nối website → Tạo khóa API.</strong> Để thử đọc kho, chọn{' '}
                <strong>Chỉ đọc kho và đơn</strong>. Khi cần nhận và xử lý đơn hàng, chọn{' '}
                <strong>Đặt hàng, thanh toán và hậu mãi</strong>. Xác nhận mật khẩu, sao chép toàn
                bộ khóa vừa hiện và lưu trên máy chủ của bạn.
              </li>
              <li>
                <strong>Chạy lệnh bên dưới.</strong> Thay giá trị mẫu của{' '}
                <code>REPHONE_DEALER_KEY</code> bằng toàn bộ khóa vừa tạo. URL đã gồm{' '}
                <code>/api/v1</code>; đừng nối tiền tố này thêm lần nữa.
              </li>
              <li>
                <strong>Kiểm tra HTTP 200 và đối tượng data.</strong> Như vậy URL và khóa đã dùng
                được cho API đọc kho. Khi có nhu cầu mua máy, dùng <code>inventoryUnitId</code> từ{' '}
                <code>data.items</code> để thực hiện <a href="#orders">luồng tạo đơn</a>.
              </li>
            </ol>
            {apiBaseUrl === '' ? (
              <p role="status">
                Chưa có địa chỉ API được cấu hình trên trang này. Hãy lấy URL từ rePhone trước khi
                chạy lệnh; phần địa chỉ mẫu bên dưới chưa dùng để kết nối được.
              </p>
            ) : null}
            {apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1') ? (
              <p>
                Đây là địa chỉ chạy trên máy phát triển. <code>localhost</code> chỉ trỏ đến máy đang
                chạy lệnh; website trên máy chủ khác cần URL công khai do rePhone cung cấp.
              </p>
            ) : null}
            <DealerCode
              label="Bash / WSL · Kết nối đầu tiên bằng cURL"
              code={`export REPHONE_API_BASE_URL=${shellQuote(connectionBase)}
export REPHONE_DEALER_KEY='<TOAN_BO_KHOA_API_DUOC_CAP>'

curl --include \\
  --header "X-Dealer-Api-Key: $REPHONE_DEALER_KEY" \\
  "$REPHONE_API_BASE_URL/dealer/catalog?page=1&pageSize=1"`}
            />
            <DealerCode
              label="HTTP 200 · Ví dụ kho chưa có máy phù hợp"
              code={JSON.stringify(
                { data: { items: [], page: 1, pageSize: 1, revision: 12, hasMore: false } },
                null,
                2,
              )}
            />
            <ul>
              <li>
                <code>data.items: []</code> vẫn là kết nối thành công; hiện không có máy phù hợp.
              </li>
              <li>
                <code>401</code>: kiểm tra toàn bộ khóa, hạn dùng và địa chỉ API được cấp cùng khóa.
              </li>
              <li>
                <code>403</code>: kiểm tra scope và trạng thái hồ sơ; gửi API key trực tiếp từ trình
                duyệt cũng bị từ chối.
              </li>
              <li>
                Không cần đăng nhập API bằng mật khẩu hay gửi cookie để dùng API key từ máy chủ.
              </li>
            </ul>
          </section>
          <section id="reference" className={styles.guideSection}>
            <DealerApiReference />
          </section>
          <section id="start" className={styles.guideSection}>
            <span className={styles.eyebrow}>Tổng quan</span>
            <h2>Website của bạn, nguồn máy từ rePhone</h2>
            <p>
              API giúp website của bạn lấy thông tin máy, giá đại lý và gửi đơn hàng đến rePhone.
              Bạn tự đặt giá bán và thu tiền từ khách, sau đó thanh toán giá đại lý cho rePhone.
              rePhone cung cấp máy, kiểm định, giao hàng và thực hiện bảo hành.
            </p>
            <p>
              Nếu đang tìm hiểu chương trình, bạn có thể bắt đầu với phần tổng quan và{' '}
              <Link href="/dealer/terms">điều khoản đại lý</Link>. Khi sẵn sàng kết nối, hãy gửi
              hướng dẫn này cho người phụ trách kỹ thuật website của bạn; các phần bên dưới có thông
              số và mã mẫu để triển khai.
            </p>
            <div className={styles.integrationFlow}>
              <span>Khách mua tại website bạn</span>
              <ArrowRight aria-hidden />
              <span>Website bạn gửi đơn đến rePhone</span>
              <ArrowRight aria-hidden />
              <span>rePhone giao máy</span>
            </div>
            <div className={styles.note}>
              <ShieldCheck size={20} aria-hidden />
              <p>
                Khóa API (API key) cho phép website truy cập dữ liệu và thực hiện thao tác theo
                quyền bạn cấp. Hãy lưu khóa trên máy chủ của website, giữ bí mật và không đưa vào mã
                chạy trên trình duyệt hoặc biến NEXT_PUBLIC_.
              </p>
            </div>
            <ol>
              <li>Đăng ký hồ sơ tại cổng đại lý nếu bạn chưa tham gia chương trình.</li>
              <li>Sau khi hồ sơ được duyệt, tạo khóa tại Kết nối website.</li>
              <li>
                Đọc danh sách máy để kiểm tra kết nối; xem lại giá và phí giao khi cần đặt máy.
              </li>
              <li>
                Kiểm tra việc cập nhật trạng thái đơn và xử lý lỗi kết nối trên website của bạn.
              </li>
              <li>
                Chỉ tạo đơn khi có nhu cầu mua máy; đơn được xử lý theo quy trình kinh doanh của hai
                bên.
              </li>
            </ol>
          </section>
          <section id="connection" className={styles.guideSection}>
            <span className={styles.eyebrow}>Kết nối website</span>
            <h2>Cấu hình kết nối</h2>
            <p>
              Dùng địa chỉ API dưới đây và toàn bộ khóa được tạo trong tài khoản đại lý của bạn.
            </p>
            <DealerCode
              label="Cấu hình trên máy chủ website của bạn"
              code={`REPHONE_API_BASE_URL=${connectionBase}\nREPHONE_DEALER_KEY=<TOAN_BO_KHOA_API_DUOC_CAP>`}
            />
            <p>
              Địa chỉ trên đã gồm <code>/api/v1</code>. Ví dụ dưới đây chỉ nối thêm{' '}
              <code>/dealer/…</code>.
            </p>
            <p>
              Đọc kho và xem lại giá không giữ máy. Yêu cầu tạo đơn sẽ giữ máy trong kho hiện tại;
              không tạo đơn với thông tin giả chỉ để kiểm tra kết nối.
            </p>
          </section>
          <section id="keys" className={styles.guideSection}>
            <span className={styles.eyebrow}>Xác thực</span>
            <h2>Tạo khóa API cho website của bạn</h2>
            <p>
              Mở <strong>Kết nối website → Tạo khóa API</strong> trong cổng đại lý. Nhập tên để nhận
              biết website, chọn quyền truy cập và xác nhận mật khẩu. Khóa chỉ hiển thị một lần, có
              hạn 90 ngày; bạn có thể giữ tối đa hai khóa còn hiệu lực. Hãy sao chép và lưu khóa an
              toàn trước khi rời trang.
            </p>
            <DealerCode
              label="Header bắt buộc"
              code="X-Dealer-Api-Key: <TOAN_BO_KHOA_API_DUOC_CAP>"
            />
            <div
              className={styles.tableWrap}
              role="region"
              aria-label="Quyền truy cập API"
              tabIndex={0}
            >
              <table className={styles.table} aria-label="Quyền truy cập API">
                <thead>
                  <tr>
                    <th scope="col">Quyền truy cập (scope)</th>
                    <th scope="col">Dùng để</th>
                  </tr>
                </thead>
                <tbody>
                  {scopes.map(([scope, label]) => (
                    <tr key={scope}>
                      <td>
                        <code>{scope}</code>
                      </td>
                      <td>{label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Chọn nhóm quyền phù hợp với các chức năng website cần dùng. Khi thay khóa, cập nhật
              kết nối và kiểm tra khóa mới trước khi thu hồi khóa cũ để tránh gián đoạn. Các khóa
              thuộc cùng tài khoản đại lý dùng chung hạn mức gọi API.
            </p>
          </section>
          <section id="catalog" className={styles.guideSection}>
            <span className={styles.eyebrow}>Lấy sản phẩm</span>
            <h2>Đọc kho máy và giá đại lý</h2>
            <DealerCode
              label="Node.js · Lấy danh sách máy từ máy chủ website của bạn"
              code={`const base = process.env.REPHONE_API_BASE_URL.replace(/\\/$/, '');
const query = new URLSearchParams({
  q: 'iPhone 13', page: '1', pageSize: '12', sort: 'price-asc'
});
const response = await fetch(base + '/dealer/catalog?' + query, {
  headers: { 'X-Dealer-Api-Key': process.env.REPHONE_DEALER_KEY },
  cache: 'no-store'
});
const payload = await response.json();
if (!response.ok) throw new Error(payload.error?.message ?? 'Không đọc được kho');
const { items, hasMore, page, revision } = payload.data;`}
            />
            <ul>
              <li>
                <code>q</code>: tên máy, phiên bản, SKU hoặc mã máy; tối đa 128 ký tự.
              </li>
              <li>
                <code>page</code> bắt đầu từ 1; <code>pageSize</code> từ 1–100. Đọc tiếp khi{' '}
                <code>hasMore = true</code>.
              </li>
              <li>
                <code>sort</code>: newest, price-asc hoặc price-desc. <code>condition</code>: A/B/C
                hoặc bỏ tham số.
              </li>
            </ul>
            <DealerCode
              label="Một máy trong data.items · giá và mã minh họa"
              code={JSON.stringify(
                {
                  inventoryUnitId: '<UUID máy từ API>',
                  inventoryCode: 'IP13-MID-001',
                  productName: 'iPhone 13',
                  variantName: '128GB · Midnight',
                  dealerPrice: '9500000',
                  publicReferencePrice: '10000000',
                  configuration: { batteryHealthPercent: 92, conditionGrade: 'A' },
                  warrantyDays: 90,
                  image: { url: '<ảnh công khai>', altText: 'iPhone 13' },
                },
                null,
                2,
              )}
            />
            <p>
              <code>dealerPrice</code> là giá bạn thanh toán cho rePhone;{' '}
              <code>publicReferencePrice</code> là giá tham khảo trên website rePhone. Bạn tự quyết
              định và lưu giá bán lẻ trên website của mình. Giá trong API là chuỗi số nguyên theo
              đơn vị VND. Việc xem danh sách chưa giữ máy; máy chỉ được giữ khi bạn tạo đơn thành
              công.
            </p>
          </section>
          <section id="orders" className={styles.guideSection}>
            <span className={styles.eyebrow}>Tạo đơn</span>
            <h2>Xem lại giá và phí giao trước khi đặt máy</h2>
            <p>
              Mỗi đơn gồm một máy. Gọi bước xem lại đơn (preview) để nhận giá, phí giao và tình
              trạng máy mới nhất. Sau khi thông tin được xác nhận, website gửi yêu cầu tạo đơn. Nếu
              giá hoặc tình trạng máy thay đổi, hãy thông báo để người mua xem lại lựa chọn.
            </p>
            <div
              className={styles.tableWrap}
              role="region"
              aria-label="Lấy mã ở đâu để gọi API tiếp theo"
              tabIndex={0}
            >
              <table className={styles.table} aria-label="Lấy mã ở đâu để gọi API tiếp theo">
                <thead>
                  <tr>
                    <th scope="col">Giá trị cần lưu</th>
                    <th scope="col">Lấy từ phản hồi</th>
                    <th scope="col">Dùng cho bước nào</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>inventoryUnitId</code>
                    </td>
                    <td>
                      <code>data.items[].inventoryUnitId</code> của API đọc kho
                    </td>
                    <td>Preview và tạo đơn cho đúng chiếc máy đã chọn.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>previewFingerprint</code>
                    </td>
                    <td>
                      <code>data.previewFingerprint</code> của preview
                    </td>
                    <td>Gửi nguyên giá trị khi tạo đơn; không tự tạo hoặc sửa.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>orderId</code>
                    </td>
                    <td>
                      <code>data.order.id</code> khi tạo đơn thành công
                    </td>
                    <td>Đọc đơn, lấy yêu cầu thanh toán, hủy đơn và đọc bảo hành.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>paymentRequestId</code>
                    </td>
                    <td>
                      <code>data[].id</code> của danh sách yêu cầu thanh toán
                    </td>
                    <td>
                      Chọn yêu cầu thanh toán hiện tại để nộp chứng từ; đây là mã khác với mã đơn.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <DealerCode
              label="Node.js · Preview và tạo đơn"
              code={`import { randomUUID } from 'node:crypto';
async function rephone(path, body, idempotencyKey) {
  const response = await fetch(process.env.REPHONE_API_BASE_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dealer-Api-Key': process.env.REPHONE_DEALER_KEY,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error?.message), {
    status: response.status, code: payload.error?.code
  });
  return payload.data;
}
const selection = {
  inventoryUnitId: '<UUID máy lấy từ kho>',
  shippingAddress: {
    receiverName: '<Tên người nhận>', phone: '<Điện thoại>',
    addressLine: '<Địa chỉ giao>', ward: '<Phường/xã>',
    district: '<Quận/huyện>', province: '<Tỉnh/thành phố>'
  }
};
const preview = await rephone('/dealer/orders/preview', selection);
// Hiển thị giá/phí giao và lấy xác nhận trước bước tạo đơn.
const command = {
  ...selection, previewFingerprint: preview.previewFingerprint,
  externalOrderId: 'SHOP-ORDER-0001',
  contact: { fullName: '<Tên liên hệ>', email: '<Email>', phone: '<Điện thoại>' }
};
const idempotencyKey = randomUUID();
// Chỉ tạo đơn sau khi người mua xác nhận nhu cầu mua máy.
// Lưu command và idempotencyKey trong hệ thống của bạn trước khi gửi.
const { order, replayed } = await rephone('/dealer/orders', command, idempotencyKey);
// Timeout: đọc command/key đã lưu và gọi lại đúng yêu cầu đó.`}
            />
            <div
              className={styles.tableWrap}
              role="region"
              aria-label="Tình huống đặt hàng"
              tabIndex={0}
            >
              <table className={styles.table} aria-label="Tình huống đặt hàng">
                <thead>
                  <tr>
                    <th scope="col">Tình huống</th>
                    <th scope="col">Cách xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Mất kết nối</td>
                    <td>Gửi lại cùng key và payload. Không tạo externalOrderId mới.</td>
                  </tr>
                  <tr>
                    <td>Cùng khóa chống trùng, khác nội dung yêu cầu</td>
                    <td>409: kiểm tra yêu cầu đã lưu.</td>
                  </tr>
                  <tr>
                    <td>Giá hoặc tồn thay đổi</td>
                    <td>Đọc kho, preview lại và xin xác nhận trước yêu cầu mới.</td>
                  </tr>
                  <tr>
                    <td>Địa chỉ cần báo phí riêng</td>
                    <td>Liên hệ rePhone cấp shippingQuoteId; dùng cùng mã ở preview và create.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <code>Idempotency-Key</code> là khóa chống tạo trùng đơn, khác với khóa API dùng để
              xác thực. Khóa này dài 16–128 ký tự và phải được giữ nguyên khi gửi lại cùng một yêu
              cầu. <code>externalOrderId</code> là mã đơn trên website của bạn; dùng một mã riêng
              cho mỗi đơn. rePhone xác định giá từ kho máy và nhận diện đại lý qua khóa API.
            </p>
          </section>
          <section id="payments" className={styles.guideSection}>
            <span className={styles.eyebrow}>Sau khi đặt đơn</span>
            <h2>Thanh toán, giao hàng và hậu mãi</h2>
            <p>
              Sau khi tạo đơn, lấy hướng dẫn thanh toán bằng{' '}
              <code>GET /dealer/orders/:id/payment-requests</code>. Chuyển khoản theo thông tin của
              đơn và gửi chứng từ qua <code>POST /dealer/payment-requests/:id/proofs</code>, dùng
              multipart field <code>file</code>. Đơn được tiếp tục xử lý sau khi rePhone đối chiếu
              và xác nhận đã nhận đủ tiền; việc gửi ảnh chứng từ chưa phải xác nhận thanh toán thành
              công.
            </p>
            <div
              className={styles.tableWrap}
              role="region"
              aria-label="Thanh toán và hậu mãi"
              tabIndex={0}
            >
              <table className={styles.table} aria-label="Thanh toán và hậu mãi">
                <thead>
                  <tr>
                    <th scope="col">Thao tác</th>
                    <th scope="col">Endpoint</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Theo dõi đơn', 'GET /dealer/orders/:id'],
                    ['Danh sách đơn', 'GET /dealer/orders?page=1'],
                    ['Hủy đơn theo điều kiện hiện tại', 'POST /dealer/orders/:id/cancel'],
                    ['Theo dõi hoàn tiền', 'GET /dealer/refunds'],
                    ['Tạo / đọc hậu mãi', 'POST / GET /dealer/after-sales'],
                    ['Phiếu bảo hành cho khách', 'GET /dealer/orders/:id/warranties'],
                  ].map(([label, path]) => (
                    <tr key={path}>
                      <td>{label}</td>
                      <td>
                        <code>{path}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Trên website bán hàng, hãy hiển thị giá bán lẻ và hướng dẫn thanh toán của cửa hàng
              bạn. Giá đại lý, QR thanh toán cho rePhone và chứng từ giữa hai bên cần được giữ trong
              khu vực dành riêng cho bạn. Khi có khoản hoàn, rePhone hoàn về tài khoản đại lý đã xác
              minh; bạn thực hiện hoàn tiền cho khách theo giao dịch bán lẻ.
            </p>
          </section>
          <section id="webhooks" className={styles.guideSection}>
            <span className={styles.eyebrow}>Đồng bộ trạng thái</span>
            <h2>Nhận và xác thực webhook</h2>
            <p>
              Webhook giúp website của bạn nhận thông báo khi đơn hàng, thanh toán hoặc hậu mãi thay
              đổi. Trong <strong>Kết nối website</strong>, nhập địa chỉ nhận thông báo dùng HTTPS,
              cổng 443 và thuộc tên miền của bạn đã được rePhone duyệt. Địa chỉ cần truy cập được từ
              Internet và không chuyển hướng; localhost hoặc IP nội bộ không dùng được.
            </p>
            <p>
              Khi lưu kết nối, hãy lưu cả mã khóa (keyId) và khóa bí mật webhook (secret) để kiểm
              tra thông báo gửi đến. Khóa này dùng riêng cho webhook, khác với khóa API.
            </p>
            <DealerCode
              label="Header chữ ký"
              code={
                'X-Rephone-Event-Id: <eventId>\nX-Rephone-Timestamp: <Unix timestamp, giây>\nX-Rephone-Signature: <keyId>:<HMAC hex>[,<keyId cũ>:<HMAC hex>]'
              }
            />
            <DealerCode
              label="Node.js · Kiểm tra chữ ký trên bytes gốc"
              code={`import { createHmac, timingSafeEqual } from 'node:crypto';
// Lưu cả keyId và secret được hiển thị sau khi tạo kết nối.
const secretsByKeyId = {
  [process.env.REPHONE_WEBHOOK_KEY_ID]: process.env.REPHONE_WEBHOOK_SECRET
};
export function validWebhook(rawBody, headers, secretsByKeyId) {
  const timestamp = headers['x-rephone-timestamp'];
  const signature = headers['x-rephone-signature'];
  if (typeof timestamp !== 'string' || !/^\\d+$/.test(timestamp)) return false;
  if (typeof signature !== 'string') return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  return signature.split(',').some((part) => {
    const [keyId, hex] = part.trim().split(':');
    const secret = secretsByKeyId[keyId];
    if (!secret || !/^[a-f0-9]{64}$/.test(hex ?? '')) return false;
    const expected = createHmac('sha256', secret)
      .update(timestamp + '.').update(rawBody).digest();
    const received = Buffer.from(hex, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
// rawBody là bytes nhận ban đầu, trước JSON.parse/body parser.
// Xác thực xong: parse JSON, lưu eventId + payload bền vững,
// trả 2xx và để worker của bạn xử lý nghiệp vụ.`}
            />
            <DealerCode
              label="Payload minh họa"
              code={JSON.stringify(
                {
                  eventId: '<UUID sự kiện>',
                  eventType: 'order.updated',
                  resourceType: 'order',
                  resourceId: '<UUID đơn>',
                  resourceVersion: 7,
                  occurredAt: '2026-10-09T08:30:00Z',
                  environment: currentEnvironment,
                  data: { orderId: '<UUID đơn>' },
                },
                null,
                2,
              )}
            />
            <ul>
              <li>Chống trùng bằng eventId; cập nhật theo resourceVersion của từng tài nguyên.</li>
              <li>
                Sự kiện có thể sai thứ tự. Khi thiếu phiên bản, gọi GET lấy trạng thái hiện tại.
              </li>
              <li>
                Trả 2xx sau khi lưu bền vững, không đợi xử lý xong nghiệp vụ. rePhone thử tối đa 7
                lần.
              </li>
              <li>
                Dùng Gửi thông báo thử và Gửi lại thông báo trong cổng đại lý để kiểm tra kết nối.
                Khi đổi khóa bí mật nhưng giữ nguyên địa chỉ nhận, bạn có 24 giờ chuyển tiếp để cập
                nhật website.
              </li>
            </ul>
          </section>
          <section id="errors" className={styles.guideSection}>
            <span className={styles.eyebrow}>Hoàn tất kết nối</span>
            <h2>Xử lý lỗi và kiểm tra trước khi bán thật</h2>
            <p>
              Khi một yêu cầu không thành công, API trả về mã lỗi và nội dung giúp bạn xác định bước
              cần xử lý. Người phụ trách kỹ thuật website có thể đối chiếu bảng bên dưới.
            </p>
            <DealerCode
              label="Dạng phản hồi lỗi"
              code={JSON.stringify(
                {
                  error: {
                    code: 'INVENTORY_NOT_AVAILABLE',
                    message: 'Máy không còn khả dụng.',
                    details: [],
                    requestId: 'request-id-do-api-tra-ve',
                  },
                },
                null,
                2,
              )}
            />
            <div
              className={styles.tableWrap}
              role="region"
              aria-label="Xử lý lỗi kết nối"
              tabIndex={0}
            >
              <table className={styles.table} aria-label="Xử lý lỗi kết nối">
                <thead>
                  <tr>
                    <th scope="col">HTTP</th>
                    <th scope="col">Cần làm gì</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['400', 'Kiểm tra thông tin đã gửi và hướng dẫn trong error.details.'],
                    [
                      '401 / 403',
                      'Kiểm tra khóa API, quyền truy cập và địa chỉ API. Nếu cần, liên hệ rePhone để kiểm tra trạng thái tài khoản.',
                    ],
                    ['404', 'Kiểm tra lại mã máy, mã đơn hoặc dữ liệu bạn đang yêu cầu.'],
                    [
                      '409',
                      'Đọc error.code để biết thông tin nào đã thay đổi; đối chiếu đơn hoặc xem lại giá trước khi thử tiếp.',
                    ],
                    [
                      '422',
                      'Đọc nội dung lỗi và hoàn tất điều kiện được yêu cầu trước khi gửi lại.',
                    ],
                    ['429', 'Đợi theo Retry-After; các key cùng đại lý chia sẻ hạn mức.'],
                    [
                      '500 / 503 / timeout',
                      'Chờ rồi thử lại với số lần giới hạn. Khi tạo đơn, giữ nguyên Idempotency-Key và nội dung yêu cầu để tránh trùng đơn.',
                    ],
                  ].map(([status, action]) => (
                    <tr key={status}>
                      <td>
                        <code>{status}</code>
                      </td>
                      <td>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Hạn mức chung cho mỗi đại lý: 60 yêu cầu đọc/phút, 10 yêu cầu ghi/phút và 5 lần nộp
              chứng từ/10 phút. Nếu lỗi vẫn tiếp diễn, gửi mã đơn, thời điểm xảy ra và mã lỗi cho
              rePhone kèm <code>error.requestId</code> để được hỗ trợ; giữ bí mật khóa API và mật
              khẩu của bạn.
            </p>
            <h3>Trước khi nhận đơn trên website của bạn</h3>
            <ul>
              <li>Kiểm tra website thông báo rõ khi máy không còn khả dụng.</li>
              <li>
                Khi mất kết nối, giữ nguyên Idempotency-Key và nội dung yêu cầu để tránh tạo trùng
                đơn.
              </li>
              <li>
                Kiểm tra quyền của khóa và cách website xử lý khi khóa hết hạn hoặc bị thu hồi.
              </li>
              <li>
                Kiểm tra cập nhật trạng thái đơn khi webhook đến trùng hoặc không đúng thứ tự; chỉ
                xử lý thông báo có chữ ký và thời gian hợp lệ.
              </li>
              <li>
                Kiểm tra màn hình khách mua hàng chỉ hiển thị giá bán lẻ và thông tin thanh toán của
                cửa hàng bạn.
              </li>
              <li>
                Lấy lại danh sách máy và xem lại giá trước khi tạo đơn; chỉ gửi đơn cho nhu cầu mua
                thực tế.
              </li>
            </ul>
            <Link className={styles.primaryLink} href="/dealer">
              Bắt đầu tại cổng đại lý
              <ArrowRight size={18} aria-hidden />
            </Link>
          </section>
        </article>
      </div>
    </div>
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
