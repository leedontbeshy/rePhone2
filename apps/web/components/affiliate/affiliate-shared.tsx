'use client';
import { useId, type SyntheticEvent, type ReactNode } from 'react';
import { WalletIcon, ClockIcon, ArrowUpRightIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { currency, date, record, rows, statusLabel, text, type Row } from '@/lib/affiliate-api';
import styles from './affiliate.module.css';
export function Status({ value }: { value: unknown }) {
  return (
    <span className={styles.status} data-value={text(value)}>
      {statusLabel(value)}
    </span>
  );
}
export function Form({
  children,
  submit,
  busy,
  label,
}: {
  children: ReactNode;
  submit: (data: FormData) => Promise<void>;
  busy: boolean;
  label: string;
}) {
  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(new FormData(event.currentTarget));
  }
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <fieldset
        disabled={busy}
        style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16 }}
      >
        {children}
        <div>
          <Button type="submit" loading={busy}>
            {label}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
export function Field({
  name,
  label,
  help,
  type = 'text',
  value = '',
  required = true,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  help?: string;
  type?: string;
  value?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  const helpId = useId();
  return (
    <label className={styles.field}>
      <span>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
        step={step}
        aria-describedby={help ? helpId : undefined}
        maxLength={type === 'text' ? 120 : undefined}
        autoComplete={
          type === 'password' ? 'current-password' : name === 'accountNumber' ? 'off' : undefined
        }
        inputMode={name === 'accountNumber' ? 'numeric' : undefined}
      />
      {help && <small id={helpId}>{help}</small>}
    </label>
  );
}
export function Stats({ dashboard }: { dashboard: Row }) {
  const totals = rows(dashboard['totals']);
  const total = (statuses: string[], field = 'amount') =>
    totals
      .filter((r) => statuses.includes(text(r['status'])))
      .reduce((sum, r) => sum + BigInt(text(r[field]) || '0'), BigInt(0))
      .toString();
  return (
    <div className={styles.stats}>
      {(
        [
          ['Có thể rút', currency(total(['AVAILABLE'])), WalletIcon, 'Đã đủ điều kiện thanh toán'],
          [
            'Đang chờ / tạm giữ',
            currency(total(['PENDING', 'HELD'])),
            ClockIcon,
            'Chờ hoàn tất điều kiện của đơn',
          ],
          [
            'Đang rút',
            currency(dashboard['reservedAmount']),
            ArrowUpRightIcon,
            'Đã gửi yêu cầu chi trả',
          ],
          [
            'Đã chi trả',
            currency(total(['PAID'], 'paidAmount')),
            CheckCircleIcon,
            'Đã chuyển cho cộng tác viên',
          ],
        ] as const
      ).map(([label, value, Icon, hint]) => (
        <div className={styles.stat} key={label}>
          <div className={styles.statHeading}>
            <span>{label}</span>
            <Icon size={22} weight="duotone" aria-hidden />
          </div>
          <strong>{value}</strong>
          <small>{hint}</small>
        </div>
      ))}
    </div>
  );
}
export function CommissionTable({ dashboard }: { dashboard: Row }) {
  const headingId = useId();
  return (
    <section className={styles.card}>
      <h2 id={headingId}>Hoa hồng theo đơn</h2>
      <p>Số tiền được chốt khi đặt hàng. Đơn hoàn tiền có thể làm giảm hoa hồng chưa chi trả.</p>
      <div className={styles.tableWrap} role="region" aria-labelledby={headingId} tabIndex={0}>
        <table className={styles.table} aria-labelledby={headingId}>
          <thead>
            <tr>
              <th scope="col">Đơn hàng / sản phẩm</th>
              <th scope="col">Hoa hồng</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Ngày dự kiến khả dụng</th>
            </tr>
          </thead>
          <tbody>
            {rows(dashboard['commissions']).map((c) => (
              <tr key={text(c['id'])}>
                <td>
                  {text(c['orderNumber'])}
                  <small>{text(c['productName'])}</small>
                </td>
                <td>{currency(c['status'] === 'PAID' ? c['paidAmount'] : c['amount'])}</td>
                <td>
                  <Status value={c['status']} />
                  {c['holdReason'] ? <small>Đơn đang xử lý hậu mãi hoặc hoàn tiền</small> : null}
                </td>
                <td>{date(c['availableAt'])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows(dashboard['commissions']).length && (
          <p className={styles.empty}>Chưa có đơn hàng được ghi nhận.</p>
        )}
      </div>
    </section>
  );
}
export function PayoutHistory({ dashboard }: { dashboard: Row }) {
  return (
    <section className={styles.card}>
      <h2>Lịch sử rút tiền</h2>
      {rows(dashboard['payouts']).map((p) => (
        <div className={styles.card} key={text(p['id'])}>
          <div className={styles.actions}>
            <strong>{currency(p['amount'])}</strong>
            <Status value={p['status']} />
          </div>
          <p>
            {text(record(p['bank'])['bankName'])} · •••• {text(record(p['bank'])['lastFour'])} ·{' '}
            {date(p['createdAt'])}
          </p>
          {p['note'] ? <p>{text(p['note'])}</p> : null}
        </div>
      ))}
      {!rows(dashboard['payouts']).length && <p>Chưa có yêu cầu rút tiền.</p>}
    </section>
  );
}
export function Pager({
  page,
  more,
  change,
}: {
  page: number;
  more: boolean;
  change: (n: number) => void;
}) {
  return (
    <div className={styles.actions}>
      <Button
        variant="secondary"
        disabled={page === 1}
        onClick={() => {
          change(page - 1);
        }}
      >
        Trang trước
      </Button>
      <span>Trang {page}</span>
      <Button
        variant="secondary"
        disabled={!more}
        onClick={() => {
          change(page + 1);
        }}
      >
        Trang sau
      </Button>
    </div>
  );
}
