'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UsersThreeIcon as UsersThree,
  HourglassMediumIcon as HourglassMedium,
  StorefrontIcon as Storefront,
  PackageIcon as Package,
  ReceiptIcon as Receipt,
  BankIcon as Bank,
  ArrowUUpLeftIcon as ArrowUUpLeft,
  ShieldCheckIcon as ShieldCheck,
  TagIcon as Tag,
  WarningCircleIcon as WarningCircle,
  FlaskIcon as Flask,
  ArrowClockwiseIcon as ArrowClockwise,
} from '@phosphor-icons/react';
import { DealerWorkspaceHeader, DealerEnvironmentPanel } from './dealer-workspace';
import { useAuth } from '@/app/auth-provider';
import { OperationsShell } from '@/components/backoffice/operations/operations-shell';
import { Button, InlineAlert } from '@/components/ui';
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
import { DealerEmpty, DealerForm, DealerUpload, type DealerField } from './dealer-primitives';
import { DealerOrderView } from './dealer-order-view';
import styles from './dealer.module.css';
import {
  DealerSimulation,
  DealerReturnFees,
  DealerAfterSalesOperations,
} from './dealer-operations-extras';
import { DealerProfileAdmin } from './dealer-profile-admin';
import Link from 'next/link';

const base = 'backoffice/dealers';
const reason: DealerField = {
  name: 'reason',
  label: 'Lý do / ghi chú đối chiếu',
  type: 'textarea',
};
const choices = (values: Array<[string, string]>) =>
  values.map(([value, label]) => ({ value, label }));
function compact(data: Record<string, string>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== ''));
}
const tabs = [
  ['profiles', 'Hồ sơ'],
  ['orders', 'Đơn đại lý'],
  ['proofs', 'Chờ đối chiếu'],
  ['receipts', 'Giao dịch ngân hàng'],
  ['refunds', 'Hoàn tiền'],
  ['after-sales', 'Hậu mãi'],
  ['pricing', 'Giá & vận chuyển'],
  ['reconciliation', 'Sai lệch cần xử lý'],
  ['sandbox', 'Sandbox'],
] as const;
type Tab = (typeof tabs)[number][0];
const tabIcons = {
  profiles: UsersThree,
  orders: Package,
  proofs: Receipt,
  receipts: Bank,
  refunds: ArrowUUpLeft,
  'after-sales': ShieldCheck,
  pricing: Tag,
  reconciliation: WarningCircle,
  sandbox: Flask,
};
const tabDescriptions: Record<Tab, string> = {
  profiles: 'Duyệt hồ sơ và quản lý đối tác bán hàng.',
  orders: 'Theo dõi thanh toán, chuẩn bị máy và giao hàng.',
  proofs: 'Đối chiếu chứng từ với khoản thực nhận trước khi xác nhận.',
  receipts: 'Ghi nhận tiền vào ngân hàng và phân bổ cho đơn.',
  refunds: 'Kiểm tra khoản hoàn và tài khoản nhận của đại lý.',
  'after-sales': 'Tiếp nhận bảo hành, đổi trả và theo dõi xử lý.',
  pricing: 'Thiết lập giá đại lý và phạm vi giao hàng.',
  reconciliation: 'Xử lý sai lệch tiền và các đơn cần đối soát.',
  sandbox: 'Thử kết nối API với dữ liệu riêng trước khi vận hành thật.',
};

export function DealerBackoffice() {
  const auth = useAuth();
  return (
    <OperationsShell breadcrumbs={[{ label: 'Đại lý', href: '/backoffice/dealers' }]}>
      {auth.status === 'authenticated' && (auth.role === 'ADMIN' || auth.role === 'EMPLOYEE') && (
        <Dashboard key={auth.user?.id} client={auth.client} admin={auth.role === 'ADMIN'} />
      )}
    </OperationsShell>
  );
}

