'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { InventoryInspectionEditor } from '@/components/backoffice/inventory/inspections/inventory-inspection-editor';
import {
  OperationsDetailLayout,
  OperationsPageHeader,
  OperationsPanel,
  OperationsStatusAxes,
  OperationsTimeline,
} from '../operations-primitives';
import { OperationsShell } from '../operations-shell';
import { Button, InlineAlert, Skeleton } from '@/components/ui';
import {
  completeInventoryInspection,
  getInventoryInspection,
  inventoryErrorRequiresRefetch,
  updateInventoryInspection,
  type InventoryInspectionDetail,
  type UpdateInventoryInspectionInput,
} from '@/lib/backoffice-inventory-api';
import { getBackofficeAfterSales, type AfterSalesDetail } from '@/lib/after-sales-backoffice-api';
import { AfterSalesActionPanel } from './after-sales-action-panel';
import { AfterSalesEvidence } from './after-sales-evidence';
import {
  afterSalesResolutionLabel,
  afterSalesStatusPresentation,
  afterSalesTimeline,
  afterSalesTypeLabel,
  formatAfterSalesDateTime,
} from './after-sales-presenter';
import styles from './after-sales.module.css';

export function AfterSalesDetailView({ caseId }: Readonly<{ caseId: string }>) {
  const { client, status: authStatus, user } = useAuth();
  const [detail, setDetail] = useState<AfterSalesDetail | null>(null);
  const [inspection, setInspection] = useState<InventoryInspectionDetail | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspectionBusy, setInspectionBusy] = useState<'complete' | 'save' | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [inspectionNotice, setInspectionNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const mutationRef = useRef(false);
  const caseIdRef = useRef(caseId);
  caseIdRef.current = caseId;
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const currentDetail = detail?.id === caseId ? detail : null;

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !isStaff) return;
    let active = true;
    setDetail(null);
    setInspection(null);
    setInspectionError(null);
    setInspectionNotice(null);
    setInspectionLoading(false);
    setLoading(true);
    setError(null);
    void getBackofficeAfterSales(client, caseId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFrom(caught, 'Không thể tải hồ sơ hỗ trợ sau mua.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authStatus, caseId, client, isStaff]);

  const inspectionId = currentDetail?.inspection?.id;
  useEffect(() => {
    if (authStatus !== 'authenticated' || !isStaff || inspectionId === undefined) {
      setInspection(null);
      setInspectionError(null);
      setInspectionLoading(false);
      return;
    }
    let active = true;
    setInspection(null);
    setInspectionError(null);
    setInspectionLoading(true);
    void getInventoryInspection(client, inspectionId)
      .then((result) => {
        if (active) setInspection(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setInspectionError(messageFrom(caught, 'Không thể tải phiếu kiểm định.'));
        }
      })
      .finally(() => {
        if (active) setInspectionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authStatus, client, inspectionId, isStaff]);

  async function reloadDetail() {
    const targetCaseId = caseId;
    setError(null);
    const next = await getBackofficeAfterSales(client, targetCaseId);
    if (caseIdRef.current !== targetCaseId) return;
    setDetail(next);
    if (next.inspection?.id !== undefined) {
      setInspectionLoading(true);
      setInspectionError(null);
      try {
        const nextInspection = await getInventoryInspection(client, next.inspection.id);
        if (caseIdRef.current === targetCaseId) setInspection(nextInspection);
      } catch (caught) {
        if (caseIdRef.current === targetCaseId) {
          setInspection(null);
          setInspectionError(messageFrom(caught, 'Không thể tải phiếu kiểm định.'));
        }
      } finally {
        if (caseIdRef.current === targetCaseId) setInspectionLoading(false);
      }
    } else {
      setInspection(null);
      setInspectionError(null);
      setInspectionLoading(false);
    }
  }

  async function retryInspection() {
    const targetCaseId = caseId;
    const targetInspectionId = currentDetail?.inspection?.id;
    if (targetInspectionId === undefined) return;
    setInspectionLoading(true);
    setInspectionError(null);
    try {
      const next = await getInventoryInspection(client, targetInspectionId);
      if (caseIdRef.current === targetCaseId) setInspection(next);
    } catch (caught) {
      if (caseIdRef.current === targetCaseId) {
        setInspectionError(messageFrom(caught, 'Không thể tải phiếu kiểm định.'));
      }
    } finally {
      if (caseIdRef.current === targetCaseId) setInspectionLoading(false);
    }
  }

  async function runInspection(action: 'complete' | 'save', input: UpdateInventoryInspectionInput) {
    if (inspection === null || mutationRef.current) return;
    mutationRef.current = true;
    setInspectionBusy(action);
    setInspectionError(null);
    setInspectionNotice(null);
    try {
      const saved = await updateInventoryInspection(client, inspection.id, input);
      if (action === 'save') {
        setInspection(saved);
        setInspectionNotice('Đã lưu bản nháp kiểm định.');
      } else {
        const completed = await completeInventoryInspection(client, inspection.id);
        setInspection(completed);
        setInspectionNotice('Đã hoàn tất phiếu kiểm định. Hồ sơ đã sẵn sàng để quyết định.');
        await reloadDetail();
      }
    } catch (caught) {
      if (inventoryErrorRequiresRefetch(caught)) {
        void reloadDetail().catch(() => undefined);
      }
      setInspectionError(messageFrom(caught, 'Không thể cập nhật phiếu kiểm định.'));
    } finally {
      mutationRef.current = false;
      setInspectionBusy(null);
    }
  }

  return (
    <OperationsShell
      breadcrumbs={[
        { href: '/backoffice/after-sales', label: 'Hỗ trợ sau mua' },
        { label: currentDetail?.requestNumber ?? 'Chi tiết yêu cầu' },
      ]}
    >
      {loading && currentDetail === null ? (
        <DetailSkeleton />
      ) : error !== null && currentDetail === null ? (
        <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa mở được hồ sơ" tone="danger">
          {error}{' '}
          <Button
            size="compact"
            variant="secondary"
            onClick={() => {
              setLoading(true);
              void reloadDetail()
                .catch((caught: unknown) => {
                  setError(messageFrom(caught, 'Không thể tải lại hồ sơ.'));
                })
                .finally(() => {
                  setLoading(false);
                });
            }}
          >
            Thử lại
          </Button>
        </InlineAlert>
      ) : currentDetail === null || user === null ? null : (
        <div className={styles.page}>
          <DetailContent
            client={client}
            detail={currentDetail}
            inspection={inspection}
            inspectionBusy={inspectionBusy}
            inspectionError={inspectionError}
            inspectionLoading={inspectionLoading}
            inspectionNotice={inspectionNotice}
            user={user}
            onChange={setDetail}
            onInspectionComplete={(input) => {
              void runInspection('complete', input);
            }}
            onInspectionReload={() => {
              void retryInspection();
            }}
            onInspectionSave={(input) => {
              void runInspection('save', input);
            }}
            onReload={reloadDetail}
          />
        </div>
      )}
    </OperationsShell>
  );
}

function DetailContent({
  client,
  detail,
  inspection,
  inspectionBusy,
  inspectionError,
  inspectionLoading,
  inspectionNotice,
  onChange,
  onInspectionComplete,
  onInspectionReload,
  onInspectionSave,
  onReload,
  user,
}: Readonly<{
  client: ReturnType<typeof useAuth>['client'];
  detail: AfterSalesDetail;
  inspection: InventoryInspectionDetail | null;
  inspectionBusy: 'complete' | 'save' | null;
  inspectionError: string | null;
  inspectionLoading: boolean;
  inspectionNotice: string | null;
  onChange: (detail: AfterSalesDetail) => void;
  onInspectionComplete: (input: UpdateInventoryInspectionInput) => void;
  onInspectionReload: () => void;
  onInspectionSave: (input: UpdateInventoryInspectionInput) => void;
  onReload: () => Promise<void>;
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
}>) {
  const status = afterSalesStatusPresentation(detail.status);
  const assignee = detail.assignedTo?.fullName ?? 'Chưa phân công';
  const inspectionEditable =
    inspection === null || user.role === 'ADMIN' || inspection.inspectorId === user.id;

  return (
    <>
      <OperationsPageHeader
        actions={
          <Link className={styles.inlineLink} href="/backoffice/after-sales">
            Về danh sách
          </Link>
        }
        description={`${detail.orderItem.productName} · ${detail.orderItem.variantName}`}
        eyebrow={afterSalesTypeLabel(detail.type)}
        meta={
          <>
            <span>Yêu cầu {detail.requestNumber}</span>
            <span>Cập nhật {formatAfterSalesDateTime(detail.updatedAt)}</span>
          </>
        }
        title="Hồ sơ hỗ trợ sau mua"
      />

      <OperationsStatusAxes
        axes={[
          { kind: 'generic', label: 'Tiến độ', tone: status.tone, value: status.label },
          {
            kind: 'order',
            label: 'Đơn hàng',
            tone: 'neutral',
            value: detail.orderItem.orderNumber,
          },
          { kind: 'generic', label: 'Người phụ trách', tone: 'info', value: assignee },
        ]}
      />

      <OperationsDetailLayout
        main={
          <>
            <OperationsPanel title="Thông tin yêu cầu">
              <dl className={styles.detailGrid}>
                <DetailItem label="Khách hàng">
                  <strong>{detail.customer.name}</strong>
                  <span>{detail.customer.phone}</span>
                  <span>{detail.customer.email}</span>
                </DetailItem>
                <DetailItem label="Sản phẩm">
                  <strong>{detail.orderItem.productName}</strong>
                  <span>{detail.orderItem.variantName}</span>
                  {detail.orderItem.inventoryCode === null ? null : (
                    <span>Mã máy {detail.orderItem.inventoryCode}</span>
                  )}
                </DetailItem>
                <DetailItem label="Tiếp nhận">
                  <strong>{detail.receivedLocation?.name ?? 'Chưa tiếp nhận sản phẩm'}</strong>
                  {detail.receivedBy == null ? null : <span>{detail.receivedBy.fullName}</span>}
                  {detail.receiveNote === null ? null : <span>{detail.receiveNote}</span>}
                </DetailItem>
                <DetailItem label="Bảo hành">
                  {detail.warranty == null ? (
                    <span>Không có bảo hành đi kèm</span>
                  ) : (
                    <>
                      <strong>{detail.warranty.warrantyCode}</strong>
                      <span>
                        {detail.warranty.isValid
                          ? 'Còn hiệu lực'
                          : detail.warranty.isExpired
                            ? 'Đã hết hạn'
                            : 'Không còn hiệu lực'}
                      </span>
                      <Link
                        className={styles.inlineLink}
                        href={`/backoffice/warranties?q=${encodeURIComponent(detail.warranty.warrantyCode)}`}
                      >
                        Xem bảo hành
                      </Link>
                    </>
                  )}
                </DetailItem>
              </dl>
            </OperationsPanel>

            <OperationsPanel title="Nội dung khách hàng gửi">
              <div className={styles.actionStack}>
                <p className={styles.issueCopy}>{detail.issueDescription}</p>
                {detail.requestedResolution === null ? null : (
                  <p>
                    <strong>Mong muốn của khách:</strong> {detail.requestedResolution}
                  </p>
                )}
              </div>
            </OperationsPanel>

            <OperationsPanel
              description={`${String(detail.attachments.length)} tệp do khách hàng cung cấp`}
              title="Minh chứng"
            >
              <AfterSalesEvidence client={client} detail={detail} />
            </OperationsPanel>

            {detail.inspection === null ? null : (
              <section className={styles.inspectionWrap} id="after-sales-inspection">
                {inspectionLoading && inspection === null ? (
                  <InspectionLoadingState />
                ) : inspection === null && inspectionError !== null ? (
                  <InspectionLoadFailure error={inspectionError} onRetry={onInspectionReload} />
                ) : inspection === null ? null : (
                  <InventoryInspectionEditor
                    busyAction={inspectionBusy}
                    editable={inspectionEditable}
                    error={inspectionError}
                    inspection={inspection}
                    notice={inspectionNotice}
                    unitSummary={{
                      inventoryCode: detail.orderItem.inventoryCode ?? 'Chưa có mã máy',
                      maskedIdentifiers: [],
                      productName: detail.orderItem.productName,
                      variantName: detail.orderItem.variantName,
                    }}
                    onComplete={onInspectionComplete}
                    onReload={onInspectionReload}
                    onSave={onInspectionSave}
                  />
                )}
              </section>
            )}

            <OperationsPanel title="Lịch sử xử lý">
              <OperationsTimeline items={afterSalesTimeline(detail)} />
            </OperationsPanel>

            {detail.status === 'RESOLVED' ? (
              <OperationsPanel title="Kết quả cuối cùng">
                <dl className={styles.detailGrid}>
                  <DetailItem label="Phương án">
                    <strong>{afterSalesResolutionLabel(detail.resolutionType)}</strong>
                  </DetailItem>
                  <DetailItem label="Người hoàn tất">
                    <strong>{detail.resolvedBy?.fullName ?? 'Không có thông tin'}</strong>
                  </DetailItem>
                  {detail.refund == null ? null : (
                    <DetailItem label="Hoàn tiền">
                      <strong>{formatMoney(detail.refund.amount)}</strong>
                      <span>
                        {detail.refund.status === 'COMPLETED' ? 'Đã hoàn tất' : 'Đang xử lý'}
                      </span>
                    </DetailItem>
                  )}
                  {detail.replacementUnit == null ? null : (
                    <DetailItem label="Máy thay thế">
                      <strong>{detail.replacementUnit.inventoryCode}</strong>
                    </DetailItem>
                  )}
                </dl>
              </OperationsPanel>
            ) : null}
          </>
        }
        rail={
          <AfterSalesActionPanel
            client={client}
            detail={detail}
            user={user}
            onChange={onChange}
            onReload={onReload}
          />
        }
      />
    </>
  );
}

function DetailItem({ children, label }: Readonly<{ children: React.ReactNode; label: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function InspectionLoadFailure({
  error,
  onRetry,
}: Readonly<{ error: string; onRetry: () => void }>) {
  return (
    <div className={styles.inspectionState}>
      <InlineAlert title="Chưa tải được phiếu kiểm định" tone="danger">
        {error}
      </InlineAlert>
      <Button size="compact" variant="secondary" onClick={onRetry}>
        Thử tải lại phiếu
      </Button>
    </div>
  );
}

function InspectionLoadingState() {
  return (
    <div className={styles.inspectionState} aria-label="Đang tải phiếu kiểm định" role="status">
      <Skeleton height="5rem" width="100%" />
      <Skeleton height="12rem" width="100%" />
      <span className="rp-visually-hidden">Đang tải phiếu kiểm định…</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.page} aria-label="Đang tải hồ sơ hỗ trợ" role="status">
      <Skeleton height="5rem" width="min(100%, 36rem)" />
      <Skeleton height="6rem" width="100%" />
      <Skeleton height="24rem" width="100%" />
      <span className="rp-visually-hidden">Đang tải hồ sơ hỗ trợ…</span>
    </div>
  );
}

function formatMoney(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} đ`;
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount);
}

function messageFrom(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
