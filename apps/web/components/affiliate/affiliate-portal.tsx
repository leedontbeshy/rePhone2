'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BankIcon,
  ChartLineUpIcon,
  LinkIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { useAuth } from '@/app/auth-provider';
import { PartnerLanding } from '@/components/partners/partner-landing';
import { useAffiliateMembership } from './affiliate-membership';
import { Button, InlineAlert } from '@/components/ui';
import { affiliateApi, currency, date, record, rows, text, type Row } from '@/lib/affiliate-api';
import {
  CommissionTable,
  Field,
  Form,
  Pager,
  PayoutHistory,
  Stats,
  Status,
} from './affiliate-shared';
import styles from './affiliate.module.css';
const tabs = [
  ['overview', 'Tổng quan', ChartLineUpIcon],
  ['links', 'Link giới thiệu', LinkIcon],
  ['bank', 'Nhận hoa hồng', BankIcon],
  ['profile', 'Hồ sơ', UserCircleIcon],
] as const;
export function AffiliatePortal() {
  const auth = useAuth();
  useEffect(() => {
    if (auth.status !== 'anonymous') return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('bank-token');
    if (token && /^[\w-]{43}$/.test(token)) {
      // Keep the confirmation out of login URLs and preserve it across sign-in in this tab.
      window.sessionStorage.setItem('affiliate-bank-confirmation', token);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [auth.status]);
  return (
    <>
      {auth.status === 'loading' ? (
        <p role="status">Đang tải…</p>
      ) : auth.status !== 'authenticated' ? (
        <PartnerLanding kind="affiliate" />
      ) : auth.role !== 'CUSTOMER' ? (
        <Link href="/backoffice/affiliates">Mở quản lý cộng tác viên</Link>
      ) : (
        <Portal key={auth.user?.id} />
      )}
    </>
  );
}
function Portal() {
  const auth = useAuth();
  const membership = useAffiliateMembership();
  const api = useMemo(() => affiliateApi(auth.client), [auth.client]);
  const [profile, setProfile] = useState<Row | null>(null);
  const [config, setConfig] = useState<Row>({});
  const [dashboard, setDashboard] = useState<Row>({});
  const [offers, setOffers] = useState<Row>({});
  const [offersLoading, setOffersLoading] = useState(false);
  const [tab, setTab] = useState('overview');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bankToken, setBankToken] = useState('');
  const requestKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    const c = record(await api.get('affiliate-program'));
    setConfig(c);
    if (c['ready']) {
      const p = await api.get('affiliate/profile');
      setProfile(p ? record(p) : null);
      if (p) setDashboard(record(await api.get(`affiliate/dashboard?page=${page.toString()}`)));
    }
    setLoaded(true);
  }, [api, page]);
  useEffect(() => {
    let active = true;
    void load().catch((e: unknown) => {
      if (active) {
        setError(e instanceof Error ? e.message : 'Không tải được dữ liệu.');
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    const readToken = () => {
      const token =
        new URLSearchParams(window.location.hash.slice(1)).get('bank-token') ??
        window.sessionStorage.getItem('affiliate-bank-confirmation');
      window.sessionStorage.removeItem('affiliate-bank-confirmation');
      if (token) {
        setBankToken(token);
        setTab('bank');
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    readToken();
    window.addEventListener('hashchange', readToken);
    return () => {
      window.removeEventListener('hashchange', readToken);
    };
  }, []);
  useEffect(() => {
    if (tab !== 'links' || !profile) return;
    let active = true;
    setOffersLoading(true);
    const timer = setTimeout(() => {
      void api
        .get(`affiliate/offers?page=${page.toString()}&search=${encodeURIComponent(search)}`)
        .then((v) => {
          if (active) setOffers(record(v));
        })
        .catch((e: unknown) => {
          if (active) {
            setOffers({});
            setError(e instanceof Error ? e.message : 'Không tải được máy.');
          }
        })
        .finally(() => {
          if (active) setOffersLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, tab, page, search, profile]);
  async function act(work: () => Promise<unknown>, message = 'Đã lưu thay đổi.') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await work();
      await load();
      setNotice(typeof result === 'string' ? result : message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thể hoàn tất.');
    } finally {
      setBusy(false);
    }
  }
  async function copy(path: string) {
    await act(
      () => navigator.clipboard.writeText(`${window.location.origin}${path}`),
      'Đã sao chép link giới thiệu.',
    );
  }
  const sharePath = `/r/${text(profile?.['code'])}`;
  const banks = rows(profile?.['banks']);
  const currentBank = banks.find(
    (b) =>
      b['verifiedAt'] &&
      !b['disabledAt'] &&
      new Date(text(b['effectiveAt'])).getTime() <= Date.now(),
  );
  const hasOpenPayout = BigInt(text(dashboard['reservedAmount']) || '0') > BigInt(0);
  return (
    <div className={styles.workspace}>
      {loaded && (!profile || profile['status'] === 'REJECTED') ? (
        <PartnerLanding kind="affiliate" signedIn />
      ) : (
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>rePhone • Cộng tác viên</span>
            <h1>Góc cộng tác viên</h1>
            <p>
              Bạn giới thiệu, rePhone tư vấn và giao hàng. Theo dõi hoa hồng minh bạch ngay tại đây.
            </p>
          </div>
          <UsersThreeIcon className={styles.heroIcon} weight="duotone" aria-hidden />
        </header>
      )}
      {config['environment'] === 'TEST' && (
        <p className={styles.notice}>
          Môi trường thử nghiệm · Dữ liệu và khoản chi dùng để kiểm thử.
        </p>
      )}
      {error && (
        <InlineAlert title="Chưa thể hoàn tất" tone="danger" role="alert">
          {error}
          <Button
            className={styles.retryAction}
            variant="ghost"
            onClick={() => void act(load, 'Đã tải lại dữ liệu.')}
          >
            Thử tải lại
          </Button>
        </InlineAlert>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {!loaded ? (
        <p role="status">Đang tải chương trình…</p>
      ) : !config['ready'] ? (
        <section className={styles.card} id="dang-ky">
          <h2>Chương trình đang được chuẩn bị</h2>
          <p>rePhone sẽ thông báo khi bắt đầu nhận cộng tác viên.</p>
        </section>
      ) : !profile || profile['status'] === 'REJECTED' ? (
        <div className={styles.split}>
          <section className={styles.card} id="dang-ky">
            <span className={styles.eyebrow}>HỒ SƠ THAM GIA</span>
            <h2>Đăng ký cộng tác viên</h2>
            <p>
              Điền thông tin bên dưới. rePhone sẽ xét duyệt trước khi kích hoạt link giới thiệu.
            </p>
            {profile?.['reason'] ? <p>Lần đăng ký trước: {text(profile['reason'])}</p> : null}
            {!config['enabled'] ? (
              <p>Chương trình đang tạm ngừng nhận hồ sơ mới.</p>
            ) : (
              <Form
                busy={busy}
                label="Gửi hồ sơ đăng ký"
                submit={(d) =>
                  act(async () => {
                    await api.post('affiliate/application', {
                      displayName: d.get('displayName'),
                      phone: d.get('phone'),
                      promotionChannels: d.get('promotionChannels'),
                      termsVersion: config['termsVersion'],
                    });
                    membership.refresh();
                    window.history.replaceState(null, '', window.location.pathname);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }, 'Đã gửi hồ sơ. rePhone sẽ xét duyệt trước khi kích hoạt link.')
                }
              >
                <div className={styles.grid}>
                  <Field
                    name="displayName"
                    label="Tên hiển thị"
                    value={auth.user?.fullName ?? ''}
                    help="Tên dùng trong chương trình cộng tác viên."
                  />
                  <Field
                    name="phone"
                    label="Số điện thoại"
                    value={auth.user?.phone ?? ''}
                    help="Số liên hệ để rePhone hỗ trợ bạn."
                  />
                </div>
                <label className={styles.field}>
                  <span>Kênh giới thiệu</span>
                  <textarea
                    name="promotionChannels"
                    required
                    minLength={5}
                    maxLength={1000}
                    placeholder="Ví dụ: Facebook cá nhân, TikTok, website…"
                  />
                  <small>Mô tả nơi bạn dự định chia sẻ link.</small>
                </label>
                <label className={styles.check}>
                  <input type="checkbox" required />
                  <span>
                    Tôi đồng ý{' '}
                    <Link href="/affiliate/terms" target="_blank">
                      điều khoản cộng tác viên
                    </Link>
                    .
                  </span>
                </label>
              </Form>
            )}
          </section>
          <HowItWorks />
        </div>
      ) : (
        <>
          <div className={styles.actions}>
            <Status value={profile['status']} />
            <span className={styles.muted}>{text(profile['displayName'])}</span>
            {!config['enabled'] && <span>Đang tạm ngừng ghi nhận giới thiệu mới.</span>}
            {profile['payoutHold'] ? <span>Chi trả đang được đối soát.</span> : null}
          </div>
          {profile['status'] === 'PENDING' ? (
            <section className={styles.card}>
              <h2>Hồ sơ đang chờ duyệt</h2>
              <p>Bạn có thể sử dụng link sau khi rePhone chấp thuận hồ sơ.</p>
            </section>
          ) : (
            <>
              <nav className={styles.tabs} aria-label="Khu vực cộng tác viên">
                {tabs.map(([key, label, Icon]) => (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={tab === key}
                    onClick={() => {
                      setTab(key);
                      setPage(1);
                    }}
                  >
                    <Icon size={19} aria-hidden />
                    {label}
                  </button>
                ))}
              </nav>
              {tab === 'overview' && (
                <>
                  <Stats dashboard={dashboard} />
                  <div className={styles.split}>
                    <section className={styles.card}>
                      <h2>Link giới thiệu của bạn</h2>
                      <p>
                        Link ghi nhận lượt giới thiệu hợp lệ gần nhất trong 30 ngày, trên cùng trình
                        duyệt.
                      </p>
                      <div className={styles.linkbox}>{sharePath}</div>
                      <div>
                        <Button
                          iconLeading={<LinkIcon />}
                          disabled={profile['status'] !== 'ACTIVE' || !config['enabled']}
                          onClick={() => void copy(sharePath)}
                        >
                          Sao chép link
                        </Button>
                      </div>
                      <p>{text(dashboard['clicks']) || '0'} lượt link hợp lệ đã được ghi nhận.</p>
                    </section>
                    <HowItWorks />
                  </div>
                  <CommissionTable dashboard={dashboard} />
                  <Pager page={page} more={dashboard['hasMore'] === true} change={setPage} />
                </>
              )}
              {tab === 'links' && (
                <>
                  <section className={styles.card}>
                    <h2>Chọn iPhone để giới thiệu</h2>
                    <p>
                      Hoa hồng hiển thị là dự kiến; số tiền thực tế phụ thuộc giá và ưu đãi tại thời
                      điểm khách đặt hàng.
                    </p>
                    <label>
                      Tìm dòng máy
                      <input
                        className={styles.search}
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Ví dụ: iPhone 13"
                      />
                    </label>
                  </section>
                  {offersLoading && (
                    <p className={styles.notice} role="status">
                      Đang tìm máy phù hợp…
                    </p>
                  )}
                  <div className={styles.grid} aria-busy={offersLoading}>
                    {!offersLoading &&
                      rows(offers['items']).map((o) => (
                        <article
                          className={[styles.card, styles.offerCard].join(' ')}
                          key={text(o['id'])}
                        >
                          <div className={styles.eyebrow}>{text(o['inventoryCode'])}</div>
                          <h2>{text(o['productName'])}</h2>
                          <p>{text(o['variantName'])}</p>
                          <div className={styles.actions}>
                            <strong>{currency(o['price'])}</strong>
                            <span className={styles.status}>
                              Dự kiến {currency(o['estimatedCommission'])}
                            </span>
                          </div>
                          <div className={styles.actions}>
                            <Button
                              disabled={text(o['estimatedCommission']) === '0'}
                              onClick={() => void copy(text(o['sharePath']))}
                            >
                              Sao chép link
                            </Button>
                            <Link href={text(o['destination'])}>Xem máy</Link>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!offersLoading && !rows(offers['items']).length && (
                    <p className={styles.empty}>Chưa có máy phù hợp để giới thiệu.</p>
                  )}
                  <Pager page={page} more={offers['hasMore'] === true} change={setPage} />
                </>
              )}
              {tab === 'bank' && (
                <>
                  <Stats dashboard={dashboard} />
                  {bankToken && (
                    <section className={styles.card}>
                      <h2>Xác nhận tài khoản nhận tiền</h2>
                      <p>Chỉ xác nhận nếu chính bạn vừa gửi thông tin ngân hàng.</p>
                      <Button
                        loading={busy}
                        onClick={() =>
                          void act(async () => {
                            await api.post('affiliate/banks/confirm', { token: bankToken });
                            setBankToken('');
                          }, 'Đã xác nhận email. Tài khoản đang chờ rePhone duyệt.')
                        }
                      >
                        Xác nhận tài khoản ngân hàng
                      </Button>
                    </section>
                  )}
                  <div className={styles.split}>
                    <section className={styles.card}>
                      <h2>Yêu cầu rút hoa hồng</h2>
                      <p>
                        Rút toàn bộ số dư khả dụng từ 200.000đ. Hoa hồng chờ 14 ngày sau khi đơn
                        hoàn tất và thu đủ tiền.
                      </p>
                      {currentBank ? (
                        <p>
                          Nhận tại {text(currentBank['bankName'])} · ••••{' '}
                          {text(currentBank['lastFour'])}
                        </p>
                      ) : (
                        <p>Hãy thêm và xác minh tài khoản ngân hàng trước khi rút tiền.</p>
                      )}
                      <Button
                        loading={busy}
                        disabled={
                          hasOpenPayout ||
                          !currentBank ||
                          Boolean(profile['payoutHold']) ||
                          rows(dashboard['totals'])
                            .filter((r) => r['status'] === 'AVAILABLE')
                            .reduce((s, r) => s + BigInt(text(r['amount'])), BigInt(0)) <
                            BigInt(200000)
                        }
                        onClick={() =>
                          void act(async () => {
                            requestKey.current ??= crypto.randomUUID();
                            await api.post('affiliate/payouts', { requestKey: requestKey.current });
                            requestKey.current = null;
                          }, 'Đã gửi yêu cầu rút tiền.')
                        }
                      >
                        Rút toàn bộ số dư khả dụng
                      </Button>
                      {hasOpenPayout && (
                        <p role="status">
                          Bạn có một yêu cầu đang xử lý. Xem tiến độ trong lịch sử bên dưới trước
                          khi gửi khoản rút tiếp theo.
                        </p>
                      )}
                    </section>
                    <section className={styles.card}>
                      <h2>Tài khoản nhận tiền</h2>
                      <p>
                        Xác nhận qua email, sau đó rePhone kiểm tra. Tài khoản thay thế có hiệu lực
                        sau 24 giờ kể từ khi duyệt.
                      </p>
                      {banks.map((b) => (
                        <div key={text(b['id'])}>
                          <strong>
                            {text(b['bankName'])} · •••• {text(b['lastFour'])}
                          </strong>
                          <p>
                            {text(b['accountHolder'])} ·{' '}
                            {b['disabledAt']
                              ? 'Đã ngừng sử dụng'
                              : b['verifiedAt']
                                ? `Hiệu lực từ ${date(b['effectiveAt'])}`
                                : b['emailConfirmedAt']
                                  ? 'Đang chờ rePhone duyệt'
                                  : 'Chờ xác nhận email'}
                          </p>
                        </div>
                      ))}
                      <details>
                        <summary>Thêm hoặc thay đổi tài khoản</summary>
                        <Form
                          busy={busy}
                          label="Lưu và gửi email xác nhận"
                          submit={(d) =>
                            act(async () => {
                              const result = record(
                                await api.post('affiliate/banks', Object.fromEntries(d)),
                              );
                              if (result['emailStatus'] === 'FAILED')
                                return 'Thông tin đã được lưu, nhưng email chưa gửi được. Chờ 60 giây rồi gửi lại cùng thông tin.';
                              return 'Thông tin đã được lưu. Kiểm tra email để xác nhận; có thể gửi lại sau 60 giây.';
                            }, 'Thông tin đã được lưu. Kiểm tra email để xác nhận; nếu chưa nhận được, có thể gửi lại sau 60 giây.')
                          }
                        >
                          <input
                            type="text"
                            autoComplete="username"
                            value={auth.user?.email ?? ''}
                            readOnly
                            hidden
                          />
                          <Field
                            name="bankName"
                            label="Ngân hàng"
                            help="Tên ngân hàng nhận hoa hồng."
                          />
                          <Field
                            name="accountHolder"
                            label="Tên chủ tài khoản"
                            help="Họ tên đúng như đăng ký tại ngân hàng."
                          />
                          <Field
                            name="accountNumber"
                            label="Số tài khoản"
                            help="Nhập số tài khoản, không phải số thẻ."
                          />
                          <Field
                            name="currentPassword"
                            type="password"
                            label="Mật khẩu hiện tại"
                            help="Mật khẩu rePhone để xác nhận thay đổi."
                          />
                        </Form>
                      </details>
                    </section>
                  </div>
                  <PayoutHistory dashboard={dashboard} />
                  <Pager page={page} more={dashboard['hasMore'] === true} change={setPage} />
                </>
              )}
              {tab === 'profile' && (
                <div className={styles.split}>
                  <section className={styles.card}>
                    <h2>Hồ sơ cộng tác viên</h2>
                    <p>
                      <strong>{text(profile['displayName'])}</strong> · {text(profile['phone'])}
                    </p>
                    <p>{text(profile['promotionChannels'])}</p>
                    <p>Tham gia ngày {date(profile['createdAt'])}</p>
                    {profile['reason'] ? <p>Ghi chú: {text(profile['reason'])}</p> : null}
                    <Link href="/affiliate/terms">Điều khoản chương trình</Link>
                  </section>
                  <HowItWorks />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
function HowItWorks() {
  return (
    <aside className={styles.card}>
      <h2>Ba bước nhận hoa hồng</h2>
      <ol className={styles.steps}>
        <li>
          <strong>Chia sẻ link</strong>Giới thiệu iPhone cho người có nhu cầu.
        </li>
        <li>
          <strong>Khách mua tại rePhone</strong>rePhone xử lý tư vấn, thanh toán, giao máy và bảo
          hành.
        </li>
        <li>
          <strong>Nhận tiền</strong>Đơn hợp lệ qua thời gian chờ sẽ cộng vào số dư có thể rút.
        </li>
      </ol>
      <Link href="/affiliate/terms">Xem cách ghi nhận hoa hồng</Link>
    </aside>
  );
}