function Dashboard({ client, admin }: { client: unknown; admin: boolean }) {
  const api = useMemo(() => dealerApi(client), [client]);
  const [tab, setTab] = useState<Tab>('profiles');
  const [rows, setRows] = useState<DealerRecord[]>([]);
  const [selected, setSelected] = useState<DealerRecord | null>(null);
  const [policy, setPolicy] = useState<DealerRecord>({});
  const [configuration, setConfiguration] = useState<DealerRecord>({});
  const [profileSummary, setProfileSummary] = useState<DealerRecord>({});
  const [profileTotal, setProfileTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const config = dealerRecord(await api.get(`${base}/configuration`));
      setConfiguration(config);
      if (config['enabled'] !== true) {
        setRows([]);
        setSelected(null);
        return;
      }
      if (tab === 'sandbox') {
        setRows([]);
        return;
      }
      const value = await api.get(
        tab === 'profiles'
          ? `${base}?page=${page.toString()}`
          : tab === 'orders'
            ? `${base}/orders?page=${page.toString()}`
            : `${base}/${tab}`,
      );
      const data = dealerRecord(value);
      if (tab === 'profiles') {
        setProfileSummary(dealerRecord(data['summary']));
        setProfileTotal(Number(data['total'] ?? 0));
      }
      if (tab === 'pricing') setPolicy(data);
      else {
        setRows(dealerRows(Array.isArray(value) ? value : data['items']));
        setMore(Number(data['total'] ?? 0) > page * 20);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được dữ liệu.');
    } finally {
      setBusy(false);
    }
  }, [api, tab, page]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function select(id: string) {
    setError('');
    try {
      setSelected(
        dealerRecord(await api.get(tab === 'profiles' ? `${base}/${id}` : `${base}/orders/${id}`)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được chi tiết.');
    }
  }
  async function changed() {
    setNotice('Đã cập nhật thành công.');
    await refresh();
    if (selected && (tab === 'profiles' || tab === 'orders'))
      await select(dealerText(selected['id']));
  }
  return (
    <div className={[styles.page, styles.backofficePage].join(' ')}>
      <DealerWorkspaceHeader
        title="Quản lý đại lý"
        description="Vận hành đối tác, dòng tiền và đơn hàng tại một nơi."
        test={configuration['environment'] === 'TEST'}
      >
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => {
            void refresh();
            if (selected) void select(dealerText(selected['id']));
          }}
        >
          <ArrowClockwise size={18} aria-hidden />
          Làm mới
        </Button>
      </DealerWorkspaceHeader>
      {admin && (
        <Link href="/backoffice/settings#partner-channels-title">
          Bật/tắt đại lý trong Cấu hình cửa hàng
        </Link>
      )}
      {configuration['enabled'] === false && (
        <InlineAlert tone="info">Kênh đại lý chưa sẵn sàng hoạt động.</InlineAlert>
      )}
      <nav className={styles.tabs} aria-label="Quản lý đại lý">
        {tabs
          .filter(([key]) => admin || !['pricing', 'reconciliation'].includes(key))
          .map(([key, label]) => (
            <Button
              key={key}
              disabled={configuration['enabled'] !== true}
              variant={tab === key ? 'primary' : 'secondary'}
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => {
                setTab(key);
                setSelected(null);
                setRows([]);
                setPage(1);
                setError('');
                setNotice('');
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
      {!selected && (
        <div className={styles.sectionHeading}>
          <div>
            <h2>{tabs.find(([key]) => key === tab)?.[1]}</h2>
            <p>{tabDescriptions[tab]}</p>
          </div>
        </div>
      )}
      {tab === 'sandbox' && <DealerEnvironmentPanel configuration={configuration} admin={admin} />}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
      {tab === 'profiles' && !selected && (
        <div className={styles.overviewGrid}>
          <div className={styles.metricCard}>
            <UsersThree size={24} weight="duotone" aria-hidden />
            <div>
              <span>Tổng đại lý</span>
              <strong>{profileTotal ?? '—'}</strong>
            </div>
          </div>
          <div className={styles.metricCard}>
            <HourglassMedium size={24} weight="duotone" aria-hidden />
            <div>
              <span>Chờ duyệt hồ sơ</span>
              <strong>
                {profileTotal === null ? '—' : dealerText(profileSummary['PENDING']) || '0'}
              </strong>
            </div>
          </div>
          <div className={styles.metricCard}>
            <Storefront size={24} weight="duotone" aria-hidden />
            <div>
              <span>Đang hoạt động</span>
              <strong>
                {profileTotal === null ? '—' : dealerText(profileSummary['ACTIVE']) || '0'}
              </strong>
            </div>
          </div>
        </div>
      )}
      {tab === 'profiles' && (
        <>
          {selected && (
            <DealerProfileAdmin
              key={`${dealerText(selected['id'])}-${dealerText(selected['version'])}`}
              row={selected}
              termsVersion={dealerText(configuration['termsVersion'])}
              close={() => {
                setSelected(null);
                setNotice('');
              }}
              api={api}
              admin={admin}
              done={changed}
            />
          )}
          {!selected && (
            <div className={styles.grid}>
              {rows.map((row) => (
                <article
                  className={`${styles.card ?? ''} ${styles.partnerCard ?? ''}`}
                  key={dealerText(row['id'])}
                >
                  <h2>{dealerText(row['displayName'])}</h2>
                  <p>{dealerText(row['legalName'])}</p>
                  <span className={styles.badge}>{dealerStatus(row['businessStatus'])}</span>
                  <p className={styles.muted}>
                    {dealerText(row['contactEmail'])} · {dealerText(row['contactPhone'])}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void select(dealerText(row['id']));
                    }}
                  >
                    Xem hồ sơ
                  </Button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'orders' && (
        <>
          {selected && admin && (
            <>
              <DealerSimulation api={api} orderId={dealerText(selected['id'])} done={changed} />
              <DealerReturnFees api={api} order={selected} done={changed} />
            </>
          )}
          {selected && (
            <DealerOrderView
              key={dealerText(selected['id'])}
              order={selected}
              api={api}
              backoffice
              refresh={changed}
            />
          )}
          <section className={styles.card}>
            <div className={styles.scroll} role="region" aria-label="Đơn hàng đại lý" tabIndex={0}>
              <table className={styles.table} aria-label="Đơn hàng đại lý">
                <thead>
                  <tr>
                    <th scope="col">Đơn / mã đại lý</th>
                    <th scope="col">Tình trạng</th>
                    <th scope="col">Tổng / đã nhận</th>
                    <th scope="col">
                      <span className="rp-visually-hidden">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={dealerText(row['id'])}>
                      <td>
                        <strong>{dealerText(row['orderNumber'])}</strong>
                        <p>{dealerText(row['externalOrderId'])}</p>
                        <small>{dealerText(row['dealerId'])}</small>
                      </td>
                      <td>
                        {dealerStatus(row['status'])}
                        <p>{dealerStatus(row['paymentStatus'])}</p>
                      </td>
                      <td>
                        {dealerMoney(row['grandTotal'])}
                        <p>{dealerMoney(row['paidAmount'])}</p>
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            void select(dealerText(row['id']));
                          }}
                        >
                          Xem đơn
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <details className={styles.card}>
            <summary>Báo phí giao hàng theo địa chỉ</summary>
            <ShippingQuote api={api} done={changed} />
          </details>
        </>
      )}
      {tab === 'after-sales' && (
        <>
          <div className={styles.list}>
            {rows.map((row) => (
              <DealerAfterSalesOperations
                key={dealerText(row['id'])}
                row={row}
                api={api}
                done={changed}
              />
            ))}
          </div>
          {admin && (
            <details className={styles.card}>
              <summary>Tiếp nhận thay đại lý ngừng hoạt động</summary>
              <DealerForm
                fields={[
                  { name: 'orderItemId', label: 'Mã dòng máy trong đơn' },
                  {
                    name: 'type',
                    label: 'Loại yêu cầu',
                    options: choices([
                      ['WARRANTY', 'Bảo hành'],
                      ['RETURN', 'Trả máy'],
                    ]),
                  },
                  {
                    name: 'issueDescription',
                    label: 'Mô tả và bằng chứng khách cung cấp',
                    type: 'textarea',
                  },
                ]}
                submit="Tiếp nhận hậu mãi dự phòng"
                onSubmit={async (data) => {
                  await api.post(base + '/after-sales/backup-intake', data);
                  await changed();
                }}
              />
            </details>
          )}
        </>
      )}
      {tab === 'proofs' && (
        <div className={styles.list}>
          {rows.map((row) => (
            <ProofReview key={dealerText(row['id'])} row={row} api={api} done={changed} />
          ))}
        </div>
      )}
      {tab === 'receipts' && (
        <>
          <section className={styles.card}>
            <h2>Ghi nhận khoản thực nhận</h2>
            <p className={styles.muted}>
              Chỉ ghi nhận sau khi kiểm tra sổ phụ ngân hàng. Ảnh chuyển khoản của đại lý không phải
              bằng chứng tiền đã vào tài khoản.
            </p>
            <ReceiptForm api={api} done={changed} />
          </section>
          <div className={styles.list}>
            {rows.map((row) => (
              <ReceiptRow
                key={dealerText(row['id'])}
                row={row}
                api={api}
                admin={admin}
                done={changed}
              />
            ))}
          </div>
        </>
      )}
      {tab === 'refunds' && (
        <>
          <details className={styles.card}>
            <summary>Tạo yêu cầu hoàn tiền</summary>
            <DealerForm
              fields={[
                { name: 'dealerId', label: 'Mã đại lý' },
                { name: 'orderId', label: 'Mã đơn nội bộ (chọn một nguồn)', required: false },
                {
                  name: 'bankTransactionId',
                  label: 'Mã giao dịch chưa phân bổ (chọn một nguồn)',
                  required: false,
                },
                { name: 'amount', label: 'Số tiền hoàn (đồng)' },
                reason,
              ]}
              submit="Giữ hạn mức hoàn tiền"
              onSubmit={async (data) => {
                await api.post(`${base}/refunds`, compact(data));
                await changed();
              }}
            />
          </details>
          <div className={styles.list}>
            {rows.map((row) => (
              <RefundRow
                key={dealerText(row['id'])}
                row={row}
                api={api}
                admin={admin}
                done={changed}
              />
            ))}
          </div>
        </>
      )}
      {tab === 'pricing' && admin && Boolean(policy['version']) && (
        <Pricing key={dealerText(policy['version'])} api={api} policy={policy} done={changed} />
      )}
      {tab === 'reconciliation' && admin && (
        <>
          <InlineAlert tone="warning">
            Không xóa tiền đã tham gia giao hàng hoặc hoàn tiền. Hồ sơ sai lệch giữ chặn xuất hàng
            và chi trả cho đến khi được đối soát.
          </InlineAlert>
          {rows.map((row) => (
            <section className={styles.card} key={dealerText(row['id'])}>
              <h2>{dealerText(row['bankReference'])}</h2>
              <p>Điều chỉnh đề xuất: {dealerText(row['proposedAmount'])} đồng</p>
              <p>{dealerText(row['reason'])}</p>
              {row['resolvedAt'] ? (
                <p>
                  Đã xử lý: {dealerDate(row['resolvedAt'])} · {dealerText(row['resolutionNote'])}
                </p>
              ) : (
                <DealerForm
                  fields={[
                    {
                      name: 'applyCorrection',
                      label: 'Kết luận',
                      options: choices([
                        ['false', 'Giữ nguyên khoản đã ghi, bác đề xuất'],
                        ['true', 'Áp dụng sau khi xử lý phân bổ / hoàn liên quan'],
                      ]),
                    },
                    reason,
                  ]}
                  submit="Chốt kết quả đối soát"
                  onSubmit={async (data) => {
                    await api.post(`${base}/reconciliation/${dealerText(row['id'])}/resolve`, {
                      reason: data['reason'],
                      applyCorrection: data['applyCorrection'] === 'true',
                    });
                    await changed();
                  }}
                />
              )}
            </section>
          ))}
          <section className={styles.card}>
            <h2>Gỡ giữ đối soát cho đơn</h2>
            <DealerForm
              fields={[{ name: 'id', label: 'Mã đơn nội bộ' }, reason]}
              submit="Kiểm tra đủ tiền và gỡ giữ"
              onSubmit={async (data) => {
                await api.post(`${base}/orders/${data['id'] ?? ''}/release-reconciliation`, {
                  reason: data['reason'],
                });
                await changed();
              }}
            />
          </section>
        </>
      )}
      {busy && <DealerEmpty>Đang tải…</DealerEmpty>}
      {!busy && rows.length === 0 && tab !== 'pricing' && tab !== 'sandbox' && !error && (
        <DealerEmpty>Chưa có bản ghi trong mục này.</DealerEmpty>
      )}
      {['profiles', 'orders'].includes(tab) && !(tab === 'profiles' && selected) && (
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
        </div>
      )}
    </div>
  );
}

function ReceiptForm({
  api,
  done,
  order,
  proof,
}: {
  api: DealerApi;
  done: () => Promise<void>;
  order?: string;
  proof?: string;
}) {
  return (
    <DealerForm
      fields={[
        ...(!order
          ? [
              { name: 'orderId', label: 'Mã đơn nội bộ (nếu đã xác định)', required: false },
              { name: 'dealerId', label: 'Mã đại lý (nếu chưa gắn đơn)', required: false },
            ]
          : []),
        { name: 'bankAccountKey', label: 'Mã tài khoản ngân hàng nhận tiền' },
        { name: 'bankReference', label: 'Mã giao dịch trên sổ phụ' },
        { name: 'receivedAmount', label: 'Số tiền thực nhận (đồng)' },
        { name: 'receivedAt', label: 'Thời điểm tiền vào', type: 'datetime-local' },
        reason,
      ]}
      submit="Xác nhận khoản thực nhận"
      onSubmit={async (data) => {
        await api.post(`${base}/receipts`, {
          ...compact(data),
          ...(order ? { orderId: order } : {}),
          ...(proof ? { proofId: proof } : {}),
          receivedAt: new Date(data['receivedAt'] ?? '').toISOString(),
        });
        await done();
      }}
    />
  );
}

function ProofReview({
  row,
  api,
  done,
}: {
  row: DealerRecord;
  api: DealerApi;
  done: () => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h2>{dealerText(row['orderNumber'])}</h2>
        {row['overdue'] === true && <span className={styles.badge}>Quá thời gian chờ duyệt</span>}
      </div>
      <p>
        Cần thanh toán {dealerMoney(row['requiredAmount'])} · Nộp {dealerDate(row['submittedAt'])}
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          void api
            .get(`${base}/proofs/${dealerText(row['id'])}/evidence`)
            .then((value) => {
              setUrl(dealerText(dealerRecord(value)['url']));
            })
            .catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : 'Không tải được tệp.');
            });
        }}
      >
        Mở chứng từ
      </Button>
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          Xem chứng từ trong liên kết tạm thời
        </a>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <ReceiptForm
        api={api}
        done={done}
        order={dealerText(row['orderId'])}
        proof={dealerText(row['id'])}
      />
      <details>
        <summary>Từ chối chứng từ</summary>
        <DealerForm
          fields={[reason]}
          submit="Từ chối và tiếp tục thời hạn còn lại"
          onSubmit={async (data) => {
            await api.post(`${base}/proofs/${dealerText(row['id'])}/reject`, data);
            await done();
          }}
        />
      </details>
    </section>
  );
}

function ReceiptRow({
  row,
  api,
  admin,
  done,
}: {
  row: DealerRecord;
  api: DealerApi;
  admin: boolean;
  done: () => Promise<void>;
}) {
  const correctionKey = useRef<{ payload: string; key: string } | null>(null);
  return (
    <section className={styles.card}>
      <h3>{dealerText(row['bankReference'])}</h3>
      <p className={styles.price}>{dealerMoney(row['receivedAmount'])}</p>
      <p>
        {dealerText(row['bankAccountKey'])} · {dealerDate(row['receivedAt'])}
      </p>
      {row['reconciliationHold'] === true && (
        <InlineAlert tone="warning">Khoản thu đang bị giữ để đối soát.</InlineAlert>
      )}
      <p className={styles.muted}>Mã giao dịch nội bộ: {dealerText(row['id'])}</p>
      {dealerRows(row['allocations']).map((allocation) => (
        <div className={styles.line} key={dealerText(allocation['id'])}>
          <span>
            Đơn {dealerText(allocation['orderId'])} · {dealerMoney(allocation['amount'])} · Đã đảo{' '}
            {dealerMoney(allocation['reversedAmount'])}
          </span>
          {admin && (
            <details>
              <summary>Đảo phân bổ ghi nhầm</summary>
              <DealerForm
                fields={[reason]}
                submit="Đảo phân bổ và giữ đơn để đối soát"
                onSubmit={async (data) => {
                  await api.post(
                    `${base}/allocations/${dealerText(allocation['id'])}/reverse`,
                    data,
                  );
                  await done();
                }}
              />
            </details>
          )}
        </div>
      ))}
      {dealerRows(row['corrections']).map((correction, index) => (
        <p key={index}>
          Điều chỉnh {dealerText(correction['amount'])} đồng · {dealerText(correction['reason'])}
        </p>
      ))}
      {dealerRows(row['allocations']).length === 0 && (
        <DealerForm
          fields={[{ name: 'id', label: 'Gắn vào mã đơn nội bộ' }]}
          submit="Đối chiếu vào đơn"
          onSubmit={async (data) => {
            await api.post(`${base}/receipts/${dealerText(row['id'])}/assign`, data);
            await done();
          }}
        />
      )}
      {admin && (
        <details>
          <summary>Ghi bút toán điều chỉnh</summary>
          <DealerForm
            fields={[{ name: 'amount', label: 'Số tiền điều chỉnh có dấu (ví dụ -50000)' }, reason]}
            submit="Ghi điều chỉnh / mở đối soát"
            onSubmit={async (data) => {
              const payload = JSON.stringify(data);
              if (correctionKey.current?.payload !== payload)
                correctionKey.current = { payload, key: crypto.randomUUID() };
              await api.post(
                `${base}/receipts/${dealerText(row['id'])}/corrections`,
                data,
                correctionKey.current.key,
              );
              await done();
            }}
          />
        </details>
      )}
    </section>
  );
}

function RefundRow({
  row,
  api,
  admin,
  done,
}: {
  row: DealerRecord;
  api: DealerApi;
  admin: boolean;
  done: () => Promise<void>;
}) {
  const [destination, setDestination] = useState<DealerRecord | null>(null);
  const [error, setError] = useState('');
  const id = dealerText(row['id']);
  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h3>{dealerMoney(row['amount'])}</h3>
        <span className={styles.badge}>{dealerStatus(row['status'])}</span>
      </div>
      <p>{dealerText(row['reason'])}</p>
      <p className={styles.muted}>
        Đại lý: {dealerText(row['dealerId'])} · Đơn:{' '}
        {dealerText(row['orderId']) || 'Tiền chưa phân bổ'}
      </p>
      <p>
        {row['payoutHold'] === true ? 'Đang giữ chi trả' : 'Không giữ chi trả'} ·{' '}
        {row['transferState'] === 'SENT'
          ? 'Đã chuyển'
          : row['transferState'] === 'UNKNOWN'
            ? 'Chưa rõ kết quả chuyển'
            : 'Chưa chuyển tiền'}
      </p>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {['REQUESTED', 'PROCESSING'].includes(dealerText(row['status'])) && (
        <DealerForm
          fields={[
            {
              name: 'action',
              label: 'Thao tác',
              options: choices([
                ['START', 'Bắt đầu xử lý'],
                ['HOLD', 'Tạm giữ chi trả'],
                ['RELEASE', 'Gỡ giữ chi trả'],
                ['MARK_SENT', 'Đánh dấu đã chuyển tiền'],
                ['MARK_UNKNOWN', 'Kết quả chuyển chưa rõ'],
                ['REJECT', 'Từ chối yêu cầu chưa xử lý'],
                ['CANCEL', 'Hủy yêu cầu chưa xử lý'],
              ]),
            },
            reason,
          ]}
          submit="Cập nhật khoản hoàn"
          onSubmit={async (data) => {
            await api.post(`${base}/refunds/${id}/actions`, data);
            setDestination(null);
            await done();
          }}
        />
      )}
      {admin && row['status'] === 'PROCESSING' && (
        <>
          <Button
            variant="secondary"
            onClick={() => {
              void api
                .get(`${base}/refunds/${id}/destination`)
                .then((value) => {
                  setDestination(dealerRecord(value));
                })
                .catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : 'Không mở được tài khoản.');
                });
            }}
          >
            Xem tài khoản đã chốt để chuyển tiền
          </Button>
          {destination && (
            <InlineAlert tone="info">
              {dealerText(destination['bankName'])} · {dealerText(destination['accountNumber'])} ·{' '}
              {dealerText(destination['accountHolder'])} · {dealerMoney(destination['amount'])}
            </InlineAlert>
          )}
          {row['transferState'] !== 'NOT_SENT' && (
            <DealerUpload
              api={api}
              path={`${base}/refunds/${id}/complete`}
              label="Nộp chứng từ và xác nhận đã hoàn"
              done={() => {
                setDestination(null);
                void done();
              }}
            />
          )}
        </>
      )}
      {admin &&
        row['transferState'] === 'NOT_SENT' &&
        ['REQUESTED', 'PROCESSING'].includes(dealerText(row['status'])) && (
          <details>
            <summary>Thay tài khoản đã khóa cho khoản chưa chuyển</summary>
            <DealerForm
              fields={[{ name: 'id', label: 'Mã tài khoản mới đã xác minh' }, reason]}
              submit="Thay tài khoản và giữ chi trả để kiểm tra"
              onSubmit={async (data) => {
                await api.post(`${base}/refunds/${id}/rebind`, data);
                setDestination(null);
                await done();
              }}
            />
          </details>
        )}
    </section>
  );
}

