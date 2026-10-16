'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { AuthUser } from '@/app/auth-provider';
import { BackofficeActionDialog } from '@/components/backoffice/backoffice-action-dialog';
import { OperationsActionRail } from '../operations-primitives';
import { DisclosureSummary, Button, InlineAlert, Select, Textarea } from '@/components/ui';
import {
  approveAfterSales,
  assignAfterSales,
  listAfterSalesLocations,
  receiveAfterSales,
  recordAfterSalesInspectionSummary,
  rejectAfterSales,
  resolveAfterSalesOther,
  resolveAfterSalesRefunded,
  resolveAfterSalesRepaired,
  resolveAfterSalesReplaced,
  resolveAfterSalesReturnedUnchanged,
  startAfterSalesInspection,
  type AfterSalesBackofficeApiClient,
  type AfterSalesDetail,
  type AfterSalesLocationOption,
} from '@/lib/after-sales-backoffice-api';
import { listInventoryUnits, type InventoryUnitListItem } from '@/lib/backoffice-inventory-api';
import { listBackofficeRefunds, type RefundListItem } from '@/lib/refund-api';
import { listEmployees, type Employee } from '@/lib/system-admin-api';
import { executeAfterSalesCommand } from './after-sales-command-runner';
import { afterSalesPrimaryStep, afterSalesStatusPresentation } from './after-sales-presenter';
import styles from './after-sales.module.css';

type ResolutionChoice = 'OTHER' | 'REFUNDED' | 'REPAIRED' | 'REPLACED' | 'RETURNED_UNCHANGED';

export interface AfterSalesActionPanelProps {
  readonly client: AfterSalesBackofficeApiClient;
  readonly detail: AfterSalesDetail;
  readonly onChange: (detail: AfterSalesDetail) => void;
  readonly onReload: () => Promise<void>;
  readonly user: AuthUser;
}

export interface ActionFieldErrors {
  decisionNote?: string;
  inspectionSummary?: string;
  locationId?: string;
  receiveNote?: string;
  refundId?: string;
  replacementUnitId?: string;
  resolutionNote?: string;
}

const FIELD_IDS: Record<keyof ActionFieldErrors, string> = {
  decisionNote: 'after-sales-decision-note',
  inspectionSummary: 'after-sales-inspection-summary',
  locationId: 'after-sales-location',
  receiveNote: 'after-sales-receive-note',
  refundId: 'after-sales-refund',
  replacementUnitId: 'after-sales-replacement-unit',
  resolutionNote: 'after-sales-resolution-note',
};

