'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UsersThreeIcon,
  ChartLineUpIcon,
  IdentificationCardIcon,
  DeviceMobileIcon,
  BankIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react';
import { useAuth } from '@/app/auth-provider';
import { OperationsShell } from '@/components/backoffice/operations/operations-shell';
import { Button, InlineAlert } from '@/components/ui';
import {
  affiliateApi,
  currency,
  date,
  record,
  rows,
  text,
  type AffiliateApi,
  type Row,
} from '@/lib/affiliate-api';
import { CommissionTable, Field, Form, Pager, Stats, Status } from './affiliate-shared';
import styles from './affiliate.module.css';
const base = 'backoffice/affiliates';
type Act = (work: () => Promise<unknown>, message?: string) => Promise<void>;
export function AffiliateAdmin() {
  const auth = useAuth();
  return (
    <OperationsShell breadcrumbs={[{ label: 'Cộng tác viên' }]}>
      {auth.role === 'ADMIN' ? (
        <AdminContent />
      ) : (
        <p>Chỉ quản trị viên được quản lý chương trình cộng tác viên.</p>
      )}
    </OperationsShell>
  );
}
function AdminContent() {
  const auth = useAuth();
  const api = useMemo(() => affiliateApi(auth.client), [auth.client]);
  const [tab, setTab] = useState('overview');
  const [policy, setPolicy] = useState<Row>({});
  const [dashboard, setDashboard] = useState<Row>({});
  const [data, setData] = useState<Row>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const p = record(await api.get(`${base}/policy`));
    setPolicy(p);
    if (p['ready']) {
      setDashboard(record(await api.get(`${base}/dashboard?page=${page.toString()}`)));
      if (tab === 'members' || tab === 'offers')
        setData(
          record(
            await api.get(
              `${base}/${tab}?page=${page.toString()}&search=${encodeURIComponent(search)}`,
            ),
          ),
        );
    }
    setLoaded(true);
  }, [api, page, search, tab]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void load().catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Không tải được dữ liệu.');
          setLoaded(true);
        }
      });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);
  const act: Act = async (work, message = 'Đã lưu thay đổi.') => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await load();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thể hoàn tất.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.workspace}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Kênh tăng trưởng • Một cấp</span>
          <h1>Quản lý cộng tác viên</h1>
          <p>Duyệt đối tác giới thiệu, bảo vệ lợi nhuận và đối chiếu từng khoản hoa hồng.</p>
        </div>
        <UsersThreeIcon className={styles.heroIcon} weight="duotone" />
      </header>
      {policy['environment'] === 'TEST' && (
        <p className={styles.notice}>
          Môi trường thử nghiệm · Dữ liệu và khoản chi dùng để kiểm thử.
        </p>
      )}
      {error && (
        <InlineAlert title="Chưa thể hoàn tất" tone="danger" role="alert">
          {error}
        </InlineAlert>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {!loaded ? (
        <p role="status">Đang tải…</p>
      ) : !policy['ready'] ? (
        <section className={styles.card}>
          <h2>Chương trình chưa sẵn sàng</h2>
          <p>Cấu hình môi trường cộng tác viên trước khi mở chương trình.</p>
        </section>
      ) : (
        <>
          <nav className={styles.tabs} aria-label="Quản lý cộng tác viên">
            {(
              [
                ['overview', 'Tổng quan', ChartLineUpIcon],
                ['members', 'Hồ sơ & ngân hàng', IdentificationCardIcon],
                ['offers', 'Hoa hồng từng máy', DeviceMobileIcon],
                ['payouts', 'Yêu cầu rút tiền', BankIcon],
                ['policy', 'Cấu hình', SlidersHorizontalIcon],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                  setSearch('');
                }}
              >
                <Icon size={18} aria-hidden />
                {label}
              </button>
            ))}
          </nav>
          <div className={styles.toolbar}>
            <Status value={policy['enabled'] ? 'ACTIVE' : 'SUSPENDED'} />
            <span className={styles.muted}>
              Hoa hồng chung:{' '}
              {policy['rateBps'] == null
                ? 'Chưa cấu hình'
                : `${String(Number(policy['rateBps']) / 100)}%`}
            </span>
            <Button
              size="compact"
              variant="secondary"
              loading={busy}
              onClick={() => void act(load, 'Đã làm mới dữ liệu.')}
            >
              Làm mới
            </Button>
          </div>
          {tab === 'overview' && (
            <>
              <Stats dashboard={dashboard} />
              <section className={styles.card}>
                <h2>Đối soát hoa hồng</h2>
                <p>
                  Hoa hồng chờ 14 ngày sau khi đơn hoàn tất và thu đủ tiền. Trường hợp hậu mãi chưa
                  đóng sẽ tạm giữ.
                </p>
                <p>
                  Chi phí rePhone chịu sau khi đã trả hoa hồng:{' '}
                  <strong>
                    {currency(
                      rows(dashboard['totals'])
                        .reduce((sum, r) => sum + BigInt(text(r['absorbedLoss']) || '0'), BigInt(0))
                        .toString(),
                    )}
                  </strong>
                </p>
                <Button
                  loading={busy}
                  variant="secondary"
                  onClick={() =>
                    void act(async () => {
                      const r = record(await api.post(`${base}/reconcile`));
                      if (r['hasMore'])
                        setNotice(
                          'Đã xử lý một đợt; tiếp tục đối soát để cập nhật các đơn còn lại.',
                        );
                    }, 'Đã cập nhật đợt đối soát (tối đa 100 đơn).')
                  }
                >
                  Cập nhật điều kiện hoa hồng
                </Button>
              </section>
              <CommissionTable dashboard={dashboard} />
              <Pager page={page} more={dashboard['hasMore'] === true} change={setPage} />
            </>
          )}
          {(tab === 'members' || tab === 'offers') && (
            <>
              <label className={styles.form}>
                Tìm {tab === 'members' ? 'cộng tác viên' : 'dòng máy'}
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={tab === 'members' ? 'Tên hoặc mã giới thiệu' : 'Tên iPhone'}
                />
              </label>
              <div className={styles.grid}>
                {rows(data['items']).map((r) =>
                  tab === 'members' ? (
                    <Member
                      key={`${text(r['id'])}-${text(r['version'])}`}
                      row={r}
                      api={api}
                      act={act}
                      busy={busy}
                    />
                  ) : (
                    <Offer
                      key={`${text(r['id'])}-${text(r['rateBps'])}-${text(r['enabled'])}`}
                      row={r}
                      api={api}
                      act={act}
                      busy={busy}
                    />
                  ),
                )}
              </div>
              {!rows(data['items']).length && (
                <p className={styles.empty}>Chưa có kết quả phù hợp.</p>
              )}
              <Pager page={page} more={data['hasMore'] === true} change={setPage} />
            </>
          )}
          {tab === 'payouts' && (
            <>
              <div className={styles.grid}>
                {rows(dashboard['payouts']).map((p) => (
                  <Payout
                    key={`${text(p['id'])}-${text(p['status'])}`}
                    row={p}
                    api={api}
                    act={act}
                    busy={busy}
                  />
                ))}
              </div>
              {!rows(dashboard['payouts']).length && (
                <p className={styles.empty}>Chưa có yêu cầu rút tiền.</p>
              )}
              <Pager page={page} more={dashboard['hasMore'] === true} change={setPage} />
            </>
          )}
          {tab === 'policy' && (
            <div className={styles.split}>
              <section className={styles.card}>
                <h2>Chính sách hoa hồng</h2>
                <Form
                  key={text(policy['version'])}
                  busy={busy}
                  label="Lưu chính sách"
                  submit={(d) =>
                    act(() =>
                      api.post(`${base}/policy`, {
                        enabled: d.get('enabled') === 'on',
                        rateBps: Math.round(Number(d.get('rate')) * 100),
                        reserveAmount: d.get('reserveAmount'),
                        minimumProfit: d.get('minimumProfit'),
                        expectedVersion: policy['version'],
                      }),
                    )
                  }
                >
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={policy['enabled'] === true}
                    />
                    Mở đăng ký và ghi nhận giới thiệu mới
                  </label>
                  <Field
                    name="rate"
                    label="Hoa hồng chung (%)"
                    type="number"
                    min={0}
                    max={5}
                    step={0.01}
                    value={policy['rateBps'] == null ? '' : String(Number(policy['rateBps']) / 100)}
                    help="Từ 0% đến 5%. Có thể thiết lập riêng cho từng máy."
                  />
                  <div className={styles.grid}>
                    <Field
                      name="reserveAmount"
                      label="Dự phòng mỗi máy (đ)"
                      type="number"
                      min={0}
                      value={text(policy['reserveAmount'])}
                      help="Khoản dự phòng chi phí và hậu mãi của mỗi máy."
                    />
                    <Field
                      name="minimumProfit"
                      label="Lợi nhuận tối thiểu (đ)"
                      type="number"
                      min={0}
                      value={text(policy['minimumProfit'])}
                      help="Lợi nhuận cần giữ lại sau khi trả hoa hồng."
                    />
                  </div>
                </Form>
              </section>
              <section className={styles.card}>
                <h2>Cách bảo vệ lợi nhuận</h2>
                <p>
                  Hoa hồng = tiền iPhone sau giảm giá × tỷ lệ. Nếu số tiền này làm lợi nhuận thấp
                  hơn mức bảo vệ, hoa hồng sẽ được giảm tương ứng.
                </p>
                <p>Mức bảo vệ gồm giá nhập, chi phí bổ sung, dự phòng và lợi nhuận tối thiểu.</p>
                <p>
                  Ví dụ: tính theo tỷ lệ được 200.000đ nhưng máy chỉ còn dư 150.000đ sau mức bảo vệ,
                  hoa hồng sẽ là 150.000đ.
                </p>
                <p>
                  Tắt chương trình dừng hồ sơ và giới thiệu mới. Các khoản đã ghi nhận tiếp tục được
                  xử lý.
                </p>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Member({
  row: r,
  api,
  act,
  busy,
}: {
  row: Row;
  api: AffiliateApi;
  act: Act;
  busy: boolean;
}) {
  const [bank, setBank] = useState<Row | null>(null);
  return (
    <section className={styles.card}>
      <div className={styles.actions}>
        <h2>{text(r['displayName'])}</h2>
        <Status value={r['status']} />
      </div>
      <p>
        {text(r['phone'])} · {text(r['code'])}
      </p>
      <p>{text(r['promotionChannels'])}</p>
      <details>
        <summary>Duyệt / cập nhật hồ sơ</summary>
        <Form
          busy={busy}
          label="Cập nhật hồ sơ"
          submit={(d) =>
            act(() =>
              api.post(`${base}/members/${text(r['id'])}`, {
                status: d.get('status'),
                payoutHold: d.get('payoutHold') === 'on',
                reason: d.get('reason'),
                expectedVersion: r['version'],
              }),
            )
          }
        >
          <label>
            Trạng thái
            <select
              name="status"
              defaultValue={r['status'] === 'PENDING' ? 'ACTIVE' : text(r['status'])}
            >
              <option value="ACTIVE">Hoạt động</option>
              <option value="SUSPENDED">Tạm ngừng giới thiệu</option>
              {r['status'] === 'PENDING' && <option value="REJECTED">Từ chối hồ sơ</option>}
            </select>
          </label>
          <label className={styles.check}>
            <input name="payoutHold" type="checkbox" defaultChecked={r['payoutHold'] === true} />
            Tạm giữ chi trả để đối soát
          </label>
          <Field name="reason" label="Lý do cập nhật" />
        </Form>
      </details>
      <hr className={styles.divider} />
      <h3>Ngân hàng nhận tiền</h3>
      {rows(r['banks']).map((b) => (
        <div key={text(b['id'])}>
          <p>
            {text(b['bankName'])} · •••• {text(b['lastFour'])} · {text(b['accountHolder'])}
          </p>
          <p>
            {b['verifiedAt']
              ? `Đã duyệt · Hiệu lực ${date(b['effectiveAt'])}`
              : b['emailConfirmedAt']
                ? 'Email đã xác nhận'
                : 'Chưa xác nhận email'}
          </p>
          <div className={styles.actions}>
            <Button
              size="compact"
              variant="secondary"
              onClick={() =>
                void act(async () => {
                  setBank(record(await api.get(`${base}/banks/${text(b['id'])}`)));
                }, 'Đã mở thông tin đối chiếu ngân hàng.')
              }
            >
              Xem để đối chiếu
            </Button>
            {Boolean(b['emailConfirmedAt']) && !b['verifiedAt'] && (
              <Button
                size="compact"
                loading={busy}
                onClick={() => void act(() => api.post(`${base}/banks/${text(b['id'])}/verify`))}
              >
                Xác minh tài khoản
              </Button>
            )}
          </div>
        </div>
      ))}
      {!rows(r['banks']).length && <p>Chưa thêm tài khoản.</p>}
      {bank && (
        <div className={styles.linkbox}>
          <strong>{text(bank['bankName'])}</strong>
          <p>
            {text(bank['accountNumber'])} · {text(bank['accountHolder'])}
          </p>
          <Button
            variant="ghost"
            size="compact"
            onClick={() => {
              setBank(null);
            }}
          >
            Ẩn thông tin
          </Button>
        </div>
      )}
    </section>
  );
}
function Offer({
  row: r,
  api,
  act,
  busy,
}: {
  row: Row;
  api: AffiliateApi;
  act: Act;
  busy: boolean;
}) {
  return (
    <section className={styles.card}>
      <span className={styles.eyebrow}>{text(r['inventoryCode'])}</span>
      <h2>{text(r['productName'])}</h2>
      <p>
        {text(r['variantName'])} · {currency(r['price'])}
      </p>
      <strong>Hoa hồng dự kiến: {currency(r['estimatedCommission'])}</strong>
      {!r['eligible'] && <p>Máy đang tắt hoa hồng hoặc thiếu cấu hình giá vốn / mức bảo vệ.</p>}
      <Form
        busy={busy}
        label="Lưu hoa hồng máy"
        submit={(d) =>
          act(() =>
            api.post(`${base}/offers/${text(r['id'])}`, {
              enabled: d.get('enabled') === 'on',
              ...(d.get('rate') === '' ? {} : { rateBps: Math.round(Number(d.get('rate')) * 100) }),
            }),
          )
        }
      >
        <label className={styles.check}>
          <input name="enabled" type="checkbox" defaultChecked={r['enabled'] === true} />
          Cho phép tính hoa hồng
        </label>
        <Field
          name="rate"
          label="Tỷ lệ riêng (%)"
          type="number"
          min={0}
          max={5}
          step={0.01}
          required={false}
          value={r['overrideRateBps'] == null ? '' : String(Number(r['overrideRateBps']) / 100)}
          help="Để trống để dùng tỷ lệ chung. Nhập 0 để không trả hoa hồng."
        />
      </Form>
    </section>
  );
}
function Payout({
  row: r,
  api,
  act,
  busy,
}: {
  row: Row;
  api: AffiliateApi;
  act: Act;
  busy: boolean;
}) {
  const [destination, setDestination] = useState('');
  const [url, setUrl] = useState('');
  return (
    <section className={styles.card}>
      <div className={styles.actions}>
        <h2>{currency(r['amount'])}</h2>
        <Status value={r['status']} />
      </div>
      <p>
        Yêu cầu {text(r['id']).slice(-8)} · {date(r['createdAt'])}
      </p>
      <p>
        {text(record(r['bank'])['bankName'])} · •••• {text(record(r['bank'])['lastFour'])} ·{' '}
        {text(record(r['bank'])['accountHolder'])}
      </p>
      {r['note'] ? <p>{text(r['note'])}</p> : null}
      <Button
        size="compact"
        variant="secondary"
        onClick={() =>
          void act(async () => {
            setDestination(
              text(
                record(await api.get(`${base}/payouts/${text(r['id'])}/destination`))[
                  'accountNumber'
                ],
              ),
            );
          }, 'Đã mở tài khoản được chốt khi yêu cầu rút tiền.')
        }
      >
        Xem tài khoản nhận tiền
      </Button>
      {destination && (
        <div className={styles.linkbox}>
          {destination}
          <Button
            size="compact"
            variant="ghost"
            onClick={() => {
              setDestination('');
            }}
          >
            Ẩn
          </Button>
        </div>
      )}
      {['REQUESTED', 'PROCESSING', 'NEEDS_REVIEW'].includes(text(r['status'])) && (
        <Form
          busy={busy}
          label="Cập nhật xử lý"
          submit={(d) =>
            act(() =>
              api.post(`${base}/payouts/${text(r['id'])}`, {
                status: d.get('status'),
                note: d.get('note'),
                confirmedNotTransferred: d.get('confirmedNotTransferred') === 'on',
              }),
            )
          }
        >
          <label>
            Thao tác
            <select
              name="status"
              defaultValue={r['status'] === 'REQUESTED' ? 'PROCESSING' : 'NEEDS_REVIEW'}
            >
              {r['status'] === 'REQUESTED' && (
                <option value="PROCESSING">Bắt đầu chuyển tiền</option>
              )}
              <option value="NEEDS_REVIEW">Tạm giữ để đối soát</option>
              <option value="CANCELLED">Hủy khoản chi</option>
              <option value="REJECTED">Từ chối yêu cầu</option>
            </select>
          </label>
          <Field name="note" label="Ghi chú xử lý" />
          <label className={styles.check}>
            <input type="checkbox" name="confirmedNotTransferred" />
            Đã đối chiếu ngân hàng: chưa có khoản chuyển tiền
          </label>
        </Form>
      )}
      {['PROCESSING', 'NEEDS_REVIEW'].includes(text(r['status'])) && (
        <details>
          <summary>Ghi nhận đã chuyển tiền thành công</summary>
          <p>
            Chỉ hoàn tất sau khi ngân hàng xác nhận chuyển tiền thành công. Đối chiếu đúng số tiền
            và tài khoản phía trên.
          </p>
          <Form
            busy={busy}
            label="Xác nhận đã chi trả"
            submit={(d) =>
              act(() => {
                const at = text(d.get('transferredAt'));
                d.set('transferredAt', new Date(at).toISOString());
                return api.upload(`${base}/payouts/${text(r['id'])}/complete`, d);
              })
            }
          >
            <Field name="transferReference" label="Mã giao dịch ngân hàng" />
            <Field name="transferredAt" label="Thời điểm chuyển tiền" type="datetime-local" />
            <Field name="note" label="Ghi chú đối chiếu" />
            <label>
              Chứng từ
              <input
                name="file"
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                required
              />
              <small>Ảnh hoặc PDF, tối đa 10 MB.</small>
            </label>
          </Form>
        </details>
      )}
      {r['status'] === 'PAID' && (
        <>
          <p>Mã giao dịch: {text(r['transferReference'])}</p>
          <Button
            variant="secondary"
            onClick={() =>
              void act(async () => {
                setUrl(
                  text(record(await api.get(`${base}/payouts/${text(r['id'])}/evidence`))['url']),
                );
              }, 'Link chứng từ có hiệu lực trong 5 phút.')
            }
          >
            Mở chứng từ
          </Button>
          {url && (
            <a href={url} target="_blank" rel="noreferrer">
              Xem chứng từ riêng tư
            </a>
          )}
        </>
      )}
    </section>
  );
}
