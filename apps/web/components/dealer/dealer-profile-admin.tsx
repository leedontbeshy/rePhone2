'use client';
import { useState } from 'react';
import { DisclosureSummary, Button, InlineAlert } from '@/components/ui';
import {
  dealerDate,
  dealerRecord,
  dealerRows,
  dealerStatus,
  dealerText,
  type DealerApi,
  type DealerRecord,
} from '@/lib/dealer-api';
import { DealerForm, type DealerField } from './dealer-primitives';
import { bankIsEffective, bankStatus } from './dealer-bank-status';
import styles from './dealer.module.css';

const base = 'backoffice/dealers';
const reason: DealerField = { name: 'reason', label: 'Ghi chú xử lý', type: 'textarea' };

export function DealerProfileAdmin({
  row,
  api,
  admin,
  termsVersion,
  done,
  close,
}: {
  row: DealerRecord;
  api: DealerApi;
  admin: boolean;
  termsVersion: string;
  done: () => Promise<void>;
  close: () => void;
}) {
  const id = dealerText(row['id']);
  const accounts = dealerRows(row['bankAccounts']);
  const activeBanks = accounts.filter((bank) => !bank['disabledAt']);
  const archivedBanks = accounts.filter((bank) => bank['disabledAt']);
  const effective = activeBanks.some(bankIsEffective);
  const confirmed = effective || activeBanks.some((bank) => Boolean(bank['emailConfirmedAt']));
  const verified = effective || activeBanks.some((bank) => Boolean(bank['verifiedAt']));
  const pending = row['businessStatus'] === 'PENDING';
  const currentTerms = row['termsVersion'] === termsVersion;
  const ready = effective && currentTerms && row['securityStatus'] === 'NORMAL';
  const metrics = dealerRecord(row['metrics']);
  const histories = dealerRows(row['histories']);
  const domains = Array.isArray(row['approvedDomains'])
    ? row['approvedDomains'].map(dealerText).filter(Boolean)
    : [];
  const riskLabel =
    (
      { NORMAL: 'Bình thường', ELEVATED: 'Cần theo dõi', BLOCKED: 'Chặn đơn mới' } as Record<
        string,
        string
      >
    )[dealerText(row['riskLevel'])] || 'Chưa có thông tin';
  const maximumUnfundedOrders = dealerText(row['maximumUnfundedOrders']);
  const nextStep = !activeBanks.length
    ? 'Đại lý cần thêm tài khoản ngân hàng nhận hoàn trong cổng đại lý.'
    : !confirmed
      ? 'Chờ chủ đại lý mở email đăng nhập và xác nhận tài khoản. Có thể gửi lại email trong cổng đại lý.'
      : !verified
        ? 'Admin cần đối chiếu ngân hàng, số tài khoản và tên chủ tài khoản bên dưới trước khi xác minh.'
        : !effective
          ? 'Tài khoản thay thế đang trong thời gian chờ 24 giờ. Hồ sơ có thể được duyệt khi tài khoản có hiệu lực.'
          : !currentTerms
            ? 'Hồ sơ chưa chấp nhận phiên bản điều khoản hiện hành.'
            : row['securityStatus'] !== 'NORMAL'
              ? 'Hồ sơ đang bị khóa bảo mật. Cần xử lý khóa trước khi duyệt.'
              : 'Tài khoản nhận hoàn đã có hiệu lực. Admin có thể hoàn tất duyệt hồ sơ.';
  const transitions: Array<[string, string]> = pending
    ? [['REJECT', 'Từ chối hồ sơ']]
    : row['businessStatus'] === 'ACTIVE'
      ? [
          ['SUSPEND', 'Tạm ngừng đơn mới'],
          ['CLOSE', 'Chấm dứt kinh doanh'],
        ]
      : row['businessStatus'] === 'BUSINESS_SUSPENDED'
        ? [
            ['RESUME', 'Tiếp tục kinh doanh'],
            ['CLOSE', 'Chấm dứt kinh doanh'],
          ]
        : [];

  return (
    <div className={styles.list}>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={close}>
          ← Danh sách đại lý
        </Button>
      </div>
      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Hồ sơ đại lý</span>
            <h2>{dealerText(row['displayName'])}</h2>
            <p className={styles.muted}>{dealerText(row['legalName'])}</p>
          </div>
          <div className={styles.actions}>
            <span className={styles.badge}>{dealerStatus(row['businessStatus'])}</span>
            {row['securityStatus'] === 'SECURITY_LOCKED' && (
              <span className={styles.badge}>Khóa bảo mật</span>
            )}
          </div>
        </div>
        <dl className={styles.profileFacts}>
          {[
            [
              'Loại hình',
              row['businessType'] === 'COMPANY'
                ? 'Doanh nghiệp'
                : row['businessType'] === 'HOUSEHOLD'
                  ? 'Hộ kinh doanh'
                  : 'Cá nhân',
            ],
            ['Mã số thuế', row['taxCode']],
            ['Người đại diện', row['representativeName']],
            ['Điện thoại hỗ trợ', row['contactPhone']],
            ['Email hỗ trợ', row['contactEmail']],
            ['Địa chỉ kinh doanh', row['businessAddress']],
          ].map(([label, value]) => (
            <div key={dealerText(label)}>
              <dt>{dealerText(label)}</dt>
              <dd>{dealerText(value) || 'Chưa cung cấp'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className={styles.profileColumns}>
        <section className={styles.card}>
          <div>
            <h3>Tài khoản nhận hoàn</h3>
            <p className={styles.muted}>
              rePhone dùng tài khoản đã xác minh để hoàn tiền cho đại lý.
            </p>
          </div>
          {activeBanks.length === 0 && <p className={styles.muted}>Chưa có tài khoản ngân hàng.</p>}
          {activeBanks.map((account) => (
            <AdminBank
              key={dealerText(account['id'])}
              account={account}
              api={api}
              admin={admin}
              done={done}
            />
          ))}
          {archivedBanks.length > 0 && (
            <details className={styles.profileDisclosure}>
              <DisclosureSummary>
                Tài khoản đã ngừng sử dụng ({archivedBanks.length})
              </DisclosureSummary>
              {archivedBanks.map((account) => (
                <AdminBank
                  key={dealerText(account['id'])}
                  account={account}
                  api={api}
                  admin={admin}
                  done={done}
                />
              ))}
            </details>
          )}
        </section>
        <section className={styles.card}>
          <h3>{pending ? 'Tiến trình duyệt hồ sơ' : 'Trạng thái xác minh'}</h3>
          <ol className={styles.profileSteps}>
            {[
              ['Đã tiếp nhận hồ sơ', true],
              ['Đại lý xác nhận email ngân hàng', confirmed],
              ['Admin xác minh tài khoản', verified],
              ['Tài khoản có hiệu lực', effective],
            ].map(([label, complete], index) => (
              <li key={String(label)} data-complete={String(complete)}>
                <span aria-hidden="true">{complete ? '✓' : index + 1}</span>
                <div>
                  {String(label)}
                  <small>{complete ? 'Hoàn tất' : 'Chưa hoàn tất'}</small>
                </div>
              </li>
            ))}
          </ol>
          {pending && (
            <InlineAlert
              tone={ready ? 'success' : 'info'}
              title={ready ? 'Sẵn sàng duyệt' : 'Bước tiếp theo'}
            >
              {nextStep}
            </InlineAlert>
          )}
          {admin && pending && !ready && (
            <div>
              <Button disabled>Duyệt hồ sơ đại lý</Button>
            </div>
          )}
          {admin && pending && ready && (
            <DealerForm
              fields={[{ name: 'reason', label: 'Ghi chú duyệt hồ sơ' }]}
              submit="Duyệt hồ sơ đại lý"
              disabled={!ready}
              onSubmit={async (data) => {
                await api.post(`${base}/${id}/status`, {
                  ...data,
                  action: 'APPROVE',
                  expectedVersion: row['version'],
                });
                await done();
              }}
            />
          )}
        </section>
      </div>

      <section className={styles.card}>
        <h3>Hoạt động gần đây</h3>
        <dl className={styles.profileMetrics}>
          {[
            ['Đơn trong 30 ngày', dealerText(metrics['recentOrders']) || '0'],
            ['Đơn hết hạn', dealerText(metrics['expiredOrders']) || '0'],
            [
              'Chứng từ bị từ chối',
              `${dealerText(metrics['rejectedProofs']) || '0'} / ${dealerText(metrics['proofs']) || '0'}`,
            ],
            ['Máy đang giữ', dealerText(metrics['heldOrders']) || '0'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.muted}>
          Tổng thời gian giữ máy hiện tại: {dealerText(metrics['activeHoldMinutes']) || '0'} phút.
        </p>
      </section>

      <div className={admin ? styles.profileColumns : styles.list}>
        <section className={styles.card}>
          <h3>Thông tin hồ sơ</h3>
          <dl className={styles.profileFacts}>
            <div>
              <dt>Mã hồ sơ</dt>
              <dd className={styles.profileIdentifier}>{id}</dd>
            </div>
            <div>
              <dt>Điều khoản đã chấp nhận</dt>
              <dd>
                {dealerText(row['termsVersion']) || 'Chưa chấp nhận'}
                {row['termsAcceptedAt'] ? ` · ${dealerDate(row['termsAcceptedAt'])}` : ''}
              </dd>
            </div>
            <div>
              <dt>Website đã đăng ký</dt>
              <dd>{domains.length ? domains.join(', ') : 'Chưa đăng ký'}</dd>
            </div>
          </dl>
        </section>
        {admin && (
          <section className={[styles.card, styles.profileManagement].filter(Boolean).join(' ')}>
            <h3>Quản lý hồ sơ</h3>
            {transitions.length > 0 && (
              <details className={styles.profileDisclosure}>
                <DisclosureSummary>
                  <span className={styles.disclosureCopy}>
                    <strong>{pending ? 'Từ chối hồ sơ' : 'Trạng thái kinh doanh'}</strong>
                    <small>{dealerStatus(row['businessStatus'])}</small>
                  </span>
                </DisclosureSummary>
                <DealerForm
                  fields={[
                    {
                      name: 'action',
                      label: 'Thao tác',
                      options: transitions.map(([value, label]) => ({ value, label })),
                    },
                    reason,
                  ]}
                  submit="Lưu trạng thái"
                  onSubmit={async (data) => {
                    await api.post(`${base}/${id}/status`, {
                      ...data,
                      expectedVersion: row['version'],
                    });
                    await done();
                  }}
                />
              </details>
            )}
            <details className={styles.profileDisclosure}>
              <DisclosureSummary>
                <span className={styles.disclosureCopy}>
                  <strong>Giới hạn đặt hàng & mức rủi ro</strong>
                  <small>
                    {riskLabel}
                    {maximumUnfundedOrders !== ''
                      ? ` · Tối đa ${maximumUnfundedOrders} đơn chưa đủ tiền`
                      : ''}
                  </small>
                </span>
              </DisclosureSummary>
              <DealerForm
                fields={[
                  {
                    name: 'riskLevel',
                    label: 'Mức rủi ro',
                    value: dealerText(row['riskLevel']),
                    options: [
                      { value: 'NORMAL', label: 'Bình thường' },
                      { value: 'ELEVATED', label: 'Cần theo dõi' },
                      { value: 'BLOCKED', label: 'Chặn đơn mới' },
                    ],
                  },
                  {
                    name: 'maximumUnfundedOrders',
                    label: 'Số đơn chưa đủ tiền tối đa',
                    type: 'number',
                    value: dealerText(row['maximumUnfundedOrders']),
                  },
                  reason,
                ]}
                submit="Cập nhật giới hạn"
                onSubmit={async (data) => {
                  await api.post(`${base}/${id}/risk`, {
                    ...data,
                    maximumUnfundedOrders: Number(data['maximumUnfundedOrders']),
                    expectedVersion: row['version'],
                  });
                  await done();
                }}
              />
            </details>
            <details className={styles.profileDisclosure}>
              <DisclosureSummary>
                <span className={styles.disclosureCopy}>
                  <strong>Bảo mật truy cập</strong>
                  <small>{dealerStatus(row['securityStatus'])}</small>
                </span>
              </DisclosureSummary>
              <p className={styles.muted}>
                Khóa bảo mật thu hồi phiên đăng nhập và API key của đại lý.
              </p>
              <DealerForm
                fields={[reason]}
                submit={
                  row['securityStatus'] === 'SECURITY_LOCKED' ? 'Gỡ khóa bảo mật' : 'Khóa truy cập'
                }
                onSubmit={async (data) => {
                  await api.post(`${base}/${id}/status`, {
                    ...data,
                    action: row['securityStatus'] === 'SECURITY_LOCKED' ? 'UNLOCK' : 'LOCK',
                    expectedVersion: row['version'],
                  });
                  await done();
                }}
              />
            </details>
          </section>
        )}
      </div>
      <section className={styles.card}>
        <details className={styles.profileHistory}>
          <DisclosureSummary>
            <span className={styles.disclosureCopy}>
              <strong>Lịch sử xử lý hồ sơ</strong>
              <small>
                {histories.length ? `${histories.length.toString()} lần xử lý` : 'Chưa có lịch sử'}
              </small>
            </span>
          </DisclosureSummary>
          {histories.map((history) => (
            <div className={styles.line} key={dealerText(history['id'])}>
              <div>
                <strong>
                  {(
                    {
                      APPLY: 'Gửi hồ sơ',
                      APPROVE: 'Duyệt hồ sơ',
                      REJECT: 'Từ chối',
                      SUSPEND: 'Tạm ngừng',
                      RESUME: 'Tiếp tục kinh doanh',
                      CLOSE: 'Chấm dứt',
                      LOCK: 'Khóa bảo mật',
                      UNLOCK: 'Gỡ khóa',
                      RISK_UPDATED: 'Cập nhật giới hạn',
                    } as Record<string, string>
                  )[dealerText(history['action'])] ?? dealerText(history['action'])}
                </strong>
                <p className={styles.muted}>{dealerText(history['reason'])}</p>
              </div>
              <span className={styles.muted}>{dealerDate(history['createdAt'])}</span>
            </div>
          ))}
          {histories.length === 0 && <p className={styles.muted}>Chưa có lịch sử xử lý hồ sơ.</p>}
        </details>
      </section>
    </div>
  );
}

function AdminBank({
  account,
  api,
  admin,
  done,
}: {
  account: DealerRecord;
  api: DealerApi;
  admin: boolean;
  done: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState<DealerRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = dealerText(account['id']);
  return (
    <div className={styles.bankItem}>
      <div className={styles.header}>
        <div>
          <strong>
            {dealerText(account['bankName'])} · ****{dealerText(account['accountLastFour'])}
          </strong>
          <p className={styles.muted}>{dealerText(account['accountHolder'])}</p>
        </div>
        <span
          className={[styles.badge, !bankIsEffective(account) && styles.neutralBadge]
            .filter(Boolean)
            .join(' ')}
        >
          {bankStatus(account)}
        </span>
      </div>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {admin && (
        <>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => {
                if (revealed) {
                  setRevealed(null);
                  return;
                }
                setBusy(true);
                setError('');
                void api
                  .get(`${base}/bank-accounts/${id}/details`)
                  .then((value) => {
                    setRevealed(dealerRecord(value));
                  })
                  .catch((caught: unknown) => {
                    setError(
                      caught instanceof Error ? caught.message : 'Không xem được tài khoản.',
                    );
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {revealed ? 'Ẩn số tài khoản' : 'Xem số tài khoản'}
            </Button>
          </div>
          {revealed && (
            <div className={styles.bankNumber}>
              <span>Số tài khoản</span>
              <strong>{dealerText(revealed['accountNumber'])}</strong>
              <span>{dealerText(revealed['accountHolder'])}</span>
            </div>
          )}
          {Boolean(account['emailConfirmedAt']) &&
            !account['verifiedAt'] &&
            !account['disabledAt'] && (
              <DealerForm
                fields={[]}
                submit="Xác minh tài khoản"
                disabled={!revealed}
                onSubmit={async () => {
                  await api.post(`${base}/bank-accounts/${id}/verify`);
                  setRevealed(null);
                  await done();
                }}
              >
                <p className={styles.muted}>
                  Mở số tài khoản và đối chiếu tên chủ tài khoản với hồ sơ trước khi xác minh.
                </p>
              </DealerForm>
            )}
          {!account['disabledAt'] && (
            <details className={styles.profileDisclosure}>
              <DisclosureSummary>Ngừng sử dụng tài khoản này</DisclosureSummary>
              <DealerForm
                fields={[reason]}
                submit="Khóa tài khoản nhận hoàn"
                onSubmit={async (data) => {
                  await api.post(`${base}/bank-accounts/${id}/disable`, data);
                  setRevealed(null);
                  await done();
                }}
              />
            </details>
          )}
        </>
      )}
    </div>
  );
}