export function AfterSalesActionPanel({
  client,
  detail,
  onChange,
  onReload,
  user,
}: AfterSalesActionPanelProps) {
  const step = afterSalesPrimaryStep(detail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locations, setLocations] = useState<AfterSalesLocationOption[]>([]);
  const [locationId, setLocationId] = useState('');
  const [receiveNote, setReceiveNote] = useState('');
  const [inspectionSummary, setInspectionSummary] = useState(detail.inspectionSummary ?? '');
  const [decisionNote, setDecisionNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [resolution, setResolution] = useState<ResolutionChoice>(() => firstResolution(detail));
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionConfirmOpen, setResolutionConfirmOpen] = useState(false);
  const [refunds, setRefunds] = useState<RefundListItem[]>([]);
  const [refundId, setRefundId] = useState('');
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [replacementUnits, setReplacementUnits] = useState<InventoryUnitListItem[]>([]);
  const [replacementUnitId, setReplacementUnitId] = useState('');
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [replacementReloadKey, setReplacementReloadKey] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState(detail.assignedTo?.id ?? user.id);
  const [supportingOpen, setSupportingOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ActionFieldErrors>({});
  const mutationRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const canAssign = detail.availableActions.includes('ASSIGN');
  const ownsInspection =
    detail.inspection?.status !== 'DRAFT' ||
    detail.inspection.inspector?.id === user.id ||
    user.role === 'ADMIN';
  const status = afterSalesStatusPresentation(detail.status);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    setError(null);
    setNotice(null);
    setInspectionSummary(detail.inspectionSummary ?? '');
    setResolution(firstResolution(detail));
    setEmployeeId(detail.assignedTo?.id ?? user.id);
    setReceiveNote('');
    setDecisionNote('');
    setRejectReason('');
    setResolutionNote('');
    setRefundId('');
    setReplacementUnitId('');
    setFieldErrors({});
    setRejectOpen(false);
    setResolutionConfirmOpen(false);
  }, [detail.id, detail.status, detail.inspectionSummary, detail.assignedTo?.id, user.id]);

  useEffect(() => {
    if (step !== 'RECEIVE') return;
    let active = true;
    setLocations([]);
    setLocationId('');
    void listAfterSalesLocations(client)
      .then((result) => {
        if (!active) return;
        const available = result.filter((location) => location.status === 'ACTIVE');
        setLocations(available);
        setLocationId((current) => current || available[0]?.id || '');
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFrom(caught, 'Không thể tải địa điểm tiếp nhận.'));
      });
    return () => {
      active = false;
    };
  }, [client, step]);

  useEffect(() => {
    if (!canAssign || user.role !== 'ADMIN' || !supportingOpen) return;
    let active = true;
    void listEmployees(client, {
      page: 1,
      pageSize: 100,
      sortBy: 'createdAt',
      sortOrder: 'asc',
      status: 'ACTIVE',
    })
      .then((result) => {
        if (active) setEmployees(result.data);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFrom(caught, 'Không thể tải danh sách nhân viên.'));
      });
    return () => {
      active = false;
    };
  }, [canAssign, client, supportingOpen, user.role]);

  useEffect(() => {
    if (step !== 'RESOLVE' || resolution !== 'REFUNDED') return;
    let active = true;
    setRefunds([]);
    setRefundId('');
    setRefundsLoading(true);
    void listBackofficeRefunds(client, {
      orderNumber: detail.orderItem.orderNumber,
      page: 1,
      pageSize: 100,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      status: 'COMPLETED',
    })
      .then((result) => {
        if (!active) return;
        setRefunds(result.data);
        setRefundId((current) => current || result.data[0]?.id || '');
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFrom(caught, 'Không thể tải các khoản hoàn tiền đã hoàn tất.'));
      })
      .finally(() => {
        if (active) setRefundsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, detail.orderItem.orderNumber, resolution, step]);

  useEffect(() => {
    if (step !== 'RESOLVE' || resolution !== 'REPLACED') {
      setReplacementUnits([]);
      setReplacementUnitId('');
      setReplacementError(null);
      setReplacementLoading(false);
      return;
    }
    let active = true;
    setReplacementUnits([]);
    setReplacementUnitId('');
    setReplacementError(null);
    setReplacementLoading(true);
    void listReplacementUnits(client, detail)
      .then((result) => {
        if (!active) return;
        setReplacementUnits(result);
        setReplacementUnitId(result[0]?.id ?? '');
      })
      .catch((caught: unknown) => {
        if (active) {
          setReplacementError(messageFrom(caught, 'Không thể tải danh sách máy thay thế.'));
        }
      })
      .finally(() => {
        if (active) setReplacementLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, detail, replacementReloadKey, resolution, step]);

  const supporting =
    canAssign || detail.availableActions.includes('REJECT') ? (
      <div className={styles.supportingButtons}>
        {detail.availableActions.includes('REJECT') ? (
          <Button
            disabled={busy}
            variant="destructive"
            onClick={() => {
              setRejectOpen(true);
            }}
          >
            Không chấp thuận
          </Button>
        ) : null}
        {canAssign ? (
          <details
            open={supportingOpen}
            onToggle={(event) => {
              setSupportingOpen(event.currentTarget.open);
            }}
          >
            <DisclosureSummary>Phân công người phụ trách</DisclosureSummary>
            <AssignmentForm
              busy={busy}
              detail={detail}
              employeeId={employeeId}
              employees={employees}
              isAdmin={user.role === 'ADMIN'}
              user={user}
              onChange={setEmployeeId}
              onSubmit={(value) => {
                void run(
                  () => assignAfterSales(client, detail.id, value),
                  value === null ? 'Đã bỏ phân công.' : 'Đã cập nhật người phụ trách.',
                );
              }}
            />
          </details>
        ) : null}
      </div>
    ) : undefined;

  async function run(command: () => Promise<AfterSalesDetail>, successMessage: string) {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const result = await executeAfterSalesCommand(
        command,
        onReload,
        'Chưa thể hoàn tất thao tác.',
      );
      if (result.detail === null) {
        setError(result.error);
      } else {
        onChange(result.detail);
        setNotice(successMessage);
      }
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  }

  function submitReceive(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateReceiveFields(locationId, receiveNote);
    if (hasFieldErrors(nextErrors)) {
      showFieldErrors(nextErrors, ['locationId', 'receiveNote']);
      return;
    }
    void run(
      () =>
        receiveAfterSales(client, detail.id, {
          receivedLocationId: locationId,
          ...(receiveNote.trim() === '' ? {} : { note: receiveNote.trim() }),
        }),
      'Đã xác nhận tiếp nhận sản phẩm.',
    );
  }

  function submitSummary(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const summary = inspectionSummary.trim();
    const message = validateRequiredText(summary, 10, 2000, 'Kết luận kiểm tra');
    if (message !== undefined) {
      showFieldErrors({ inspectionSummary: message }, ['inspectionSummary']);
      return;
    }
    void run(
      () => recordAfterSalesInspectionSummary(client, detail.id, summary),
      'Đã lưu kết luận kiểm tra.',
    );
  }

  function submitApproval(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = decisionNote.trim();
    const message = validateRequiredText(note, 5, 2000, 'Ghi chú quyết định');
    if (message !== undefined) {
      showFieldErrors({ decisionNote: message }, ['decisionNote']);
      return;
    }
    void run(() => approveAfterSales(client, detail.id, note), 'Đã chấp thuận yêu cầu hỗ trợ.');
  }

  function requestResolution(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: ActionFieldErrors = {};
    if (resolution === 'REFUNDED' && refundId === '') {
      nextErrors.refundId = 'Hãy chọn một khoản hoàn tiền đã hoàn tất.';
    }
    if (resolution === 'REPLACED' && replacementUnitId === '') {
      nextErrors.replacementUnitId = 'Hãy chọn máy thay thế đang sẵn sàng.';
    }
    const noteMessage = validateRequiredText(resolutionNote.trim(), 5, 2000, 'Ghi chú hoàn tất');
    if (noteMessage !== undefined) nextErrors.resolutionNote = noteMessage;
    if (hasFieldErrors(nextErrors)) {
      showFieldErrors(nextErrors, ['refundId', 'replacementUnitId', 'resolutionNote']);
      return;
    }
    setResolutionConfirmOpen(true);
  }

  function confirmResolution() {
    const note = resolutionNote.trim();
    setResolutionConfirmOpen(false);
    if (resolution === 'REPAIRED') {
      void run(() => resolveAfterSalesRepaired(client, detail.id, note), 'Đã hoàn tất sửa chữa.');
      return;
    }
    if (resolution === 'RETURNED_UNCHANGED') {
      void run(
        () => resolveAfterSalesReturnedUnchanged(client, detail.id, note),
        'Đã xác nhận trả sản phẩm nguyên trạng.',
      );
      return;
    }
    if (resolution === 'REFUNDED') {
      void run(
        () => resolveAfterSalesRefunded(client, detail.id, { refundId, resolutionNote: note }),
        'Đã liên kết khoản hoàn tiền và hoàn tất hồ sơ.',
      );
      return;
    }
    if (resolution === 'REPLACED') {
      void run(
        () =>
          resolveAfterSalesReplaced(client, detail.id, {
            replacementInventoryUnitId: replacementUnitId,
            resolutionNote: note,
          }),
        'Đã xác nhận đổi sang máy thay thế.',
      );
      return;
    }
    void run(
      () => resolveAfterSalesOther(client, detail.id, note),
      'Đã hoàn tất hồ sơ với phương án đã ghi nhận.',
    );
  }

  function showFieldErrors(
    nextErrors: ActionFieldErrors,
    order: readonly (keyof ActionFieldErrors)[],
  ) {
    setError(null);
    setFieldErrors(nextErrors);
    const first = order.find((key) => nextErrors[key] !== undefined);
    if (first === undefined) return;
    queueMicrotask(() => {
      document.getElementById(FIELD_IDS[first])?.focus();
    });
  }

  return (
    <>
      <OperationsActionRail
        description={`Tiến độ hiện tại: ${status.label}.`}
        primary={primaryContent()}
        supporting={supporting}
        title={step === 'TERMINAL' ? 'Kết quả xử lý' : 'Thao tác chính'}
      >
        {error === null ? null : (
          <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa thể cập nhật hồ sơ" tone="danger">
            {error}
          </InlineAlert>
        )}
        {notice === null ? null : (
          <InlineAlert title="Đã cập nhật" tone="success">
            {notice}
          </InlineAlert>
        )}
      </OperationsActionRail>

      <BackofficeActionDialog
        confirmLabel="Xác nhận không chấp thuận"
        description="Quyết định này sẽ kết thúc yêu cầu và không thể đổi lại tại màn hình này."
        destructive
        open={rejectOpen}
        pending={busy}
        reason={{
          hint:
            detail.orderItem.inventoryCode === null
              ? 'Nêu rõ căn cứ để khách hàng và nhân viên sau có thể hiểu quyết định.'
              : 'Nêu rõ căn cứ và cách trả máy cho khách hàng.',
          label:
            detail.orderItem.inventoryCode === null
              ? 'Lý do không chấp thuận'
              : 'Lý do và ghi chú trả máy',
          maxLength: rejectReasonMaximum(detail),
          minLength: 5,
          onChange: setRejectReason,
          value: rejectReason,
        }}
        title="Không chấp thuận yêu cầu?"
        onCancel={() => {
          setRejectOpen(false);
        }}
        onConfirm={(reason) => {
          if (reason === undefined) return;
          setRejectOpen(false);
          void run(
            () =>
              rejectAfterSales(client, detail.id, {
                reason,
                ...(detail.orderItem.inventoryCode === null ? {} : { returnNote: reason }),
              }),
            'Đã ghi nhận quyết định không chấp thuận.',
          );
        }}
      />

      <BackofficeActionDialog
        confirmLabel="Xác nhận hoàn tất"
        description={`Hồ sơ sẽ được kết thúc theo phương án “${resolutionLabel(resolution)}”.`}
        open={resolutionConfirmOpen}
        pending={busy}
        title="Hoàn tất hồ sơ hỗ trợ?"
        onCancel={() => {
          setResolutionConfirmOpen(false);
        }}
        onConfirm={confirmResolution}
      />
    </>
  );

  function primaryContent() {
    if (step === 'RECEIVE') {
      return (
        <form className={styles.actionForm} noValidate onSubmit={submitReceive}>
          <Select
            error={fieldErrors.locationId}
            id="after-sales-location"
            label="Địa điểm tiếp nhận"
            required
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
            }}
          >
            <option value="">Chọn địa điểm</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} · {location.type === 'STORE' ? 'Cửa hàng' : 'Kho'}
              </option>
            ))}
          </Select>
          <Textarea
            error={fieldErrors.receiveNote}
            hint="Có thể để trống; nếu nhập, cần từ 5 đến 1.000 ký tự."
            id="after-sales-receive-note"
            label="Ghi chú khi nhận"
            maxLength={1000}
            minLength={5}
            placeholder="Tình trạng bàn giao hoặc lưu ý của khách hàng"
            value={receiveNote}
            onChange={(event) => {
              setReceiveNote(event.target.value);
            }}
          />
          <Button loading={busy} loadingLabel="Đang tiếp nhận" type="submit">
            Xác nhận tiếp nhận
          </Button>
        </form>
      );
    }
    if (step === 'START_INSPECTION') {
      return (
        <div className={styles.actionStack}>
          <p>Bắt đầu ghi nhận tình trạng sản phẩm trước khi đưa ra quyết định.</p>
          <Button
            loading={busy}
            loadingLabel="Đang tạo phiếu"
            onClick={() => {
              void run(
                () => startAfterSalesInspection(client, detail.id),
                'Đã bắt đầu kiểm tra sản phẩm.',
              );
            }}
          >
            Bắt đầu kiểm tra
          </Button>
        </div>
      );
    }
    if (step === 'INSPECTION') {
      return ownsInspection ? (
        <div className={styles.actionStack}>
          <p>Phiếu kiểm định đang được mở trong phần nội dung chính.</p>
          <Link className={styles.inlineLink} href="#after-sales-inspection">
            Tiếp tục kiểm định
          </Link>
        </div>
      ) : (
        <InlineAlert title="Phiếu đang do người khác phụ trách" tone="warning">
          Bạn có thể theo dõi nhưng không thể sửa hoặc hoàn tất phiếu kiểm định này.
        </InlineAlert>
      );
    }
    if (step === 'INSPECTION_SUMMARY') {
      return (
        <form className={styles.actionForm} noValidate onSubmit={submitSummary}>
          <Textarea
            error={fieldErrors.inspectionSummary}
            hint="Ghi rõ tình trạng đã kiểm tra và căn cứ đề xuất xử lý."
            id="after-sales-inspection-summary"
            label="Kết luận kiểm tra"
            maxLength={2000}
            minLength={10}
            required
            value={inspectionSummary}
            onChange={(event) => {
              setInspectionSummary(event.target.value);
            }}
          />
          <Button loading={busy} loadingLabel="Đang lưu" type="submit">
            Lưu kết luận
          </Button>
        </form>
      );
    }
    if (step === 'APPROVE') {
      return (
        <form className={styles.actionForm} noValidate onSubmit={submitApproval}>
          <Textarea
            error={fieldErrors.decisionNote}
            hint="Ghi ngắn gọn căn cứ và hướng xử lý dự kiến."
            id="after-sales-decision-note"
            label="Ghi chú quyết định"
            maxLength={2000}
            minLength={5}
            required
            value={decisionNote}
            onChange={(event) => {
              setDecisionNote(event.target.value);
            }}
          />
          <Button loading={busy} loadingLabel="Đang chấp thuận" type="submit">
            Chấp thuận yêu cầu
          </Button>
        </form>
      );
    }
    if (step === 'RESOLVE') {
      return (
        <form className={styles.actionForm} noValidate onSubmit={requestResolution}>
          <Select
            id="after-sales-resolution"
            label="Phương án hoàn tất"
            value={resolution}
            onChange={(event) => {
              setResolution(event.target.value as ResolutionChoice);
              setError(null);
              setFieldErrors({});
            }}
          >
            {detail.availableActions.includes('RESOLVE_REPAIRED') ? (
              <option value="REPAIRED">Đã sửa chữa</option>
            ) : null}
            {detail.availableActions.includes('RESOLVE_RETURNED_UNCHANGED') ? (
              <option value="RETURNED_UNCHANGED">Trả lại nguyên trạng</option>
            ) : null}
            {detail.availableActions.includes('RESOLVE_REFUNDED') ? (
              <option value="REFUNDED">Đã hoàn tiền</option>
            ) : null}
            {detail.availableActions.includes('RESOLVE_REPLACED') ? (
              <option value="REPLACED">Đổi sang máy khác</option>
            ) : null}
            {detail.availableActions.includes('RESOLVE_OTHER') ? (
              <option value="OTHER">Phương án khác</option>
            ) : null}
          </Select>

          {resolution === 'REFUNDED' ? (
            refundsLoading ? (
              <p role="status">Đang tìm khoản hoàn tiền đã hoàn tất…</p>
            ) : refunds.length === 0 ? (
              <div className={styles.blockedChoice}>
                <p>Đơn hàng chưa có khoản hoàn tiền đã hoàn tất để liên kết.</p>
                <Link className={styles.inlineLink} href="/backoffice/refunds">
                  Mở khu vực hoàn tiền
                </Link>
              </div>
            ) : (
              <Select
                error={fieldErrors.refundId}
                id="after-sales-refund"
                label="Khoản hoàn tiền"
                required
                value={refundId}
                onChange={(event) => {
                  setRefundId(event.target.value);
                }}
              >
                {refunds.map((refund) => (
                  <option key={refund.id} value={refund.id}>
                    {formatMoney(refund.amount)} ·{' '}
                    {refund.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
                  </option>
                ))}
              </Select>
            )
          ) : null}

          {resolution === 'REPLACED' ? (
            replacementLoading ? (
              <p role="status">Đang tìm máy thay thế phù hợp…</p>
            ) : replacementError !== null ? (
              <InlineAlert title="Chưa tải được máy thay thế" tone="danger">
                <p>{replacementError}</p>
                <Button
                  size="compact"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setReplacementReloadKey((current) => current + 1);
                  }}
                >
                  Thử lại
                </Button>
              </InlineAlert>
            ) : replacementUnits.length === 0 ? (
              <div className={styles.blockedChoice} role="note">
                <strong>Chưa có máy thay thế đang sẵn sàng</strong>
                <p>Hãy kiểm tra lại kho máy trước khi hoàn tất hồ sơ.</p>
                <Link className={styles.inlineLink} href="/backoffice/inventory/units">
                  Mở danh sách máy
                </Link>
              </div>
            ) : (
              <Select
                error={fieldErrors.replacementUnitId}
                hint="Chỉ hiển thị máy đang sẵn sàng và cùng dòng sản phẩm."
                id="after-sales-replacement-unit"
                label="Máy thay thế"
                required
                value={replacementUnitId}
                onChange={(event) => {
                  setReplacementUnitId(event.target.value);
                }}
              >
                {replacementUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.inventoryCode} · {unit.variant.displayName} · {unit.location.name}
                  </option>
                ))}
              </Select>
            )
          ) : null}

          <Textarea
            error={fieldErrors.resolutionNote}
            id="after-sales-resolution-note"
            label="Ghi chú hoàn tất"
            maxLength={2000}
            minLength={5}
            required
            value={resolutionNote}
            onChange={(event) => {
              setResolutionNote(event.target.value);
            }}
          />
          <Button
            disabled={
              (resolution === 'REPLACED' &&
                (replacementLoading || replacementUnitId === '' || replacementError !== null)) ||
              (resolution === 'REFUNDED' && refundId === '')
            }
            loading={busy}
            loadingLabel="Đang hoàn tất"
            type="submit"
          >
            Xác nhận hoàn tất
          </Button>
        </form>
      );
    }
    if (step === 'TERMINAL') {
      return (
        <div className={styles.readonlySummary}>
          <p>Hồ sơ đã kết thúc và được giữ ở chế độ chỉ đọc.</p>
          {detail.resolutionNote == null ? null : <p>{detail.resolutionNote}</p>}
          {detail.cancelReason == null ? null : <p>{detail.cancelReason}</p>}
          {detail.decisionNote == null ? null : <p>{detail.decisionNote}</p>}
        </div>
      );
    }
    return <p>Hồ sơ đang chờ cập nhật từ bước trước.</p>;
  }
}

