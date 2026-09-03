'use client';

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  HeartbeatIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { SystemAdminShell } from '@/components/backoffice';
import { Button, InlineAlert, Link, Skeleton, StatusChip } from '@/components/ui';
import { getSystemHealthSnapshot, type SystemHealthSnapshot } from '@/lib/system-admin-api';
import {
  formatHealthCheckedAt,
  formatLatency,
  formatUptime,
  healthFreshness,
  healthGuidance,
  healthProbePresentation,
  healthSummary,
} from './health-presenter';
import styles from './health.module.css';

export function SystemHealthView() {
  return (
    <SystemAdminShell breadcrumbs={[{ label: 'Hệ thống' }, { label: 'Trạng thái hệ thống' }]}>
      <SystemHealthContent />
    </SystemAdminShell>
  );
}

function SystemHealthContent() {
  const { client } = useAuth();
  const [snapshot, setSnapshot] = useState<SystemHealthSnapshot>();
  const [observedAt, setObservedAt] = useState(() => new Date());
  const [checking, setChecking] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [unexpectedError, setUnexpectedError] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setChecking(true);
    setUnexpectedError(false);
    void getSystemHealthSnapshot(client)
      .then((next) => {
        if (active) {
          setSnapshot(next);
          setObservedAt(new Date());
        }
      })
      .catch(() => {
        if (active) setUnexpectedError(true);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [client, requestVersion]);

  useEffect(() => {
    if (snapshot === undefined) return;
    const interval = window.setInterval(() => {
      setObservedAt(new Date());
    }, 60_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [snapshot]);

  useEffect(() => {
    if (unexpectedError) alertRef.current?.focus();
  }, [unexpectedError]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Hệ thống</p>
          <h1>Trạng thái hệ thống</h1>
          <p>Theo dõi khả năng hoạt động và phục vụ ở lần kiểm tra gần nhất.</p>
        </div>
        <Button
          iconLeading={<ArrowClockwiseIcon aria-hidden="true" size={19} />}
          loading={checking}
          loadingLabel="Đang kiểm tra lại"
          variant="secondary"
          onClick={() => {
            setRequestVersion((current) => current + 1);
          }}
        >
          Kiểm tra lại
        </Button>
      </header>

      {unexpectedError ? (
        <InlineAlert ref={alertRef} tabIndex={-1} title="Chưa thể hoàn tất kiểm tra" tone="danger">
          Hãy kiểm tra lại sau ít phút.
        </InlineAlert>
      ) : null}

      {snapshot === undefined && checking ? <HealthLoadingState /> : null}
      {snapshot === undefined && !checking && !unexpectedError ? <HealthUnavailableState /> : null}
      {snapshot === undefined ? null : (
        <HealthStatusPanel checking={checking} observedAt={observedAt} snapshot={snapshot} />
      )}
    </div>
  );
}

export function HealthStatusPanel({
  checking = false,
  observedAt = new Date(),
  snapshot,
}: Readonly<{ checking?: boolean; observedAt?: Date; snapshot: SystemHealthSnapshot }>) {
  const summary = healthSummary(snapshot);
  const api = healthProbePresentation('api', snapshot.api);
  const database = healthProbePresentation('database', snapshot.database);
  const storage = healthProbePresentation('storage', snapshot.storage);
  const mail = healthProbePresentation('mail', snapshot.mail);
  const freshness = healthFreshness(snapshot.checkedAt, observedAt);
  const guidance = healthGuidance(snapshot);
  return (
    <section
      aria-busy={checking || undefined}
      aria-labelledby="system-health-summary-title"
      className={styles.statusPanel}
      data-tone={summary.tone}
    >
      <div className={styles.summary}>
        <span className={styles.summaryIcon} aria-hidden="true">
          {summary.tone === 'success' ? (
            <CheckCircleIcon size={28} weight="fill" />
          ) : (
            <WarningCircleIcon size={28} weight="fill" />
          )}
        </span>
        <div>
          <h2 id="system-health-summary-title">{summary.title}</h2>
          <p>{summary.description}</p>
        </div>
        {checking ? <span className={styles.updating}>Đang cập nhật…</span> : null}
      </div>

      <dl className={styles.summaryBand}>
        <div>
          <dt>API</dt>
          <dd>
            <StatusChip label={api.label} tone={api.tone} />
            <small>{api.description}</small>
            <small>Phản hồi: {formatLatency(snapshot.api.latencyMs)}</small>
          </dd>
        </div>
        <div>
          <dt>Cơ sở dữ liệu</dt>
          <dd>
            <StatusChip label={database.label} tone={database.tone} />
            <small>{database.description}</small>
            <small>Phản hồi: {formatLatency(snapshot.database.latencyMs)}</small>
          </dd>
        </div>
        <div>
          <dt>Kho tệp</dt>
          <dd>
            <StatusChip label={storage.label} tone={storage.tone} />
            <small>{storage.description}</small>
            <small>Phản hồi: {formatLatency(snapshot.storage.latencyMs)}</small>
          </dd>
        </div>
        <div>
          <dt>Gửi email</dt>
          <dd>
            <StatusChip label={mail.label} tone={mail.tone} />
            <small>{mail.description}</small>
            <small>Phản hồi: {formatLatency(snapshot.mail.latencyMs)}</small>
          </dd>
        </div>
      </dl>

      <div className={styles.contentGrid}>
        <section className={styles.explanation} aria-labelledby="health-explanation-title">
          <h3 id="health-explanation-title">Thông tin lần kiểm tra</h3>
          <div>
            <span className={styles.probeIcon} aria-hidden="true">
              <HeartbeatIcon size={22} />
            </span>
            <p>
              <strong>Thời gian API hoạt động</strong>
              {formatUptime(snapshot.api.uptimeSeconds)} · phiên bản {snapshot.api.version}
            </p>
          </div>
          <div>
            <span className={styles.probeIcon} aria-hidden="true">
              <HeartbeatIcon size={22} />
            </span>
            <p>
              <strong>Cập nhật cơ sở dữ liệu</strong>
              {snapshot.database.appliedMigrationCount.toString()} bản đã hoàn tất ·{' '}
              {snapshot.database.incompleteMigrationCount.toString()} bản đang dở dang
            </p>
          </div>
          <div>
            <span className={styles.probeIcon} aria-hidden="true">
              <HeartbeatIcon size={22} />
            </span>
            <p>
              <strong>Toàn bộ lần kiểm tra</strong>
              {formatLatency(snapshot.durationMs)} · {freshness.label}. {freshness.description}
            </p>
          </div>
        </section>

        <aside className={styles.guidance} aria-labelledby="health-guidance-title">
          <p className={styles.guidanceLabel}>Khuyến nghị vận hành</p>
          <h3 id="health-guidance-title">{guidance.title}</h3>
          <p>{guidance.description}</p>
          <Link className={styles.guidanceLink} href="/backoffice/audit-logs" standalone>
            Mở Nhật ký hoạt động
          </Link>
        </aside>
      </div>

      <p className={styles.checkedAt} aria-live="polite">
        Lần kiểm tra gần nhất:{' '}
        <time dateTime={snapshot.checkedAt}>{formatHealthCheckedAt(snapshot.checkedAt)}</time>
      </p>
    </section>
  );
}

function HealthLoadingState() {
  return (
    <section
      className={styles.loadingState}
      aria-label="Đang kiểm tra trạng thái hệ thống"
      role="status"
    >
      <Skeleton height="2rem" width="min(100%, 22rem)" />
      <Skeleton height="5rem" width="100%" />
      <Skeleton height="5rem" width="100%" />
      <span className="rp-visually-hidden">Đang kiểm tra trạng thái hệ thống…</span>
    </section>
  );
}

function HealthUnavailableState() {
  return (
    <section className={styles.emptyState}>
      <h2>Chưa có kết quả kiểm tra</h2>
      <p>Chọn “Kiểm tra lại” để thử lại.</p>
    </section>
  );
}
