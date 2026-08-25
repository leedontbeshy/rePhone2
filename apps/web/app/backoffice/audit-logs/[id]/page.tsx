'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getAuditLog, type AuditLogDetail } from '../../../../lib/system-admin-api';
import { useAuth } from '../../../auth-provider';
import { CatalogHeader } from '../../../catalog-ui';

export default function AuditLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { client, status, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [log, setLog] = useState<AuditLogDetail>();
  const [error, setError] = useState<string>();
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return;
    let active = true;
    void getAuditLog(client, id)
      .then((result) => {
        if (active) setLog(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Không thể mở audit log.');
        }
      });
    return () => {
      active = false;
    };
  }, [client, id, isAdmin, status]);

  useEffect(() => {
    if (error !== undefined) alertRef.current?.focus();
  }, [error]);

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell system-admin-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Audit detail</p>
            <h1>{log?.action ?? 'Đang tải…'}</h1>
          </div>
          <Link className="button" href="/backoffice/audit-logs">
            Quay lại
          </Link>
        </header>
        {status === 'anonymous' || (status === 'authenticated' && !isAdmin) ? (
          <div className="commerce-alert error">Chỉ ADMIN được đọc audit log.</div>
        ) : null}
        {error === undefined ? null : (
          <div ref={alertRef} tabIndex={-1} className="commerce-alert error" role="alert">
            {error}
          </div>
        )}
        {log === undefined ? null : (
          <section className="audit-detail-card">
            <dl className="system-detail-list">
              <div>
                <dt>ID</dt>
                <dd>
                  <code>{log.id}</code>
                </dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{log.actor?.fullName ?? log.actorType}</dd>
              </div>
              <div>
                <dt>Resource</dt>
                <dd>
                  {log.resourceType} · {log.resourceId ?? 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Request ID</dt>
                <dd>
                  <code>{log.requestId ?? 'n/a'}</code>
                </dd>
              </div>
              <div>
                <dt>IP</dt>
                <dd>{log.ipAddress ?? 'n/a'}</dd>
              </div>
              <div>
                <dt>User agent</dt>
                <dd>{log.userAgent ?? 'n/a'}</dd>
              </div>
              <div>
                <dt>Thời điểm</dt>
                <dd>
                  {new Date(log.createdAt).toLocaleString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}
                </dd>
              </div>
            </dl>
            <h2>Changes đã redacted</h2>
            <pre className="audit-json">{JSON.stringify(log.changes, null, 2)}</pre>
            <h2>Metadata đã redacted</h2>
            <pre className="audit-json">{JSON.stringify(log.metadata, null, 2)}</pre>
          </section>
        )}
      </main>
    </>
  );
}