function AssignmentForm({
  busy,
  detail,
  employeeId,
  employees,
  isAdmin,
  onChange,
  onSubmit,
  user,
}: Readonly<{
  busy: boolean;
  detail: AfterSalesDetail;
  employeeId: string;
  employees: readonly Employee[];
  isAdmin: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string | null) => void;
  user: AuthUser;
}>) {
  if (!isAdmin) {
    return (
      <div className={styles.actionStack}>
        {detail.assignedTo?.id === user.id ? (
          <p>Bạn đang phụ trách hồ sơ này.</p>
        ) : (
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() => {
              onSubmit(user.id);
            }}
          >
            Nhận xử lý
          </Button>
        )}
        {detail.assignedTo == null ? null : (
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => {
              onSubmit(null);
            }}
          >
            Bỏ phân công
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className={styles.actionForm}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(employeeId === '' ? null : employeeId);
      }}
    >
      <Select
        id="after-sales-assignee"
        label="Người phụ trách"
        value={employeeId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">Chưa phân công</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.fullName} · {employee.employeeCode}
          </option>
        ))}
      </Select>
      <Button disabled={busy} size="compact" type="submit" variant="secondary">
        Lưu phân công
      </Button>
    </form>
  );
}

function firstResolution(detail: AfterSalesDetail): ResolutionChoice {
  if (detail.availableActions.includes('RESOLVE_REPAIRED')) return 'REPAIRED';
  if (detail.availableActions.includes('RESOLVE_RETURNED_UNCHANGED')) return 'RETURNED_UNCHANGED';
  if (detail.availableActions.includes('RESOLVE_REFUNDED')) return 'REFUNDED';
  if (detail.availableActions.includes('RESOLVE_REPLACED')) return 'REPLACED';
  return 'OTHER';
}