function Pricing({
  api,
  policy,
  done,
}: {
  api: DealerApi;
  policy: DealerRecord;
  done: () => Promise<void>;
}) {
  return (
    <div className={styles.list}>
      <section className={styles.card}>
        <h2>Chính sách giá đại lý</h2>
        <p className={styles.muted}>
          Giá đại lý luôn đạt giá vốn đầy đủ + dự phòng + lãi tối thiểu và thấp hơn giá công khai.
          Máy thiếu giá vốn hoặc không đạt điều kiện sẽ không được chào bán.
        </p>
        <DealerForm
          fields={[
            {
              name: 'discountBps',
              label: 'Chiết khấu (500 = 5%)',
              type: 'number',
              value: dealerText(policy['discountBps']),
            },
            {
              name: 'reserveAmount',
              label: 'Dự phòng mỗi máy (đồng)',
              value: dealerText(policy['reserveAmount']),
            },
            {
              name: 'minimumProfit',
              label: 'Lãi tối thiểu mỗi máy (đồng)',
              value: dealerText(policy['minimumProfit']),
            },
            {
              name: 'shippingFee',
              label: 'Phí giao chuẩn (đồng)',
              value: dealerText(policy['shippingFee']),
            },
            {
              name: 'supportedProvinces',
              label: 'Tỉnh / thành hỗ trợ phí chuẩn',
              value: Array.isArray(policy['supportedProvinces'])
                ? policy['supportedProvinces'].join(', ')
                : '',
              hint: 'Tên đầy đủ, phân cách bằng dấu phẩy.',
              required: false,
            },
          ]}
          submit="Lưu chính sách giá"
          onSubmit={async (data) => {
            await api.post(`${base}/pricing`, {
              ...data,
              enabled: policy['enabled'] === true,
              discountBps: Number(data['discountBps']),
              expectedVersion: policy['version'],
              supportedProvinces: (data['supportedProvinces'] ?? '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            });
            await done();
          }}
        />
      </section>
      <section className={styles.card}>
        <h2>Giá / khả năng bán riêng từng máy</h2>
        <DealerForm
          fields={[
            { name: 'id', label: 'Mã máy nội bộ' },
            {
              name: 'enabled',
              label: 'Mở bán qua đại lý',
              options: choices([
                ['true', 'Mở bán'],
                ['false', 'Ngừng bán'],
              ]),
            },
            { name: 'price', label: 'Giá riêng (bỏ trống để theo chính sách)', required: false },
            reason,
          ]}
          submit="Cập nhật máy"
          onSubmit={async (data) => {
            const { id, ...body } = compact(data);
            await api.post(`${base}/inventory/${id ?? ''}/pricing`, {
              ...body,
              enabled: data['enabled'] === 'true',
            });
            await done();
          }}
        />
      </section>
    </div>
  );
}

function ShippingQuote({ api, done }: { api: DealerApi; done: () => Promise<void> }) {
  const [quote, setQuote] = useState<DealerRecord | null>(null);
  return (
    <>
      <DealerForm
        fields={[
          { name: 'dealerId', label: 'Mã đại lý' },
          { name: 'receiverName', label: 'Tên người nhận' },
          { name: 'phone', label: 'Điện thoại' },
          { name: 'addressLine', label: 'Số nhà, đường' },
          { name: 'ward', label: 'Phường / xã' },
          { name: 'district', label: 'Quận / huyện' },
          { name: 'province', label: 'Tỉnh / thành' },
          { name: 'shippingFee', label: 'Phí giao (đồng)' },
          reason,
        ]}
        submit="Báo phí riêng trong 24 giờ"
        onSubmit={async (data) => {
          setQuote(
            dealerRecord(
              await api.post(`${base}/shipping-quotes`, {
                dealerId: data['dealerId'],
                shippingFee: data['shippingFee'],
                reason: data['reason'],
                shippingAddress: Object.fromEntries(
                  ['receiverName', 'phone', 'addressLine', 'ward', 'district', 'province'].map(
                    (key) => [key, data[key]],
                  ),
                ),
              }),
            ),
          );
          await done();
        }}
      />
      {quote && (
        <InlineAlert tone="success">
          Mã báo phí: {dealerText(quote['id'])} · {dealerMoney(quote['shippingFee'])} · Hết hạn{' '}
          {dealerDate(quote['expiresAt'])}. Gửi mã này cho đại lý để tạo đơn đúng địa chỉ đã báo.
        </InlineAlert>
      )}
    </>
  );
}
