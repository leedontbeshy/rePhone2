'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAuth } from '@/app/auth-provider';
import { Button, InlineAlert, Skeleton, formatVnd } from '@/components/ui';
import type { components } from '@rephone/api-client';
import styles from './financial-overview.module.css';

type Report = components['schemas']['FinancialReportDto'];

export function FinancialOverview() {
  const { client, status, user } = useAuth();
  const [month, setMonth] = useState(() =>
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7),
  );
  const [snapshot, setSnapshot] = useState<{ owner: string; report: Report } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const canLoad =
    status === 'authenticated' && (user?.role === 'ADMIN' || user?.role === 'EMPLOYEE');
  const owner = canLoad ? `${user.id}:${user.role}` : '';
  useEffect(() => {
    if (!canLoad || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void client
      .GET('/api/v1/backoffice/overview/financial', {
        params: { query: { month } },
        signal: controller.signal,
        cache: 'no-store',
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.data === undefined) throw new Error('Chưa tải được báo cáo tài chính.');
        setSnapshot({ owner, report: result.data.data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Chưa tải được báo cáo tài chính.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [canLoad, client, month, owner, revision]);
  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);
  const current =
    owner !== '' && snapshot?.owner === owner && snapshot.report.month === month
      ? snapshot.report
      : null;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>rePhone · Kết quả kinh doanh</p>
          <h1>Báo cáo tài chính</h1>
          <p>Theo dõi doanh thu, doanh số và số vốn đang nằm trong kho.</p>
        </div>
        <div className={styles.actions}>
          <label htmlFor="finance-month">
            Tháng báo cáo
            <input
              id="finance-month"
              type="month"
              min="2000-01"
              max="2099-12"
              value={month}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
            />
          </label>
          <Button variant="secondary" loading={loading} onClick={refresh}>
            Cập nhật
          </Button>
        </div>
      </header>
      {error && (
        <InlineAlert tone="danger" title="Chưa cập nhật được báo cáo">
          {error}
          <Button variant="secondary" onClick={refresh}>
            Thử lại
          </Button>
        </InlineAlert>
      )}
      {current === null ? (
        loading ? (
          <div className={styles.metrics} role="status" aria-label="Đang tải báo cáo">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className={styles.loadingCard ?? ''} />
            ))}
          </div>
        ) : null
      ) : (
        <FinancialReport report={current} admin={user?.role === 'ADMIN'} refreshing={loading} />
      )}
    </div>
  );
}

