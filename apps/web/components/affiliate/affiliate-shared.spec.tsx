import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommissionTable, Field, Form, Pager, PayoutHistory, Stats } from './affiliate-shared';

describe('affiliate shared presentation contracts', () => {
  it('keeps available, held, reserved and paid values in their own real-data categories', () => {
    const html = renderToStaticMarkup(
      <Stats
        dashboard={{
          reservedAmount: '43000',
          totals: [
            { status: 'AVAILABLE', amount: '210000' },
            { status: 'PENDING', amount: '31000' },
            { status: 'HELD', amount: '7000' },
            { status: 'PAID', amount: '999999', paidAmount: '170000' },
          ],
        }}
      />,
    );
    expect(html).toContain('Có thể rút');
    expect(html).toContain('210.000 ₫');
    expect(html).toContain('Đang chờ / tạm giữ');
    expect(html).toContain('38.000 ₫');
    expect(html).toContain('43.000 ₫');
    expect(html).toContain('170.000 ₫');
    expect(html).not.toContain('999.999');
  });

  it('does not round large integer-string commission amounts through Number', () => {
    const html = renderToStaticMarkup(
      <Stats
        dashboard={{
          reservedAmount: '0',
          totals: [
            { status: 'AVAILABLE', amount: '9007199254740993' },
            { status: 'AVAILABLE', amount: '2' },
          ],
        }}
      />,
    );
    expect(html).toContain('9.007.199.254.740.995 ₫');
  });

  it('labels each keyboard-scrollable table with its own heading and preserves all columns', () => {
    const html = renderToStaticMarkup(
      <>
        <CommissionTable dashboard={{}} />
        <CommissionTable dashboard={{}} />
      </>,
    );
    const ids = [...html.matchAll(/<h2 id="([^"]+)">Hoa hồng theo đơn<\/h2>/g)].map(
      (match) => match[1],
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      if (id === undefined) throw new Error('Commission heading must have an ID');
      expect(html).toContain(`role="region" aria-labelledby="${id}" tabindex="0"`);
      expect(html).toContain(`aria-labelledby="${id}"><thead>`);
    }
    expect(html.match(/scope="col"/g)).toHaveLength(8);
    expect(html).toContain('Đơn hàng / sản phẩm');
    expect(html).toContain('Ngày dự kiến khả dụng');
    expect(html.match(/Chưa có đơn hàng được ghi nhận\./g)).toHaveLength(2);
  });

  it('shows paidAmount and a customer-safe held explanation without private hold details', () => {
    const html = renderToStaticMarkup(
      <CommissionTable
        dashboard={{
          commissions: [
            {
              id: 'paid',
              orderNumber: 'ORDER-PAID',
              productName: 'iPhone 17',
              status: 'PAID',
              amount: '999999',
              paidAmount: '123456',
              availableAt: '2026-10-01T00:00:00Z',
            },
            {
              id: 'held',
              orderNumber: 'ORDER-HELD',
              productName: 'iPhone 16',
              status: 'HELD',
              amount: '65432',
              holdReason: 'PRIVATE_HOLD_REASON',
              availableAt: null,
            },
          ],
        }}
      />,
    );
    expect(html).toContain('123.456 ₫');
    expect(html).toContain('65.432 ₫');
    expect(html).toContain('Đã chi trả');
    expect(html).toContain('Tạm giữ');
    expect(html).toContain('Đơn đang xử lý hậu mãi hoặc hoàn tiền');
    expect(html).not.toContain('999.999');
    expect(html).not.toContain('PRIVATE_HOLD_REASON');
  });

  it('renders masked payout snapshots without unused private DTO sentinel fields', () => {
    const html = renderToStaticMarkup(
      <PayoutHistory
        dashboard={{
          payouts: [
            {
              id: 'payout',
              amount: '250000',
              status: 'REQUESTED',
              createdAt: '2026-10-01T00:00:00Z',
              bank: {
                bankName: 'Ngân hàng mẫu',
                lastFour: '0421',
                accountNumber: 'PRIVATE_FULL_ACCOUNT',
                ciphertext: 'PRIVATE_CIPHERTEXT',
              },
              token: 'PRIVATE_TOKEN',
              objectPath: 'PRIVATE_OBJECT_PATH',
            },
          ],
        }}
      />,
    );
    expect(html).toContain('250.000 ₫');
    expect(html).toContain('Chờ xử lý');
    expect(html).toContain('Ngân hàng mẫu');
    expect(html).toContain('•••• 0421');
    expect(html).not.toContain('PRIVATE_');
    expect(renderToStaticMarkup(<PayoutHistory dashboard={{}} />)).toContain(
      'Chưa có yêu cầu rút tiền.',
    );
  });

  it('retains native busy, password, bank input and field-help contracts', () => {
    const html = renderToStaticMarkup(
      <Form busy label="Lưu tài khoản" submit={async () => {}}>
        <Field
          name="currentPassword"
          label="Mật khẩu hiện tại"
          type="password"
          help="Dùng mật khẩu của tài khoản."
        />
        <Field name="accountNumber" label="Số tài khoản" />
        <Field name="overrideRateBps" label="Hoa hồng riêng" type="number" required={false} />
      </Form>,
    );
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('aria-describedby="');
    const override = /<input[^>]*name="overrideRateBps"[^>]*>/.exec(html)?.[0] ?? '';
    expect(override).toContain('type="number"');
    expect(override).not.toContain('required=');
  });

  it('keeps pagination boundaries disabled without fabricating more rows', () => {
    const html = renderToStaticMarkup(<Pager page={1} more={false} change={() => {}} />);
    expect(html).toContain('Trang trước');
    expect(html).toContain('Trang sau');
    expect(html).toContain('Trang 1');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
