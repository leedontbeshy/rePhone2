'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  IdentificationCardIcon as IdentificationCard,
  DeviceMobileIcon as DeviceMobile,
  PackageIcon as Package,
  ShieldCheckIcon as ShieldCheck,
  PlugsConnectedIcon as PlugsConnected,
  StorefrontIcon as Storefront,
  ArrowRightIcon as ArrowRight,
  BookOpenIcon as BookOpen,
  CreditCardIcon as CreditCard,
  CheckCircleIcon as CheckCircle,
} from '@phosphor-icons/react';
import { DealerCatalog } from './dealer-catalog';
import { DealerWorkspaceHeader, DealerCode } from './dealer-workspace';
import { useAuth } from '@/app/auth-provider';
import { PartnerLanding } from '@/components/partners/partner-landing';
import { DisclosureSummary, Button, InlineAlert } from '@/components/ui';
import {
  dealerApi,
  dealerDate,
  dealerMoney,
  dealerRecord,
  dealerRows,
  dealerStatus,
  dealerText,
  type DealerApi,
  type DealerRecord,
} from '@/lib/dealer-api';
import { DealerEmpty, DealerForm, DealerSecret, DealerUpload } from './dealer-primitives';
import { DealerCheckout } from './dealer-checkout';
import { DealerOrderView } from './dealer-order-view';
import styles from './dealer.module.css';
import { bankDeliveryNotice, bankIsEffective, bankStatus } from './dealer-bank-status';

const tabs = [
  ['profile', 'Hồ sơ'],
  ['catalog', 'Kho máy'],
  ['orders', 'Đơn hàng'],
  ['after-sales', 'Hậu mãi'],
  ['integration', 'Kết nối website'],
] as const;
type Tab = (typeof tabs)[number][0];
const tabIcons = {
  profile: IdentificationCard,
  catalog: DeviceMobile,
  orders: Package,
  'after-sales': ShieldCheck,
  integration: PlugsConnected,
};

export function DealerPortal() {
  const auth = useAuth();
  return (
    <>
      {auth.status === 'loading' ? (
        <DealerEmpty>Đang kiểm tra tài khoản…</DealerEmpty>
      ) : auth.status !== 'authenticated' ? (
        <PartnerLanding kind="dealer" />
      ) : auth.role !== 'CUSTOMER' ? (
        <DealerEmpty>
          <Link href="/backoffice/dealers">Mở khu vực quản lý đại lý</Link>
        </DealerEmpty>
      ) : (
        <PortalContent key={auth.user?.id} client={auth.client} />
      )}
    </>
  );
}