export function FinancialReport({
  report,
  admin,
  refreshing = false,
}: Readonly<{ report: Report; admin: boolean; refreshing?: boolean }>) {
  const { sales } = report;
  const costs = admin ? report.costs : undefined;
  const maxDay = Math.max(...report.daily.map((day) => Number(day.netRevenue)), 1);
  const gross = BigInt(sales.grossRevenue);
  const average = sales.orderCount === 0 ? '0' : (gross / BigInt(sales.orderCount)).toString();
  return (
    <div className={styles.report} aria-busy={refreshing}>
      <div className={styles.metrics}>
        <Metric
          title="Doanh thu sau hoàn"
          value={money(sales.netRevenue)}
          note="Đơn hoàn tất trong tháng"
          primary
        />
        <Metric
          title="Đơn hoàn tất"
          value={sales.orderCount.toLocaleString('vi-VN')}
          note={`${String(sales.unitsSold)} iPhone đã bán`}
        />
        <Metric
          title="Giá trị đơn trung bình"
          value={money(average)}
          note="Trước hoàn tiền, gồm phí giao"
        />
        <Metric
          title="Đã hoàn cho khách"
          value={money(sales.refunds)}
          note="Lũy kế của các đơn trong tháng"
        />
      </div>
      {costs === undefined ? null : (
        <div className={styles.metrics}>
          <Metric
            title="Lãi gộp tạm tính"
            value={
              costs.estimatedGrossProfit === null
                ? 'Chưa đủ giá vốn'
                : money(costs.estimatedGrossProfit)
            }
            note={
              costs.missingCostItems > 0
                ? `${String(costs.missingCostItems)} sản phẩm chưa ghi nhận giá vốn`
                : 'Doanh thu sau hoàn trừ giá vốn'
            }
          />
          <Metric
            title="Giá vốn đã ghi nhận"
            value={money(costs.knownCost)}
            note="Sản phẩm thuộc đơn hoàn tất trong tháng"
          />
          <Metric
            title="Vốn tồn kho hiện tại"
            value={money(costs.stockCapitalKnown)}
            note={
              costs.stockCostMissing > 0
                ? `${String(costs.stockCostMissing)} máy chưa có giá vốn`
                : `${String(report.stockUnits)} máy đang trong kho và luân chuyển`
            }
          />
          <Metric
            title="Tiền còn phải thu"
            value={money(report.receivables)}
            note="Tất cả đơn chưa hủy, tính đến hiện tại"
          />
        </div>
      )}
      <div className={styles.mainGrid}>
        <section className={styles.panel} aria-labelledby="finance-trend-title">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="finance-trend-title">Doanh thu theo ngày</h2>
              <p>
                Tháng {report.month.slice(5)}/{report.month.slice(0, 4)} · VND
              </p>
            </div>
            <strong>{money(sales.netRevenue)}</strong>
          </div>
          {sales.orderCount === 0 ? (
            <p className={styles.empty}>Chưa có đơn hoàn tất trong tháng này.</p>
          ) : (
            <div
              className={styles.chart}
              role="img"
              aria-label="Biểu đồ doanh thu sau hoàn theo ngày; số liệu chi tiết ở bảng bên dưới"
            >
              {report.daily.map((day) => (
                <div
                  className={styles.day}
                  key={day.date}
                  title={`${day.date}: ${money(day.netRevenue)}`}
                >
                  <span
                    style={
                      {
                        '--bar-height': `${String((Math.max(0, Number(day.netRevenue)) / maxDay) * 100)}%`,
                      } as CSSProperties
                    }
                  />
                  <small>{Number(day.date.slice(8))}</small>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className={styles.panel} aria-labelledby="finance-breakdown-title">
          <h2 id="finance-breakdown-title">Doanh thu trong tháng</h2>
          <dl className={styles.breakdown}>
            <div>
              <dt>Giá trị đơn hoàn tất</dt>
              <dd>{money(sales.grossRevenue)}</dd>
            </div>
            <div>
              <dt>Trong đó phí giao hàng</dt>
              <dd>{money(sales.shippingRevenue)}</dd>
            </div>
            <div>
              <dt>Giảm giá đã áp dụng</dt>
              <dd>{money(sales.discounts)}</dd>
            </div>
            <div>
              <dt>Hoàn tiền đã ghi nhận</dt>
              <dd>− {money(sales.refunds)}</dd>
            </div>
            <div className={styles.total}>
              <dt>Doanh thu sau hoàn</dt>
              <dd>{money(sales.netRevenue)}</dd>
            </div>
          </dl>
          <p className={styles.note}>
            Giá trị đơn đã trừ giảm giá. Hoàn tiền là tổng đã hoàn của các đơn hoàn tất trong tháng,
            cập nhật đến hiện tại.
          </p>
        </section>
      </div>
      <section className={styles.panel} aria-labelledby="finance-channel-title">
        <h2 id="finance-channel-title">Kênh bán hàng</h2>
        <div className={styles.channels}>
          {report.channels.map((channel) => (
            <div key={channel.channel}>
              <span>{channel.channel === 'DEALER' ? 'Đại lý' : 'Cửa hàng trực tuyến'}</span>
              <strong>{money(channel.netRevenue)}</strong>
              <small>
                {channel.orderCount} đơn · {channel.unitsSold} máy
              </small>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.panel} aria-labelledby="finance-daily-title">
        <h2 id="finance-daily-title">Số liệu từng ngày</h2>
        <div
          className={styles.tableRegion}
          tabIndex={0}
          role="region"
          aria-label="Bảng tài chính theo ngày"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Đơn</th>
                <th scope="col">Máy</th>
                <th scope="col">Giá trị đơn</th>
                <th scope="col">Hoàn tiền</th>
                <th scope="col">Sau hoàn</th>
              </tr>
            </thead>
            <tbody>
              {report.daily
                .filter((day) => day.orderCount > 0)
                .map((day) => (
                  <tr key={day.date}>
                    <td>
                      {day.date.slice(8)}/{day.date.slice(5, 7)}
                    </td>
                    <td>{day.orderCount}</td>
                    <td>{day.unitsSold}</td>
                    <td>{money(day.grossRevenue)}</td>
                    <td>{money(day.refunds)}</td>
                    <td>{money(day.netRevenue)}</td>
                  </tr>
                ))}
              {sales.orderCount === 0 && (
                <tr>
                  <td colSpan={6}>Chưa có doanh thu trong tháng.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <footer className={styles.notes}>
        <p>
          Ghi nhận theo ngày hoàn tất đơn, múi giờ Việt Nam. Đơn đang xử lý và đơn hủy chưa được
          tính vào doanh thu.
        </p>
        {costs !== undefined && (
          <p>
            Lãi gộp tạm tính dùng giá vốn đang lưu trong hồ sơ máy; chưa trừ phí vận chuyển thực tế,
            hoa hồng, thuế và chi phí vận hành. Hàng trả lại và giá vốn điều chỉnh cần được đối soát
            trước khi chốt sổ.
          </p>
        )}
        <p>
          Cập nhật:{' '}
          {new Date(report.generatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
        </p>
      </footer>
    </div>
  );
}
function money(value: string) {
  const amount = BigInt(value);
  return amount < BigInt(0) ? `−${formatVnd((-amount).toString())}` : formatVnd(value);
}
function Metric({
  title,
  value,
  note,
  primary = false,
}: Readonly<{ title: string; value: string; note: string; primary?: boolean }>) {
  return (
    <section className={styles.metric} data-primary={primary}>
      <h2>{title}</h2>
      <strong>{value}</strong>
      <p>{note}</p>
    </section>
  );
}
