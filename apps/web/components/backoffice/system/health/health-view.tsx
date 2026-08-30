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
import { Button, InlineAlert, Skeleton, StatusChip } from '@/components/ui';
import {
  getSystemHealthSnapshot,
  type HealthProbeState,
  type SystemHealthSnapshot,
} from '@/lib/system-admin-api';
import { formatHealthCheckedAt, healthProbePresentation, healthSummary } from './health-presenter';
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
        if (active) setSnapshot(next);
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
        <HealthStatusPanel checking={checking} snapshot={snapshot} />
      )}
    </div>
  );
}

export function HealthStatusPanel({
  checking = false,
  snapshot,
}: Readonly<{ checking?: boolean; snapshot: SystemHealthSnapshot }>) {
  const summary = healthSummary(snapshot);
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

      <div className={styles.probeList}>
        <HealthProbeRow
          description="Xác nhận dịch vụ đang phản hồi."
          label="Hoạt động trực tiếp"
          probe="live"
          state={snapshot.live.state}
        />
        <HealthProbeRow
          description="Xác nhận hệ thống có thể tiếp nhận yêu cầu."
          label="Khả năng phục vụ"
          probe="ready"
          state={snapshot.ready.state}
        />
      </div>

      <p className={styles.checkedAt} aria-live="polite">
        Lần kiểm tra gần nhất:{' '}
        <time dateTime={snapshot.checkedAt}>{formatHealthCheckedAt(snapshot.checkedAt)}</time>
      </p>
    </section>
  );
}

function HealthProbeRow({
  description,
  label,
  probe,
  state,
}: Readonly<{
  description: string;
  label: string;
  probe: 'live' | 'ready';
  state: HealthProbeState;
}>) {
  const presentation = healthProbePresentation(probe, state);
  return (
    <article className={styles.probeRow} data-state={state}>
      <span className={styles.probeIcon} aria-hidden="true">
        <HeartbeatIcon size={24} />
      </span>
      <div className={styles.probeCopy}>
        <h3>{label}</h3>
        <p>{description}</p>
        <small>{presentation.description}</small>
      </div>
      <StatusChip label={presentation.label} tone={presentation.tone} />
    </article>
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
