'use client';
import Link from 'next/link';
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  BookOpenIcon as BookOpen,
  CodeIcon as Code,
  FlaskIcon as Flask,
  ShieldCheckIcon as ShieldCheck,
  StorefrontIcon as Storefront,
  CopyIcon as Copy,
  CheckIcon as Check,
} from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { dealerRecord, dealerText, type DealerRecord } from '@/lib/dealer-api';
import styles from './dealer.module.css';

export function DealerWorkspaceHeader({
  title,
  description,
  test,
  children,
}: {
  title: string;
  description: string;
  test: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={styles.workspaceHero}>
      <div className={styles.heroLead}>
        <span className={styles.heroIcon}>
          <Storefront size={28} weight="duotone" aria-hidden />
        </span>
        <div>
          <span className={styles.eyebrow}>rePhone Partners</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className={styles.heroActions}>
        <span className={test ? styles.testPill : styles.livePill}>
          <span />
          {test ? 'Sandbox · Dữ liệu thử' : 'Live · Kinh doanh thực tế'}
        </span>
        {children}
      </div>
    </header>
  );
}

export function DealerCode({ code, label = 'Mã mẫu' }: { code: string; label?: string }) {
  const [copiedCode, setCopiedCode] = useState('');
  const copied = copiedCode === code;
  const [error, setError] = useState('');
  return (
    <div className={styles.codePanel}>
      <div className={styles.codeToolbar}>
        <span>{label}</span>
        <Button
          variant="ghost"
          size="compact"
          onClick={() => {
            void navigator.clipboard
              .writeText(code)
              .then(() => {
                setCopiedCode(code);
                setError('');
              })
              .catch(() => {
                setError('Chưa sao chép được. Bạn có thể chọn và chép đoạn mã bên dưới.');
              });
          }}
        >
          {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          {copied ? 'Đã chép' : 'Sao chép'}
        </Button>
      </div>
      <pre className={styles.code} tabIndex={0} aria-label={label}>
        {code}
      </pre>
      {error && <p role="status">{error}</p>}
    </div>
  );
}

export function DealerEnvironmentPanel({
  configuration,
  admin = false,
}: {
  configuration: DealerRecord;
  admin?: boolean;
}) {
  const connection = dealerRecord(configuration['connection']);
  const sandbox = dealerRecord(connection['sandbox']);
  const test = configuration['environment'] === 'TEST';
  const webUrl = dealerText(sandbox['webUrl']);
  const liveUrl = dealerText(connection['liveWebUrl']);
  return (
    <div className={styles.list}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>Thử tích hợp trước khi bán thật</h2>
          <p>Sandbox có kho máy, đơn hàng và API key riêng. Dữ liệu thử không chuyển sang Live.</p>
        </div>
        <Flask size={32} weight="duotone" aria-hidden />
      </div>
      <div className={styles.environmentGrid}>
        <section className={styles.environmentCard}>
          <span className={styles.testPill}>
            <Flask size={17} aria-hidden />
            Sandbox
          </span>
          <h3>Thử toàn bộ luồng đặt máy</h3>
          <p>Dùng máy mẫu, tạo đơn thử và mô phỏng thanh toán, giao hàng, hoàn tiền.</p>
          <ul>
            <li>
              API key bắt đầu bằng <code>rp_test_</code>
            </li>
            <li>Không chuyển tiền hoặc giao hàng thật</li>
            <li>API key được tạo trong tài khoản sandbox</li>
          </ul>
          {webUrl ? (
            <Link
              className={styles.primaryLink}
              href={`${webUrl}${admin ? '/backoffice/dealers' : '/dealer'}`}
              target="_blank"
              rel="noreferrer"
            >
              {test ? 'Mở cổng sandbox' : 'Đi tới sandbox'}
              <ArrowSquareOut size={18} aria-hidden />
            </Link>
          ) : (
            <p className={styles.muted}>
              Chưa cấu hình địa chỉ sandbox. Liên hệ rePhone để được cấp môi trường và tài khoản
              thử.
            </p>
          )}
        </section>
        <section className={styles.environmentCard}>
          <span className={styles.livePill}>
            <ShieldCheck size={17} aria-hidden />
            Live
          </span>
          <h3>Kết nối với kho đang bán</h3>
          <p>Đơn Live giữ máy thật. Đại lý thanh toán đủ trước khi rePhone xuất hàng.</p>
          <ul>
            <li>
              API key bắt đầu bằng <code>rp_live_</code>
            </li>
            <li>Tài khoản cần được duyệt hoạt động</li>
            <li>Dùng đúng địa chỉ API và key của Live</li>
          </ul>
          {test && liveUrl ? (
            <Link
              className={styles.secondaryLink}
              href={`${liveUrl}${admin ? '/backoffice/dealers' : '/dealer'}`}
              target="_blank"
              rel="noreferrer"
            >
              Mở cổng Live
              <ArrowSquareOut size={18} aria-hidden />
            </Link>
          ) : (
            <span className={styles.muted}>
              {test ? 'Liên hệ rePhone để được cấp tài khoản Live.' : 'Bạn đang ở môi trường Live.'}
            </span>
          )}
        </section>
      </div>
      <section className={styles.card}>
        <h3>Thông tin kết nối</h3>
        <p className={styles.muted}>
          Đặt API key trong biến môi trường trên máy chủ website của bạn.
        </p>
        {dealerText(connection['apiBaseUrl']) && (
          <DealerCode
            label={`API hiện tại · ${test ? 'Sandbox' : 'Live'}`}
            code={dealerText(connection['apiBaseUrl'])}
          />
        )}
        {!test && dealerText(sandbox['apiBaseUrl']) && (
          <DealerCode label="API Sandbox" code={dealerText(sandbox['apiBaseUrl'])} />
        )}
        <Link className={styles.secondaryLink} href="/dealer/api-guide">
          <BookOpen size={18} aria-hidden />
          Đọc hướng dẫn tích hợp API
        </Link>
      </section>
      <section className={styles.card}>
        <h3>Lộ trình kiểm thử</h3>
        <ol className={styles.integrationSteps}>
          <li>
            <span>01</span>
            <div>
              <strong>Vào đúng tài khoản sandbox</strong>
              <p>Tài khoản Live và Sandbox tách biệt. Dùng tài khoản thử được rePhone cấp.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Tạo API key thử</strong>
              <p>Mở Kết nối website → Tạo khóa API. Chọn quyền đọc kho và đặt đơn theo nhu cầu.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Đọc kho → Xem lại → Tạo đơn</strong>
              <p>
                Preview không giữ máy. Gửi cùng Idempotency-Key khi thử lại một yêu cầu tạo đơn.
              </p>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <strong>Mô phỏng và kiểm tra kết quả</strong>
              <p>
                Admin Sandbox mở Đơn đại lý → Xem đơn → Diễn tập trên TEST để mô phỏng nhận tiền,
                giao hoặc hủy đơn. Đại lý kiểm tra kết quả qua API.
              </p>
            </div>
          </li>
          <li>
            <span>05</span>
            <div>
              <strong>Chuyển cấu hình sang Live</strong>
              <p>
                Thay cả địa chỉ API và key. Không tái sử dụng mã máy, mã đơn hay chứng từ từ
                Sandbox.
              </p>
            </div>
          </li>
        </ol>
        <div className={styles.note}>
          <Code size={20} aria-hidden />
          <p>
            Dùng dữ liệu giả khi thử nghiệm. Với sandbox cục bộ của dự án, email không gửi ra ngoài;
            chứng từ chỉ ghi nhận thông tin tệp, chưa hỗ trợ xem nội dung. Admin dùng mô phỏng để
            kiểm tra các bước vận hành.
          </p>
        </div>
      </section>
    </div>
  );
}
