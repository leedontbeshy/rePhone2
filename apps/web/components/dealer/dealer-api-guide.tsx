'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpenIcon as BookOpen,
  ArrowRightIcon as ArrowRight,
  ShieldCheckIcon as ShieldCheck,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { DealerCode, DealerWorkspaceHeader } from './dealer-workspace';
import styles from './dealer.module.css';

const sections = [
  ['start', 'Bắt đầu'],
  ['environments', 'Thử nghiệm & bán thật'],
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
  liveApiUrl,
  sandboxApiUrl,
  sandboxWebUrl,
}: {
  liveApiUrl: string;
  sandboxApiUrl: string;
  sandboxWebUrl: string;
}) {
  const [sandbox, setSandbox] = useState(true);
  const base = sandbox ? sandboxApiUrl : liveApiUrl;
  const prefix = sandbox ? 'rp_test_' : 'rp_live_';
  return (
    <div className={styles.page}>
      <DealerWorkspaceHeader
        title="Tích hợp API đại lý"
        description="Kết nối website bán hàng của bạn với kho máy rePhone. Tìm hiểu cách bắt đầu, thử nghiệm và quản lý đơn hàng qua API."
        test={sandbox}
      >
        <Link href="/dealer" className={styles.secondaryLink}>
          ← Cổng đại lý
        </Link>
      </DealerWorkspaceHeader>
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
          <section id="start" className={styles.guideSection}>
            <span className={styles.eyebrow}>01 · Tổng quan</span>
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
              <li>Truy cập Sandbox và dùng tài khoản thử nghiệm để tạo khóa API.</li>
              <li>Thử lấy danh sách máy, xem lại giá và phí giao, sau đó tạo một đơn thử.</li>
              <li>
                Kiểm tra việc cập nhật trạng thái đơn và xử lý lỗi kết nối trên website của bạn.
              </li>
              <li>
                Khi hồ sơ đại lý đã được duyệt và kết nối đã sẵn sàng, sử dụng khóa Live để bán
                thật.
              </li>
            </ol>
          </section>
          <section id="environments" className={styles.guideSection}>
            <span className={styles.eyebrow}>02 · Chọn môi trường</span>
            <h2>Thử kết nối với Sandbox trước khi bán thật</h2>
            <p>
              Sandbox là môi trường để bạn làm quen với API bằng dữ liệu và đơn hàng thử. Live là
              môi trường kinh doanh thực tế, nơi bạn đặt máy và thanh toán cho rePhone. Hai môi
              trường dùng tài khoản, khóa API và dữ liệu riêng; đơn thử không chuyển thành đơn thật.
            </p>
            <p>Chọn môi trường để xem địa chỉ API và loại khóa tương ứng cho website của bạn.</p>
            <div className={styles.actions}>
              <Button
                variant={sandbox ? 'primary' : 'secondary'}
                onClick={() => {
                  setSandbox(true);
                }}
              >
                Sandbox · TEST
              </Button>
              <Button
                variant={!sandbox ? 'primary' : 'secondary'}
                onClick={() => {
                  setSandbox(false);
                }}
              >
                Thực tế · LIVE
              </Button>
            </div>
            <DealerCode
              label={`Cấu hình trên máy chủ website của bạn · ${sandbox ? 'TEST' : 'LIVE'}`}
              code={`REPHONE_API_BASE_URL=${base || '<địa chỉ API do rePhone cấp, kết thúc bằng /api/v1>'}\nREPHONE_DEALER_KEY=${prefix}<key của bạn>`}
            />
            <p>
              Địa chỉ trên đã gồm <code>/api/v1</code>. Ví dụ dưới đây chỉ nối thêm{' '}
              <code>/dealer/…</code>.
            </p>
            {sandboxWebUrl ? (
              <Link
                className={styles.primaryLink}
                href={`${sandboxWebUrl}/dealer`}
                target="_blank"
                rel="noreferrer"
              >
                Truy cập Sandbox
                <ArrowRight size={18} aria-hidden />
              </Link>
            ) : (
              <p>
                Liên hệ rePhone để được hướng dẫn truy cập Sandbox và sử dụng tài khoản thử nghiệm.
              </p>
            )}
            <p>
              Nếu chưa có tài khoản thử nghiệm, hãy liên hệ rePhone để được hỗ trợ. Khi thử, dùng
              thông tin khách hàng giả và không chuyển tiền thật. Trước khi kiểm tra email hoặc tệp
              chứng từ, hãy xác nhận với rePhone các chức năng được hỗ trợ trong Sandbox bạn đang sử
              dụng.
            </p>
          </section>
          <section id="keys" className={styles.guideSection}>
            <span className={styles.eyebrow}>03 · Xác thực</span>
            <h2>Tạo khóa API cho website của bạn</h2>
            <p>
              Mở <strong>Kết nối website → Tạo khóa API</strong> trong cổng của môi trường đã chọn.
              Nhập tên để nhận biết website, chọn quyền truy cập và xác nhận mật khẩu. Khóa chỉ hiển
              thị một lần, có hạn 90 ngày; bạn có thể giữ tối đa hai khóa còn hiệu lực. Hãy sao chép
              và lưu khóa an toàn trước khi rời trang.
            </p>
            <DealerCode label="Header bắt buộc" code={`X-Dealer-Api-Key: ${prefix}<key của bạn>`} />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Quyền truy cập (scope)</th>
                    <th>Dùng để</th>
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
            <span className={styles.eyebrow}>04 · Lấy sản phẩm</span>
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
            <span className={styles.eyebrow}>05 · Tạo đơn</span>
            <h2>Xem lại giá và phí giao trước khi đặt máy</h2>
            <p>
              Mỗi đơn gồm một máy. Gọi bước xem lại đơn (preview) để nhận giá, phí giao và tình
              trạng máy mới nhất. Sau khi thông tin được xác nhận, website gửi yêu cầu tạo đơn. Nếu
              giá hoặc tình trạng máy thay đổi, hãy thông báo để người mua xem lại lựa chọn.
            </p>
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
    receiverName: 'Khách thử nghiệm', phone: '0900000000',
    addressLine: '1 Nguyễn Huệ', ward: 'Bến Nghé',
    district: 'Quận 1', province: 'TP. Hồ Chí Minh'
  }
};
const preview = await rephone('/dealer/orders/preview', selection);
// Hiển thị giá/phí giao và lấy xác nhận trước bước tạo đơn.
const command = {
  ...selection, previewFingerprint: preview.previewFingerprint,
  externalOrderId: 'SHOP-ORDER-0001',
  contact: { fullName: 'Khách thử nghiệm', email: 'buyer@example.test', phone: '0900000000' }
};
const idempotencyKey = randomUUID();
// Lưu command và idempotencyKey trong hệ thống của bạn trước khi gửi.
const { order, replayed } = await rephone('/dealer/orders', command, idempotencyKey);
// Timeout: đọc command/key đã lưu và gọi lại đúng yêu cầu đó.`}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tình huống</th>
                    <th>Cách xử lý</th>
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
            <span className={styles.eyebrow}>06 · Sau khi đặt đơn</span>
            <h2>Thanh toán, giao hàng và hậu mãi</h2>
            <p>
              Sau khi tạo đơn, lấy hướng dẫn thanh toán bằng{' '}
              <code>GET /dealer/orders/:id/payment-requests</code>. Với đơn Live, chuyển khoản theo
              thông tin của đơn và gửi chứng từ qua{' '}
              <code>POST /dealer/payment-requests/:id/proofs</code>, dùng multipart field{' '}
              <code>file</code>. Đơn được tiếp tục xử lý sau khi rePhone đối chiếu và xác nhận đã
              nhận đủ tiền; việc gửi ảnh chứng từ chưa phải xác nhận thanh toán thành công.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Thao tác</th>
                    <th>Endpoint</th>
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
            <details className={styles.profileDisclosure}>
              <summary>Thử theo dõi thanh toán và giao hàng trong Sandbox</summary>
              <p>
                Tạo một đơn thử và gửi mã đơn cho rePhone khi cần hỗ trợ mô phỏng các tình huống như
                đã thanh toán, giao thành công, giao thất bại hoặc hoàn tiền. Sau khi trạng thái
                được cập nhật, kiểm tra website của bạn qua API hoặc thông báo webhook. Các bước này
                dùng dữ liệu thử, không yêu cầu chuyển tiền hay giao máy thật.
              </p>
            </details>
          </section>
          <section id="webhooks" className={styles.guideSection}>
            <span className={styles.eyebrow}>07 · Đồng bộ trạng thái</span>
            <h2>Nhận và xác thực webhook</h2>
            <p>
              Webhook giúp website của bạn nhận thông báo khi đơn hàng, thanh toán hoặc hậu mãi thay
              đổi. Trong <strong>Kết nối website</strong>, nhập địa chỉ nhận thông báo dùng HTTPS,
              cổng 443 và thuộc tên miền của bạn đã được rePhone duyệt. Địa chỉ cần truy cập được từ
              Internet và không chuyển hướng; localhost hoặc IP nội bộ không dùng được, kể cả khi
              thử trên Sandbox.
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
                  environment: sandbox ? 'TEST' : 'LIVE',
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
            <span className={styles.eyebrow}>08 · Hoàn tất kết nối</span>
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
                  },
                },
                null,
                2,
              )}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>HTTP</th>
                    <th>Cần làm gì</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['400', 'Kiểm tra thông tin đã gửi và hướng dẫn trong error.details.'],
                    [
                      '401 / 403',
                      'Kiểm tra khóa API, quyền truy cập và môi trường đang dùng. Nếu cần, liên hệ rePhone để kiểm tra trạng thái tài khoản.',
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
              rePhone để được hỗ trợ; giữ bí mật khóa API và mật khẩu của bạn.
            </p>
            <h3>Trước khi chuyển sang Live</h3>
            <ul>
              <li>Thử đặt đơn và kiểm tra website thông báo rõ khi máy không còn khả dụng.</li>
              <li>
                Thử gửi lại yêu cầu sau khi mất kết nối để xác nhận website chỉ ghi nhận một đơn.
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
                Chuyển cả địa chỉ API và khóa sang Live; lấy lại danh sách máy trước khi nhận đơn
                thật.
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