function PortalContent({ client }: { client: unknown }) {
  const api = useMemo(() => dealerApi(client), [client]);
  const [profile, setProfile] = useState<DealerRecord | null>(null);
  const [configuration, setConfiguration] = useState<DealerRecord>({});
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('profile');
  const [rows, setRows] = useState<DealerRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<DealerRecord | null>(null);
  const [offer, setOffer] = useState<DealerRecord | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);

  const loadProfile = useCallback(async () => {
    const config = dealerRecord(await api.get('dealer-portal/configuration'));
    setConfiguration(config);
    if (config['enabled'] === true) {
      const value = await api.get('dealer-portal/profile');
      setProfile(value === null ? null : dealerRecord(value));
    }
    setLoaded(true);
  }, [api]);
  useEffect(() => {
    let active = true;
    void loadProfile().catch((caught: unknown) => {
      if (active) {
        setError(caught instanceof Error ? caught.message : 'Không tải được hồ sơ.');
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [loadProfile]);
  const loadRows = useCallback(async () => {
    if (!profile || !['orders', 'after-sales'].includes(tab)) return;
    setBusy(true);
    setError('');
    try {
      const value = await api.get(
        tab === 'orders' ? `dealer/orders?page=${page.toString()}` : 'dealer/after-sales',
      );
      const data = dealerRecord(value);
      setRows(dealerRows(Array.isArray(value) ? value : data['items']));
      setMore(data['hasMore'] === true || Number(data['total'] ?? 0) > page * 20);
    } catch (caught) {
      setRows([]);
      setError(caught instanceof Error ? caught.message : 'Không tải được dữ liệu.');
    } finally {
      setBusy(false);
    }
  }, [api, profile, tab, page]);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);
  async function refreshOrder() {
    if (order) setOrder(dealerRecord(await api.get(`dealer/orders/${dealerText(order['id'])}`)));
    await loadRows();
  }
  async function selectOrder(id: string) {
    setError('');
    try {
      setOrder(dealerRecord(await api.get(`dealer/orders/${id}`)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được đơn.');
    }
  }
  const active = profile?.['businessStatus'] === 'ACTIVE';
  function selectTab(next: Tab) {
    setTab(next);
    setPage(1);
    setRows([]);
    setOrder(null);
    setOffer(null);
    setError('');
  }
  return (
    <div className={[styles.page, styles.portalPage].join(' ')}>
      {loaded && !profile ? (
        <PartnerLanding kind="dealer" signedIn />
      ) : (
        <DealerWorkspaceHeader
          title={dealerText(profile?.['displayName']) || 'Cổng đại lý'}
          description="Quản lý cửa hàng và kết nối bán hàng."
          test={configuration['environment'] === 'TEST'}
          variant={profile ? 'portal' : 'default'}
          status={dealerStatus(profile?.['businessStatus']) || 'Đăng ký đối tác'}
        >
          {profile && active && configuration['open'] === true ? (
            <Button
              className={styles.portalHeroAction}
              variant="secondary"
              onClick={() => {
                selectTab('catalog');
              }}
            >
              <Package size={22} aria-hidden />
              Xem kho máy
              <ArrowRight size={18} aria-hidden />
            </Button>
          ) : (
            <Link className={styles.secondaryLink} href="/dealer/api-guide">
              Hướng dẫn API <ArrowRight size={18} aria-hidden />
            </Link>
          )}
        </DealerWorkspaceHeader>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {!loaded ? (
        <DealerEmpty>Đang tải hồ sơ…</DealerEmpty>
      ) : configuration['enabled'] !== true ? (
        <div id="dang-ky">
          <DealerEmpty>
            Cổng đại lý chưa mở. Vui lòng liên hệ rePhone để đăng ký chương trình đại lý.
          </DealerEmpty>
        </div>
      ) : (
        <>
          {!profile && configuration['environment'] === 'TEST' && (
            <InlineAlert tone="info">Dữ liệu phát triển — không chuyển tiền thật</InlineAlert>
          )}
          {configuration['open'] !== true && (
            <InlineAlert tone="info">
              Cổng đại lý đang tạm đóng đăng ký và đặt hàng mới. Đơn đã tạo, thanh toán và hậu mãi
              vẫn được xử lý bình thường.
            </InlineAlert>
          )}
          {profile && (
            <nav className={styles.tabs} aria-label="Chức năng đại lý">
              {tabs.map(([key, label]) => (
                <Button
                  key={key}
                  variant={tab === key ? 'primary' : 'secondary'}
                  aria-current={tab === key ? 'page' : undefined}
                  onClick={() => {
                    selectTab(key);
                  }}
                >
                  {(() => {
                    const Icon = tabIcons[key];
                    return <Icon size={18} aria-hidden />;
                  })()}
                  {label}
                </Button>
              ))}
            </nav>
          )}
          {tab === 'profile' && (
            <div id="dang-ky">
              <DealerProfilePanel
                api={api}
                profile={profile}
                configuration={configuration}
                reload={loadProfile}
              />
            </div>
          )}
          {tab === 'catalog' &&
            (configuration['open'] !== true ? (
              <DealerEmpty>Cổng đang tạm ngừng nhận đơn mới.</DealerEmpty>
            ) : !active ? (
              <DealerEmpty>Hồ sơ cần được duyệt và đang hoạt động để đặt máy mới.</DealerEmpty>
            ) : (
              <>
                {offer && (
                  <div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setOffer(null);
                      }}
                    >
                      ← Quay lại kho máy
                    </Button>
                  </div>
                )}
                {offer && (
                  <DealerCheckout
                    key={dealerText(offer['inventoryUnitId'])}
                    offer={offer}
                    api={api}
                    created={(created) => {
                      setOffer(null);
                      setRows([]);
                      setOrder(created);
                      setTab('orders');
                    }}
                  />
                )}
                <div hidden={offer !== null}>
                  <DealerCatalog api={api} choose={setOffer} />
                </div>
              </>
            ))}
          {tab === 'orders' && (
            <>
              {order && (
                <DealerOrderView
                  key={dealerText(order['id'])}
                  order={order}
                  api={api}
                  refresh={refreshOrder}
                />
              )}
              <div className={styles.list}>
                {rows.map((row) => (
                  <article className={styles.card} key={dealerText(row['id'])}>
                    <div className={styles.header}>
                      <div>
                        <h3>{dealerText(row['orderNumber'])}</h3>
                        <p className={styles.muted}>
                          {dealerText(row['externalOrderId'])} · {dealerDate(row['createdAt'])}
                        </p>
                      </div>
                      <span className={styles.badge}>{dealerStatus(row['status'])}</span>
                    </div>
                    <div className={styles.actions}>
                      <strong>{dealerMoney(row['grandTotal'])}</strong>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void selectOrder(dealerText(row['id']));
                        }}
                      >
                        Xem đơn
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === 'after-sales' && (
            <div className={styles.list}>
              {rows.map((row) => (
                <DealerCase key={dealerText(row['id'])} row={row} api={api} refresh={loadRows} />
              ))}
            </div>
          )}
          {tab === 'integration' && profile && (
            <DealerIntegration
              api={api}
              profile={profile}
              configuration={configuration}
              reload={loadProfile}
            />
          )}
          {['orders', 'after-sales'].includes(tab) && (
            <>
              {busy ? (
                <DealerEmpty>Đang tải…</DealerEmpty>
              ) : (
                rows.length === 0 &&
                !error && <DealerEmpty>Chưa có dữ liệu trong mục này.</DealerEmpty>
              )}
              <div className={styles.actions}>
                {page > 1 && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPage((value) => value - 1);
                    }}
                  >
                    Trang trước
                  </Button>
                )}
                {more && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPage((value) => value + 1);
                    }}
                  >
                    Trang tiếp
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    void loadRows();
                  }}
                >
                  Làm mới
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DealerProfilePanel({
  api,
  profile,
  configuration,
  reload,
}: {
  api: DealerApi;
  profile: DealerRecord | null;
  configuration: DealerRecord;
  reload: () => Promise<void>;
}) {
  const [bankToken, setBankToken] = useState('');
  const [bankFormOpen, setBankFormOpen] = useState(false);
  const bankFormId = useId();
  const [notice, setNotice] = useState<ReturnType<typeof bankDeliveryNotice> | null>(null);
  const existingProfile = profile !== null && profile['businessStatus'] !== 'REJECTED';
  const activeBanks = dealerRows(profile?.['bankAccounts']).filter((bank) => !bank['disabledAt']);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('confirmBankToken');
    if (token) {
      setBankToken(token);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  return (
    <div className={styles.list}>
      {notice && <InlineAlert tone={notice.tone}>{notice.message}</InlineAlert>}
      <div className={existingProfile ? styles.portalProfileLayout : styles.list}>
        <div className={styles.portalProfileMain}>
          {(!profile || profile['businessStatus'] === 'REJECTED') &&
          configuration['open'] !== true ? (
            <DealerEmpty>rePhone đang tạm ngừng nhận hồ sơ đại lý mới.</DealerEmpty>
          ) : !profile || profile['businessStatus'] === 'REJECTED' ? (
            <section className={styles.card}>
              <h2>Đăng ký trở thành đại lý</h2>
              <p className={styles.muted}>
                Đại lý là bên bán và thu tiền khách. rePhone cung cấp máy, giao hàng và thực hiện
                bảo hành; các khoản hoàn từ rePhone được trả cho đại lý.
              </p>
              <DealerForm
                fieldsClassName={styles.applicationFields}
                fields={[
                  {
                    name: 'legalName',
                    label: 'Tên hộ kinh doanh / doanh nghiệp',
                    hint: 'Tên theo đăng ký kinh doanh.',
                  },
                  {
                    name: 'businessType',
                    label: 'Loại hình',
                    hint: 'Chọn loại hình đã đăng ký.',
                    options: [
                      { value: 'HOUSEHOLD', label: 'Hộ kinh doanh' },
                      { value: 'COMPANY', label: 'Doanh nghiệp' },
                      ...(configuration['environment'] === 'TEST'
                        ? [{ value: 'INDIVIDUAL', label: 'Cá nhân (thử nghiệm)' }]
                        : []),
                    ],
                  },
                  {
                    name: 'taxCode',
                    label: 'Mã số thuế',
                    hint: '8–20 ký tự: số và dấu gạch ngang.',
                    required: configuration['environment'] !== 'TEST',
                  },
                  {
                    name: 'representativeName',
                    label: 'Người đại diện',
                    hint: 'Họ tên người đại diện.',
                  },
                  {
                    name: 'businessAddress',
                    label: 'Địa chỉ kinh doanh',
                    hint: 'Số nhà, đường, phường/xã, tỉnh/thành.',
                  },
                  {
                    name: 'displayName',
                    label: 'Tên cửa hàng hiển thị cho khách',
                    hint: 'Tên trên đơn hàng và phiếu bảo hành.',
                  },
                  {
                    name: 'contactEmail',
                    label: 'Email hỗ trợ',
                    type: 'email',
                    hint: 'Email để khách liên hệ hỗ trợ.',
                  },
                  {
                    name: 'contactPhone',
                    label: 'Điện thoại hỗ trợ',
                    type: 'tel',
                    hint: 'Số điện thoại hỗ trợ khách.',
                  },
                  {
                    name: 'approvedDomains',
                    label: 'Tên miền website',
                    hint: 'VD: shop.vn. Cách nhau bằng dấu phẩy; có thể bỏ trống.',
                    required: false,
                  },
                ]}
                submit="Gửi hồ sơ đăng ký"
                onSubmit={async (data) => {
                  await api.post('dealer-portal/application', {
                    ...data,
                    taxCode: data['taxCode'] || undefined,
                    approvedDomains: (data['approvedDomains'] ?? '')
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                    termsVersion: configuration['termsVersion'],
                  });
                  await reload();
                }}
              >
                <label>
                  <input type="checkbox" required /> Tôi đã đọc{' '}
                  <Link href="/dealer/terms" target="_blank">
                    điều khoản đại lý {dealerText(configuration['termsVersion'])}
                  </Link>{' '}
                  và đồng ý trách nhiệm bên bán, hậu mãi và dòng hoàn tiền.
                </label>
              </DealerForm>
            </section>
          ) : (
            <section className={[styles.card, styles.portalProfileCard].join(' ')}>
              <h2>Thông tin cửa hàng</h2>
              <div className={styles.portalIdentity}>
                <span className={styles.portalSectionIcon}>
                  <Storefront size={30} weight="duotone" aria-hidden />
                </span>
                <div>
                  <h3>{dealerText(profile['legalName'])}</h3>
                  <p>Đối tác của rePhone</p>
                </div>
              </div>
              <dl className={styles.portalContactFacts}>
                {(
                  [
                    ['displayName', 'Tên cửa hàng'],
                    ['contactEmail', 'Email liên hệ'],
                    ['contactPhone', 'Số điện thoại'],
                    ['businessAddress', 'Địa chỉ kinh doanh'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{dealerText(profile[key]) || 'Chưa cung cấp'}</dd>
                  </div>
                ))}
              </dl>
              {profile['businessStatus'] === 'PENDING' && (
                <InlineAlert tone="info">
                  Hồ sơ đang chờ duyệt. Tài khoản nhận hoàn cần được bạn xác nhận qua email đăng
                  nhập, sau đó admin kiểm tra và xác minh.
                </InlineAlert>
              )}
            </section>
          )}
          {profile && (
            <section className={[styles.card, styles.portalBankCard].join(' ')}>
              <div className={styles.portalBankHeading}>
                <h2>Tài khoản nhận hoàn tiền</h2>
                <Button
                  variant="secondary"
                  size="compact"
                  aria-expanded={bankFormOpen}
                  aria-controls={bankFormId}
                  onClick={() => {
                    setBankFormOpen((value) => !value);
                  }}
                >
                  {bankFormOpen
                    ? 'Đóng biểu mẫu'
                    : activeBanks.length
                      ? 'Thay tài khoản'
                      : 'Thêm tài khoản'}
                </Button>
              </div>
              {activeBanks.length === 0 && (
                <p className={styles.muted}>
                  Chưa có tài khoản nhận hoàn. Thêm tài khoản và xác nhận qua email đăng nhập để
                  rePhone kiểm tra, xác minh.
                </p>
              )}
              {activeBanks.map((bank) => (
                <div className={styles.portalBankItem} key={dealerText(bank['id'])}>
                  <div className={styles.portalBankSummary}>
                    <span className={styles.portalSectionIcon}>
                      <CreditCard size={30} weight="duotone" aria-hidden />
                    </span>
                    <div className={styles.portalBankDetails}>
                      <div className={styles.portalBankAccount}>
                        <strong>•••• {dealerText(bank['accountLastFour'])}</strong>
                        <span
                          className={[
                            styles.badge,
                            bankIsEffective(bank)
                              ? styles.portalVerified
                              : styles.portalBankPending,
                          ].join(' ')}
                        >
                          {bankIsEffective(bank) && (
                            <CheckCircle size={16} weight="fill" aria-hidden />
                          )}
                          {bankStatus(bank)}
                        </span>
                      </div>
                      <p className={styles.portalBankHolder}>
                        {dealerText(bank['accountHolder'])} · {dealerText(bank['bankName'])}
                      </p>
                      <p className={styles.muted}>
                        Nhận hoàn tiền cho các giao dịch đủ điều kiện từ rePhone.
                      </p>
                    </div>
                  </div>
                  {!bank['emailConfirmedAt'] && (
                    <details className={styles.profileDisclosure}>
                      <DisclosureSummary>Gửi lại email xác nhận</DisclosureSummary>
                      <p className={styles.muted}>
                        Email được gửi tới địa chỉ đăng nhập, không phải email hỗ trợ của cửa hàng.
                        Liên kết mới thay thế liên kết cũ và có hiệu lực 30 phút.
                      </p>
                      <DealerForm
                        fields={[
                          { name: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password' },
                        ]}
                        submit="Gửi lại email"
                        onSubmit={async (data) => {
                          const result = dealerRecord(
                            await api.post(
                              `dealer-portal/bank-accounts/${dealerText(bank['id'])}/resend-confirmation`,
                              data,
                            ),
                          );
                          setNotice(bankDeliveryNotice(result));
                          await reload();
                        }}
                      />
                    </details>
                  )}
                </div>
              ))}
              {dealerRows(profile['bankAccounts']).some((bank) => Boolean(bank['disabledAt'])) && (
                <details className={styles.profileDisclosure}>
                  <DisclosureSummary>Tài khoản đã ngừng sử dụng</DisclosureSummary>
                  {dealerRows(profile['bankAccounts'])
                    .filter((bank) => Boolean(bank['disabledAt']))
                    .map((bank) => (
                      <p key={dealerText(bank['id'])} className={styles.muted}>
                        {dealerText(bank['bankName'])} · ****{dealerText(bank['accountLastFour'])} ·{' '}
                        {dealerText(bank['accountHolder'])}
                      </p>
                    ))}
                </details>
              )}
              {bankToken && (
                <DealerForm
                  fields={[{ name: 'token', label: 'Mã xác nhận từ email', value: bankToken }]}
                  submit="Xác nhận yêu cầu tài khoản"
                  onSubmit={async (data) => {
                    await api.post('dealer-portal/bank-accounts/confirm', data);
                    setBankToken('');
                    setNotice({
                      tone: 'success',
                      message: 'Đã xác nhận email. Tài khoản đang chờ admin kiểm tra và xác minh.',
                    });
                    await reload();
                  }}
                />
              )}
              <div id={bankFormId} hidden={!bankFormOpen} className={styles.portalBankForm}>
                <h3>Thêm hoặc thay tài khoản nhận hoàn</h3>
                <p className={styles.muted}>
                  Yêu cầu cần xác nhận qua email đăng nhập và được quản trị viên kiểm tra. Tài khoản
                  thay thế có thời gian chờ 24 giờ. Khoản hoàn đang xử lý giữ nguyên tài khoản đã
                  chốt.
                </p>
                <DealerForm
                  fields={[
                    { name: 'bankName', label: 'Ngân hàng' },
                    { name: 'accountNumber', label: 'Số tài khoản' },
                    { name: 'accountHolder', label: 'Tên chủ tài khoản' },
                    { name: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password' },
                  ]}
                  submit="Gửi yêu cầu xác minh"
                  onSubmit={async (data) => {
                    const result = dealerRecord(
                      await api.post('dealer-portal/bank-accounts', data),
                    );
                    setNotice(bankDeliveryNotice(result));
                    await reload();
                  }}
                />
              </div>
            </section>
          )}
        </div>
        {existingProfile && (
          <aside className={styles.portalProfileAside} aria-label="Hỗ trợ đại lý">
            <section className={[styles.card, styles.portalLimitCard].join(' ')}>
              <h2>Giới hạn đặt hàng</h2>
              <div className={styles.portalLimitValue}>
                <strong>{dealerText(profile['maximumUnfundedOrders']) || '—'}</strong>
                <p>
                  Tối đa {dealerText(profile['maximumUnfundedOrders']) || '—'} đơn
                  <br /> chưa thanh toán đủ.
                </p>
              </div>
              <p className={styles.portalLimitNote}>Giá bán cho khách do đại lý quyết định.</p>
            </section>
            <Link className={styles.portalGuideCard} href="/dealer/api-guide">
              <span className={styles.portalSectionIcon}>
                <BookOpen size={25} aria-hidden />
              </span>
              <span>
                <strong>Hướng dẫn kết nối API</strong>
                <span>Xem hướng dẫn tích hợp và kết nối website bán hàng.</span>
              </span>
              <ArrowRight size={22} aria-hidden />
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}

function DealerCase({
  row,
  api,
  refresh,
}: {
  row: DealerRecord;
  api: DealerApi;
  refresh: () => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const id = dealerText(row['id']);
  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h3>{dealerText(row['requestNumber'])}</h3>
        <span className={styles.badge}>{dealerStatus(row['status'])}</span>
      </div>
      <p>{dealerText(dealerRecord(row['orderItem'])['productName'])}</p>
      <p>{dealerText(row['issueDescription'])}</p>
      {Boolean(row['resolutionNote']) && <p>Kết quả: {dealerText(row['resolutionNote'])}</p>}
      {dealerRows(row['attachments']).map((file) => (
        <Button
          variant="secondary"
          key={dealerText(file['id'])}
          onClick={() => {
            void api
              .get(`dealer/after-sales/${id}/attachments/${dealerText(file['id'])}`)
              .then((value) => {
                setUrl(dealerText(dealerRecord(value)['url']));
              })
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Không mở được tệp.');
              });
          }}
        >
          Mở tệp {dealerDate(file['uploadedAt'])}
        </Button>
      ))}
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          Xem tệp đính kèm (liên kết tạm thời)
        </a>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {['REQUESTED', 'RECEIVED', 'INSPECTING'].includes(dealerText(row['status'])) && (
        <DealerUpload
          api={api}
          path={`dealer/after-sales/${id}/attachments`}
          label="Bổ sung ảnh hoặc tài liệu"
          done={() => {
            void refresh();
          }}
        />
      )}
      {row['status'] === 'REQUESTED' && (
        <details>
          <DisclosureSummary>Hủy yêu cầu</DisclosureSummary>
          <DealerForm
            fields={[{ name: 'reason', label: 'Lý do' }]}
            submit="Hủy yêu cầu hậu mãi"
            onSubmit={async (data) => {
              await api.post(`dealer/after-sales/${id}/cancel`, data);
              await refresh();
            }}
          />
        </details>
      )}
    </article>
  );
}

function DealerIntegration({
  api,
  profile,
  configuration,
  reload,
}: {
  api: DealerApi;
  profile: DealerRecord;
  configuration: DealerRecord;
  reload: () => Promise<void>;
}) {
  const [secret, setSecret] = useState('');
  const [endpoints, setEndpoints] = useState<DealerRecord[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setEndpoints(dealerRows(await api.get('dealer-portal/webhooks')));
  }, [api]);
  useEffect(() => {
    void load().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Không tải được kết nối.');
    });
  }, [load]);
  async function action(path: string) {
    setError('');
    try {
      await api.post(path);
      setNotice('Đã cập nhật.');
      await reload();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa thực hiện được thao tác.');
    }
  }
  return (
    <div className={styles.list}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
      {secret && (
        <DealerSecret
          key={secret}
          value={secret}
          label={
            secret.startsWith('REPHONE_WEBHOOK_')
              ? 'Cấu hình xác thực webhook vừa tạo'
              : 'API key vừa tạo'
          }
        />
      )}
      <section className={styles.card}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Kết nối website của bạn</h2>
            <p>Tạo API key và đồng bộ đơn hàng với rePhone.</p>
          </div>
        </div>
        <p>API chỉ được gọi từ máy chủ của đại lý. Không đưa khóa vào mã JavaScript trình duyệt.</p>
        <p className={styles.muted}>
          Tên miền được duyệt:{' '}
          {Array.isArray(profile['approvedDomains']) && profile['approvedDomains'].length > 0
            ? profile['approvedDomains'].join(', ')
            : 'Chưa có'}
          . Mỗi tài khoản có tối đa hai khóa còn hiệu lực, dùng chung hạn mức.
        </p>
        <Link href="/dealer/api-guide">Xem hướng dẫn tích hợp →</Link>
        {dealerText(dealerRecord(configuration['connection'])['apiBaseUrl']) && (
          <DealerCode
            label="Địa chỉ API cho backend của bạn"
            code={dealerText(dealerRecord(configuration['connection'])['apiBaseUrl'])}
          />
        )}
        {dealerRows(profile['apiClients']).map((key) => (
          <div className={styles.line} key={dealerText(key['id'])}>
            <div>
              <strong>{dealerText(key['name'])}</strong>
              <p className={styles.muted}>
                {dealerText(key['keyPrefix'])}… · Hết hạn {dealerDate(key['expiresAt'])}
              </p>
            </div>
            {!key['revokedAt'] ? (
              <Button
                variant="secondary"
                onClick={() => {
                  void action(`dealer-portal/api-keys/${dealerText(key['id'])}/revoke`);
                }}
              >
                Thu hồi khóa
              </Button>
            ) : (
              <span>Đã thu hồi</span>
            )}
          </div>
        ))}
        {profile['businessStatus'] === 'ACTIVE' && (
          <DealerForm
            fields={[
              { name: 'name', label: 'Tên kết nối' },
              {
                name: 'scopes',
                label: 'Quyền truy cập',
                options: [
                  { value: 'catalog:read,orders:read', label: 'Chỉ đọc kho và đơn' },
                  {
                    value:
                      'catalog:read,orders:read,orders:write,payments:read,payments:write,after-sales:read,after-sales:write',
                    label: 'Đặt hàng, thanh toán và hậu mãi',
                  },
                ],
              },
              { name: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password' },
            ]}
            submit="Tạo khóa API"
            onSubmit={async (data) => {
              setSecret('');
              const value = dealerRecord(
                await api.post('dealer-portal/api-keys', {
                  ...data,
                  scopes: data['scopes']?.split(','),
                }),
              );
              setSecret(dealerText(value['key']));
              await reload();
            }}
          />
        )}
      </section>
      <section className={styles.card}>
        <h2>Thông báo về website</h2>
        <p className={styles.muted}>
          rePhone gửi thông báo đơn, thanh toán và hậu mãi tới địa chỉ HTTPS của bạn. Lưu secret để
          kiểm tra chữ ký; cùng địa chỉ sẽ chuyển khóa trong 24 giờ.
        </p>
        {profile['businessStatus'] === 'ACTIVE' && (
          <DealerForm
            fields={[
              { name: 'url', label: 'Địa chỉ nhận webhook', type: 'url' },
              { name: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password' },
            ]}
            submit="Lưu kết nối và tạo secret"
            onSubmit={async (data) => {
              setSecret('');
              const value = dealerRecord(await api.post('dealer-portal/webhooks', data));
              setSecret(
                `REPHONE_WEBHOOK_KEY_ID=${dealerText(value['keyId'])}\nREPHONE_WEBHOOK_SECRET=${dealerText(value['secret'])}`,
              );
              await load();
            }}
          />
        )}
        {endpoints.map((endpoint) => (
          <section className={styles.card} key={dealerText(endpoint['id'])}>
            <h3>{dealerText(endpoint['url'])}</h3>
            <p className={styles.muted}>Mã khóa xác thực: {dealerText(endpoint['keyId'])}</p>
            <span>{endpoint['enabled'] ? 'Đang bật' : 'Đã tắt'}</span>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                onClick={() => {
                  void action('dealer-portal/webhooks/test');
                }}
              >
                Gửi thông báo thử
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void load().catch((caught: unknown) => {
                    setError(caught instanceof Error ? caught.message : 'Không tải được lịch sử.');
                  });
                }}
              >
                Làm mới lịch sử
              </Button>
              {endpoint['enabled'] === true && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void action(`dealer-portal/webhooks/${dealerText(endpoint['id'])}/disable`);
                  }}
                >
                  Tắt kết nối
                </Button>
              )}
            </div>
            {dealerRows(endpoint['deliveries']).map((delivery) => (
              <details key={dealerText(delivery['id'])}>
                <DisclosureSummary>
                  {dealerStatus(delivery['status'])} · {dealerDate(delivery['dueAt'])} · HTTP{' '}
                  {dealerText(delivery['lastStatusCode']) || '—'}
                </DisclosureSummary>
                <p>
                  Số lần gửi: {dealerText(delivery['attempts'])} ·{' '}
                  {dealerText(delivery['lastError'])}
                </p>
                <pre className={styles.code}>{JSON.stringify(delivery['payload'], null, 2)}</pre>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void action(
                      `dealer-portal/webhook-deliveries/${dealerText(delivery['id'])}/replay`,
                    );
                  }}
                >
                  Gửi lại thông báo
                </Button>
              </details>
            ))}
          </section>
        ))}
      </section>
    </div>
  );
}