export function validateReceiveFields(locationId: string, note: string): ActionFieldErrors {
  const errors: ActionFieldErrors = {};
  if (locationId === '') errors.locationId = 'Hãy chọn địa điểm tiếp nhận.';
  const normalized = note.trim();
  if (normalized !== '') {
    const message = validateRequiredText(normalized, 5, 1000, 'Ghi chú khi nhận');
    if (message !== undefined) errors.receiveNote = message;
  }
  return errors;
}

export function rejectReasonMaximum(detail: Pick<AfterSalesDetail, 'orderItem'>): 1000 | 2000 {
  return detail.orderItem.inventoryCode === null ? 2000 : 1000;
}

export function validateRequiredText(
  value: string,
  minimum: number,
  maximum: number,
  label: string,
): string | undefined {
  const length = value.trim().length;
  if (length < minimum) return `${label} cần ít nhất ${String(minimum)} ký tự.`;
  if (length > maximum) {
    return `${label} không được quá ${new Intl.NumberFormat('vi-VN').format(maximum)} ký tự.`;
  }
  return undefined;
}

export async function listReplacementUnits(
  client: AfterSalesBackofficeApiClient,
  detail: AfterSalesDetail,
): Promise<InventoryUnitListItem[]> {
  const inventoryCode = detail.orderItem.inventoryCode;
  if (inventoryCode === undefined || inventoryCode === null || inventoryCode.length === 0) {
    throw new Error('Hồ sơ không có mã máy gốc để tìm máy thay thế.');
  }
  const originals = await listInventoryUnits(client, {
    lifecycleStatus: '',
    page: 1,
    pageSize: 100,
    q: inventoryCode,
    sortBy: 'inventoryCode',
    sortOrder: 'asc',
  });
  const original = originals.data.find(
    (unit) =>
      unit.inventoryCode.toLocaleUpperCase('vi-VN') === inventoryCode.toLocaleUpperCase('vi-VN'),
  );
  if (original === undefined) {
    throw new Error('Không tìm thấy thông tin kho của máy gốc.');
  }
  const candidates = await listInventoryUnits(client, {
    lifecycleStatus: 'AVAILABLE',
    page: 1,
    pageSize: 100,
    productId: original.product.id,
    sortBy: 'inventoryCode',
    sortOrder: 'asc',
  });
  return candidates.data.filter(
    (unit) =>
      unit.id !== original.id &&
      unit.product.id === original.product.id &&
      unit.lifecycleStatus === 'AVAILABLE' &&
      unit.activeReservationCount === 0,
  );
}

function hasFieldErrors(errors: ActionFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

function resolutionLabel(value: ResolutionChoice): string {
  if (value === 'REPAIRED') return 'Đã sửa chữa';
  if (value === 'RETURNED_UNCHANGED') return 'Trả lại nguyên trạng';
  if (value === 'REFUNDED') return 'Đã hoàn tiền';
  if (value === 'REPLACED') return 'Đổi sang máy khác';
  return 'Phương án khác';
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
