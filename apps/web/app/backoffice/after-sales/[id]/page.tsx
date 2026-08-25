'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  afterSalesBackofficeError,
  approveAfterSales,
  assignAfterSales,
  completeAfterSalesInspection,
  getAfterSalesInspection,
  getBackofficeAfterSales,
  getBackofficeAfterSalesAttachmentUrl,
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
  updateAfterSalesInspection,
  type AfterSalesAction,
  type AfterSalesDetail,
  type AfterSalesLocationOption,
  type InspectionDetail,
} from '../../../../lib/after-sales-backoffice-api';
import {
  allPassChecklist,
  CHECK_STATUSES,
  checklistFromApi,
  checklistPayload,
  IPHONE_CHECKLIST_V1,
  type ChecklistDraft,
} from '../../../../lib/inventory-intake';
import { useAuth } from '../../../auth-provider';
import { CatalogHeader, formatMoney } from '../../../catalog-ui';

type BusyAction =
  AfterSalesAction | 'RELOAD' | 'ATTACHMENT' | 'INSPECTION_SAVE' | 'INSPECTION_COMPLETE' | null;

export default function BackofficeAfterSalesDetailPage() {
  const params = useParams<{ id: string }>();
  const caseId = decodeURIComponent(params.id);
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';
  const [detail, setDetail] = useState<AfterSalesDetail | null>(null);
  const [inspection, setInspection] = useState<InspectionDetail | null>(null);
  const [locations, setLocations] = useState<AfterSalesLocationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const [employeeId, setEmployeeId] = useState('');
  const [receivedLocationId, setReceivedLocationId] = useState('');
  const [receiveNote, setReceiveNote] = useState('Đã tiếp nhận sản phẩm và đối chiếu ngoại quan.');
  const [inspectionSummary, setInspectionSummary] = useState('');
  const [approveNote, setApproveNote] = useState('Đã kiểm định và xác nhận đủ điều kiện xử lý.');
  const [rejectReason, setRejectReason] = useState(
    'Kết quả kiểm định không đáp ứng điều kiện hậu mãi.',
  );
  const [returnNote, setReturnNote] = useState('Trả lại sản phẩm nguyên trạng sau kiểm định.');
  const [repairedNote, setRepairedNote] = useState(
    'Đã sửa chữa, kiểm tra lại và bàn giao sản phẩm.',
  );
  const [replacementUnitId, setReplacementUnitId] = useState('');
  const [replacementNote, setReplacementNote] = useState(
    'Đã đổi sang unit cùng sản phẩm đủ điều kiện.',
  );
  const [refundId, setRefundId] = useState('');
  const [refundNote, setRefundNote] = useState(
    'Đã liên kết khoản hoàn tiền hoàn tất của đơn hàng.',
  );
  const [unchangedNote, setUnchangedNote] = useState(
    'Đã trả lại sản phẩm không thay đổi sau kiểm định.',
  );
  const [otherNote, setOtherNote] = useState('');

  const [batteryHealth, setBatteryHealth] = useState('100');
  const [batteryReplacement, setBatteryReplacement] = useState<'ORIGINAL' | 'REPLACED' | 'UNKNOWN'>(
    'UNKNOWN',
  );
  const [conditionGrade, setConditionGrade] = useState<'A' | 'B' | 'C'>('B');
  const [repairHistory, setRepairHistory] = useState<'NONE_KNOWN' | 'KNOWN' | 'UNKNOWN'>('UNKNOWN');
  const [repairNotes, setRepairNotes] = useState('');
  const [cosmeticNotes, setCosmeticNotes] = useState('');
  const [checks, setChecks] = useState<ChecklistDraft>(() => allPassChecklist());

  const hydrateInspection = useCallback(
    async (next: AfterSalesDetail): Promise<void> => {
      if (next.inspection === null || next.inspection === undefined) {
        setInspection(null);
        return;
      }
      const full = await getAfterSalesInspection(client, next.inspection.id);
      setInspection(full);
    },
    [client],
  );

  const loadDetail = useCallback(async () => {
    const next = await getBackofficeAfterSales(client, caseId);
    setDetail(next);
    setEmployeeId(next.assignedTo?.id ?? '');
    setReceivedLocationId(next.receivedLocation?.id ?? '');
    setInspectionSummary(next.inspectionSummary ?? '');
    await hydrateInspection(next);
    setError(null);
  }, [caseId, client, hydrateInspection]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (inspection === null) return;
    setBatteryHealth(
      inspection.batteryHealthPercent === null || inspection.batteryHealthPercent === undefined
        ? '100'
        : String(inspection.batteryHealthPercent),
    );
    setBatteryReplacement(inspection.batteryReplacementStatus);
    setConditionGrade(inspection.conditionGrade ?? 'B');
    setRepairHistory(inspection.repairHistoryStatus);
    setRepairNotes(inspection.repairNotes ?? '');
    setCosmeticNotes(inspection.cosmeticNotes ?? '');
    setChecks(checklistFromApi(inspection.checks));
  }, [inspection]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    void Promise.all([getBackofficeAfterSales(client, caseId), listAfterSalesLocations(client)])
      .then(async ([next, nextLocations]) => {
        if (!active) return;
        setDetail(next);
        setLocations(nextLocations.filter((location) => location.status === 'ACTIVE'));
        setEmployeeId(next.assignedTo?.id ?? '');
        setReceivedLocationId(next.receivedLocation?.id ?? '');
        setInspectionSummary(next.inspectionSummary ?? '');
        if (next.inspection !== null && next.inspection !== undefined) {
          const full = await getAfterSalesInspection(client, next.inspection.id);
          setInspection(full);
        } else {
          setInspection(null);
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(messageFrom(caught, 'Không thể tải hồ sơ hậu mãi.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId, client, isStaff, status]);

  const runCommand = async (
    action: AfterSalesAction,
    operation: () => Promise<AfterSalesDetail>,
    success: string,
  ) => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const next = await operation();
      setDetail(next);
      setEmployeeId(next.assignedTo?.id ?? '');
      setInspectionSummary(next.inspectionSummary ?? '');
      await hydrateInspection(next);
      setNotice(success);
    } catch (caught) {
      const message = messageFrom(caught, 'Không thể cập nhật hồ sơ hậu mãi.');
      try {
        await loadDetail();
      } catch {
        // Keep the command error when refreshing the authoritative projection also fails.
      }
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  const reload = async () => {
    setBusy('RELOAD');
    setError(null);
    try {
      await loadDetail();
    } catch (caught) {
      setError(messageFrom(caught, 'Không thể tải lại hồ sơ hậu mãi.'));
    } finally {
      setBusy(null);
    }
  };

  const openAttachment = async (attachmentId: string) => {
    const attachmentWindow = window.open('about:blank', '_blank');
    if (attachmentWindow === null) {
      setError('Trình duyệt đã chặn tab tệp đính kèm. Hãy cho phép popup rồi thử lại.');
      return;
    }
    attachmentWindow.opener = null;
    setBusy('ATTACHMENT');
    setError(null);
    try {
      const signed = await getBackofficeAfterSalesAttachmentUrl(client, caseId, attachmentId);
      attachmentWindow.location.replace(signed.url);
    } catch (caught) {
      attachmentWindow.close();
      setError(messageFrom(caught, 'Không thể mở tệp đính kèm.'));
    } finally {
      setBusy(null);
    }
  };

  const submitAssign = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = employeeId.trim();
    if (normalized !== '' && !isUuid(normalized)) {
      setError('UUID nhân viên phụ trách không hợp lệ.');
      return;
    }
    void runCommand(
      'ASSIGN',
      () => assignAfterSales(client, caseId, normalized === '' ? null : normalized),
      normalized === '' ? 'Đã bỏ phân công hồ sơ.' : 'Đã cập nhật nhân viên phụ trách.',
    );
  };

  const submitReceive = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const locationId = receivedLocationId.trim();
    const note = receiveNote.trim();
    if (!isUuid(locationId)) {
      setError('UUID địa điểm tiếp nhận không hợp lệ.');
      return;
    }
    if (note !== '' && !validText(note, 5, 1000)) {
      setError('Ghi chú tiếp nhận phải trống hoặc có từ 5 đến 1.000 ký tự.');
      return;
    }
    void runCommand(
      'RECEIVE',
      () =>
        receiveAfterSales(client, caseId, {
          receivedLocationId: locationId,
          ...(note === '' ? {} : { note }),
        }),
      'Đã tiếp nhận sản phẩm vào địa điểm xử lý.',
    );
  };

  const submitSummary = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const summary = inspectionSummary.trim();
    if (!validText(summary, 10, 2000)) {
      setError('Kết luận kiểm định phải có từ 10 đến 2.000 ký tự.');
      return;
    }
    void runCommand(
      'RECORD_INSPECTION_SUMMARY',
      () => recordAfterSalesInspectionSummary(client, caseId, summary),
      'Đã lưu kết luận kiểm định phụ kiện.',
    );
  };

  const submitApprove = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = approveNote.trim();
    if (!validText(note, 5, 2000)) {
      setError('Ghi chú duyệt phải có từ 5 đến 2.000 ký tự.');
      return;
    }
    void runCommand(
      'APPROVE',
      () => approveAfterSales(client, caseId, note),
      'Đã duyệt hồ sơ hậu mãi.',
    );
  };

  const submitReject = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = rejectReason.trim();
    const normalizedReturnNote = returnNote.trim();
    if (!validText(reason, 5, 2000)) {
      setError('Lý do từ chối phải có từ 5 đến 2.000 ký tự.');
      return;
    }
    if (isIphone(detail) && !validText(normalizedReturnNote, 5, 1000)) {
      setError('Ghi chú trả iPhone phải có từ 5 đến 1.000 ký tự.');
      return;
    }
    if (
      !isIphone(detail) &&
      normalizedReturnNote !== '' &&
      !validText(normalizedReturnNote, 5, 1000)
    ) {
      setError('Ghi chú trả hàng phải trống hoặc có từ 5 đến 1.000 ký tự.');
      return;
    }
    void runCommand(
      'REJECT',
      () =>
        rejectAfterSales(client, caseId, {
          reason,
          ...(normalizedReturnNote === '' ? {} : { returnNote: normalizedReturnNote }),
        }),
      'Đã từ chối và ghi nhận phương án trả sản phẩm.',
    );
  };

  const inspectionInput = () => {
    const battery = Number(batteryHealth);
    if (!Number.isInteger(battery) || battery < 0 || battery > 100) {
      throw new Error('Battery health phải là số nguyên từ 0 đến 100.');
    }
    if (repairHistory === 'KNOWN' && repairNotes.trim() === '') {
      throw new Error('Hãy nhập ghi chú khi có lịch sử sửa chữa.');
    }
    return {
      batteryHealthPercent: battery,
      batteryReplacementStatus: batteryReplacement,
      conditionGrade,
      checks: checklistPayload(checks) as never,
      repairHistoryStatus: repairHistory,
      ...(repairNotes.trim() === '' ? {} : { repairNotes: repairNotes.trim() }),
      ...(cosmeticNotes.trim() === '' ? {} : { cosmeticNotes: cosmeticNotes.trim() }),
    };
  };

  const saveInspection = async (complete: boolean) => {
    if (inspection === null) {
      setError('Chưa có bản kiểm định iPhone.');
      return;
    }
    setBusy(complete ? 'INSPECTION_COMPLETE' : 'INSPECTION_SAVE');
    setError(null);
    setNotice(null);
    try {
      const saved = await updateAfterSalesInspection(client, inspection.id, inspectionInput());
      if (!complete) {
        setInspection(saved);
        setNotice('Đã lưu checklist kiểm định nháp.');
      } else {
        const completed = await completeAfterSalesInspection(client, saved.id);
        setInspection(completed);
        await loadDetail();
        setNotice(`Đã hoàn tất kiểm định với kết quả ${completed.overallResult}.`);
      }
    } catch (caught) {
      setError(messageFrom(caught, 'Không thể cập nhật checklist kiểm định.'));
    } finally {
      setBusy(null);
    }
  };

  const hasAction = (action: AfterSalesAction) =>
    detail?.availableActions.includes(action) === true;

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell payment-review-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/backoffice/after-sales">Hậu mãi</Link>
          <span>/</span>
          <span>{detail?.requestNumber ?? caseId}</span>
        </nav>

        {status === 'loading' || loading ? (
          <div className="status">Đang tải hồ sơ hậu mãi…</div>
        ) : null}
        {status === 'anonymous' ? (
          <section className="empty-state">
            <h1>Cần đăng nhập nhân viên</h1>
            <Link className="button primary" href="/login">
              Đăng nhập
            </Link>
          </section>
        ) : null}
        {status === 'authenticated' && !isStaff ? (
          <div className="commerce-alert error" role="alert">
            Bạn không có quyền xử lý hậu mãi.
          </div>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            {isStaff ? (
              <button
                className="button"
                type="button"
                disabled={busy !== null}
                onClick={() => void reload()}
              >
                Tải lại
              </button>
            ) : null}
          </div>
        )}
        {notice === null ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
          </div>
        )}

        {status === 'authenticated' && isStaff && detail !== null ? (
          <>
            <header className="backoffice-page-heading">
              <div>
                <p className="eyebrow">{typeLabel(detail.type)}</p>
                <h1>{detail.requestNumber}</h1>
                <p>
                  {detail.orderItem.orderNumber} · {detail.customer.name}
                </p>
              </div>
              <span className={`payment-status-badge ${detail.status.toLowerCase()}`}>
                {statusLabel(detail.status)}
              </span>
            </header>

            <div className="payment-review-layout">
              <div className="payment-review-main">
                <section className="review-card">
                  <h2>Yêu cầu và sản phẩm</h2>
                  <dl className="payment-review-specs">
                    <Spec label="Mã đơn" value={detail.orderItem.orderNumber} />
                    <Spec label="Sản phẩm" value={detail.orderItem.productName} />
                    <Spec label="Phiên bản" value={detail.orderItem.variantName} />
                    <Spec
                      label="Inventory code"
                      value={detail.orderItem.inventoryCode ?? 'Phụ kiện theo số lượng'}
                    />
                    <Spec label="Số lượng" value={String(detail.orderItem.quantity)} />
                    <Spec label="Khách hàng" value={detail.customer.name} />
                    <Spec label="Email" value={detail.customer.email} />
                    <Spec label="Điện thoại" value={detail.customer.phone} />
                    <Spec
                      label="Phụ trách"
                      value={detail.assignedTo?.fullName ?? 'Chưa phân công'}
                    />
                    <Spec label="Yêu cầu lúc" value={dateTime(detail.requestedAt)} />
                  </dl>
                  <h3>Mô tả vấn đề</h3>
                  <p>{detail.issueDescription}</p>
                  {detail.requestedResolution === null ||
                  detail.requestedResolution === undefined ? null : (
                    <p>
                      <strong>Mong muốn:</strong> {detail.requestedResolution}
                    </p>
                  )}
                </section>

                <section className="review-card">
                  <h2>Bảo hành và kết quả</h2>
                  <dl className="payment-review-specs">
                    <Spec
                      label="Bảo hành"
                      value={detail.warranty?.warrantyCode ?? 'Không áp dụng'}
                    />
                    <Spec
                      label="Tình trạng bảo hành"
                      value={
                        detail.warranty === null || detail.warranty === undefined
                          ? '—'
                          : detail.warranty.isValid
                            ? 'Còn hiệu lực'
                            : detail.warranty.status
                      }
                    />
                    <Spec
                      label="Địa điểm nhận"
                      value={
                        detail.receivedLocation === null || detail.receivedLocation === undefined
                          ? '—'
                          : `${detail.receivedLocation.code} · ${detail.receivedLocation.name}`
                      }
                    />
                    <Spec label="Người tiếp nhận" value={detail.receivedBy?.fullName ?? '—'} />
                    <Spec
                      label="Inspection"
                      value={
                        detail.inspection === null || detail.inspection === undefined
                          ? detail.inspectionSummary === null ||
                            detail.inspectionSummary === undefined
                            ? '—'
                            : 'Kết luận phụ kiện đã lưu'
                          : `${detail.inspection.type} · ${detail.inspection.status} · ${detail.inspection.overallResult}`
                      }
                    />
                    <Spec label="Quyết định" value={detail.decisionNote ?? '—'} />
                    <Spec label="Resolution" value={detail.resolutionType ?? '—'} />
                    <Spec label="Người xử lý" value={detail.resolvedBy?.fullName ?? '—'} />
                  </dl>
                  {detail.inspectionSummary === null ||
                  detail.inspectionSummary === undefined ? null : (
                    <p>
                      <strong>Kết luận phụ kiện:</strong> {detail.inspectionSummary}
                    </p>
                  )}
                  {detail.resolutionNote === null || detail.resolutionNote === undefined ? null : (
                    <p>
                      <strong>Kết quả cuối:</strong> {detail.resolutionNote}
                    </p>
                  )}
                  {detail.replacementUnit === null ||
                  detail.replacementUnit === undefined ? null : (
                    <p>
                      <strong>Unit thay thế:</strong> {detail.replacementUnit.inventoryCode}
                    </p>
                  )}
                  {detail.refund === null || detail.refund === undefined ? null : (
                    <p>
                      <strong>Refund:</strong> {formatMoney(detail.refund.amount)} ₫ ·{' '}
                      {detail.refund.status}
                    </p>
                  )}
                </section>

                <section className="review-card">
                  <h2>Tệp khách hàng gửi ({detail.attachments.length})</h2>
                  {detail.attachments.length === 0 ? <p>Chưa có tệp đính kèm.</p> : null}
                  <div className="wizard-actions">
                    {detail.attachments.map((attachment, index) => (
                      <button
                        className="button"
                        type="button"
                        key={attachment.id}
                        disabled={busy !== null}
                        onClick={() => void openAttachment(attachment.id)}
                      >
                        Mở tệp {index + 1} · {fileLabel(attachment.mimeType)} ·{' '}
                        {fileSize(attachment.fileSize)}
                      </button>
                    ))}
                  </div>
                  <small>
                    Liên kết chỉ được tạo khi bấm mở và tự hết hạn; giao diện không hiển thị đường
                    dẫn lưu trữ riêng tư.
                  </small>
                </section>

                {inspection?.status === 'DRAFT' ? (
                  <section className="review-card" aria-labelledby="iphone-inspection-title">
                    <div className="checklist-heading">
                      <div>
                        <p className="eyebrow">Inspection {inspection.inspectionType}</p>
                        <h2 id="iphone-inspection-title">Checklist iPhone 18 hạng mục</h2>
                      </div>
                      <button
                        className="button"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setChecks(allPassChecklist());
                        }}
                      >
                        Đánh dấu tất cả PASS
                      </button>
                    </div>
                    <div className="wizard-form compact">
                      <label>
                        Battery health (%)
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={batteryHealth}
                          disabled={busy !== null}
                          onChange={(event) => {
                            setBatteryHealth(event.target.value);
                          }}
                        />
                      </label>
                      <label>
                        Condition grade
                        <select
                          value={conditionGrade}
                          disabled={busy !== null}
                          onChange={(event) => {
                            setConditionGrade(event.target.value as 'A' | 'B' | 'C');
                          }}
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </label>
                      <label>
                        Tình trạng pin
                        <select
                          value={batteryReplacement}
                          disabled={busy !== null}
                          onChange={(event) => {
                            setBatteryReplacement(event.target.value as typeof batteryReplacement);
                          }}
                        >
                          <option value="ORIGINAL">Nguyên bản</option>
                          <option value="REPLACED">Đã thay</option>
                          <option value="UNKNOWN">Chưa rõ</option>
                        </select>
                      </label>
                      <label>
                        Lịch sử sửa chữa
                        <select
                          value={repairHistory}
                          disabled={busy !== null}
                          onChange={(event) => {
                            setRepairHistory(event.target.value as typeof repairHistory);
                          }}
                        >
                          <option value="NONE_KNOWN">Không ghi nhận</option>
                          <option value="KNOWN">Có sửa chữa</option>
                          <option value="UNKNOWN">Chưa rõ</option>
                        </select>
                      </label>
                      <label className="field-wide">
                        Ngoại quan
                        <textarea
                          value={cosmeticNotes}
                          maxLength={2000}
                          disabled={busy !== null}
                          onChange={(event) => {
                            setCosmeticNotes(event.target.value);
                          }}
                        />
                      </label>
                      {repairHistory === 'KNOWN' ? (
                        <label className="field-wide">
                          Ghi chú sửa chữa
                          <textarea
                            value={repairNotes}
                            maxLength={2000}
                            required
                            disabled={busy !== null}
                            onChange={(event) => {
                              setRepairNotes(event.target.value);
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className="checklist-grid">
                      {IPHONE_CHECKLIST_V1.map(([key, label]) => (
                        <fieldset key={key} disabled={busy !== null}>
                          <legend>{label}</legend>
                          <label>
                            Trạng thái
                            <select
                              value={checks[key].status}
                              onChange={(event) => {
                                setChecks((current) => ({
                                  ...current,
                                  [key]: {
                                    ...current[key],
                                    status: event.target
                                      .value as ChecklistDraft[typeof key]['status'],
                                  },
                                }));
                              }}
                            >
                              {CHECK_STATUSES.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Ghi chú
                            <input
                              value={checks[key].note}
                              required={['FAIL', 'DEGRADED', 'NOT_TESTED', 'UNKNOWN'].includes(
                                checks[key].status,
                              )}
                              onChange={(event) => {
                                setChecks((current) => ({
                                  ...current,
                                  [key]: { ...current[key], note: event.target.value },
                                }));
                              }}
                            />
                          </label>
                        </fieldset>
                      ))}
                    </div>
                    <div className="wizard-actions">
                      <button
                        className="button"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void saveInspection(false)}
                      >
                        {busy === 'INSPECTION_SAVE' ? 'Đang lưu…' : 'Lưu bản nháp'}
                      </button>
                      <button
                        className="button primary"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void saveInspection(true)}
                      >
                        {busy === 'INSPECTION_COMPLETE'
                          ? 'Đang hoàn tất…'
                          : 'Lưu và hoàn tất kiểm định'}
                      </button>
                    </div>
                  </section>
                ) : null}

                {inspection?.status === 'COMPLETED' ? (
                  <section className="review-card">
                    <h2>Kiểm định iPhone đã hoàn tất</h2>
                    <p className={`inspection-result ${inspection.overallResult.toLowerCase()}`}>
                      Kết quả: <strong>{inspection.overallResult}</strong>
                    </p>
                    <p>
                      Checklist đã bất biến. Backend đã mở action duyệt/từ chối theo trạng thái hiện
                      hành.
                    </p>
                  </section>
                ) : null}

                <section className="review-card">
                  <h2>Timeline</h2>
                  <ol className="payment-timeline">
                    {timeline(detail).map((entry) => (
                      <li key={entry.label}>
                        <strong>{entry.label}</strong>
                        <time>{dateTime(entry.at)}</time>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <aside className="payment-review-actions" aria-label="Thao tác hậu mãi">
                {hasAction('ASSIGN') ? (
                  <ActionForm title="Phân công" onSubmit={submitAssign} busy={busy !== null}>
                    <label>
                      UUID nhân viên active
                      <input
                        value={employeeId}
                        placeholder="Để trống để bỏ phân công"
                        disabled={busy !== null}
                        onChange={(event) => {
                          setEmployeeId(event.target.value);
                        }}
                      />
                    </label>
                    <button
                      className="button"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        setEmployeeId(user.id);
                      }}
                    >
                      Giao cho tôi
                    </button>
                    <button className="button primary" type="submit" disabled={busy !== null}>
                      {busy === 'ASSIGN' ? 'Đang lưu…' : 'Cập nhật phân công'}
                    </button>
                  </ActionForm>
                ) : null}

                {hasAction('RECEIVE') ? (
                  <ActionForm
                    title="Tiếp nhận sản phẩm"
                    onSubmit={submitReceive}
                    busy={busy !== null}
                  >
                    <label>
                      Địa điểm tiếp nhận
                      <select
                        value={receivedLocationId}
                        required
                        disabled={busy !== null}
                        onChange={(event) => {
                          setReceivedLocationId(event.target.value);
                        }}
                      >
                        <option value="">Chọn cửa hàng/kho</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.code} · {location.name} ({location.type})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Ghi chú tiếp nhận
                      <textarea
                        value={receiveNote}
                        maxLength={1000}
                        disabled={busy !== null}
                        onChange={(event) => {
                          setReceiveNote(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button primary" type="submit" disabled={busy !== null}>
                      {busy === 'RECEIVE' ? 'Đang tiếp nhận…' : 'Xác nhận tiếp nhận'}
                    </button>
                  </ActionForm>
                ) : null}

                {hasAction('START_INSPECTION') ? (
                  <section className="review-action-card">
                    <h2>Bắt đầu kiểm định</h2>
                    <p>
                      {isIphone(detail)
                        ? 'Tạo inspection typed và checklist 18 hạng mục.'
                        : 'Mở bước ghi kết luận kiểm định phụ kiện.'}
                    </p>
                    <button
                      className="button primary"
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void runCommand(
                          'START_INSPECTION',
                          () => startAfterSalesInspection(client, caseId),
                          'Đã bắt đầu kiểm định.',
                        )
                      }
                    >
                      {busy === 'START_INSPECTION' ? 'Đang bắt đầu…' : 'Bắt đầu kiểm định'}
                    </button>
                  </section>
                ) : null}

                {hasAction('RECORD_INSPECTION_SUMMARY') ? (
                  <ActionForm
                    title="Kết luận phụ kiện"
                    onSubmit={submitSummary}
                    busy={busy !== null}
                  >
                    <label>
                      Kết luận 10–2.000 ký tự
                      <textarea
                        value={inspectionSummary}
                        minLength={10}
                        maxLength={2000}
                        required
                        disabled={busy !== null}
                        onChange={(event) => {
                          setInspectionSummary(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button primary" type="submit" disabled={busy !== null}>
                      {busy === 'RECORD_INSPECTION_SUMMARY' ? 'Đang lưu…' : 'Lưu kết luận'}
                    </button>
                  </ActionForm>
                ) : null}

                {hasAction('APPROVE') ? (
                  <ActionForm title="Duyệt hồ sơ" onSubmit={submitApprove} busy={busy !== null}>
                    <label>
                      Ghi chú quyết định
                      <textarea
                        value={approveNote}
                        minLength={5}
                        maxLength={2000}
                        required
                        disabled={busy !== null}
                        onChange={(event) => {
                          setApproveNote(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button primary" type="submit" disabled={busy !== null}>
                      {busy === 'APPROVE' ? 'Đang duyệt…' : 'Duyệt hồ sơ'}
                    </button>
                  </ActionForm>
                ) : null}

                {hasAction('REJECT') ? (
                  <ActionForm title="Từ chối hồ sơ" onSubmit={submitReject} busy={busy !== null}>
                    <label>
                      Lý do
                      <textarea
                        value={rejectReason}
                        minLength={5}
                        maxLength={2000}
                        required
                        disabled={busy !== null}
                        onChange={(event) => {
                          setRejectReason(event.target.value);
                        }}
                      />
                    </label>
                    <label>
                      Ghi chú trả sản phẩm
                      <textarea
                        value={returnNote}
                        minLength={5}
                        maxLength={1000}
                        required={isIphone(detail)}
                        disabled={busy !== null}
                        onChange={(event) => {
                          setReturnNote(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button danger" type="submit" disabled={busy !== null}>
                      {busy === 'REJECT' ? 'Đang từ chối…' : 'Từ chối và trả sản phẩm'}
                    </button>
                  </ActionForm>
                ) : null}

                {hasAction('RESOLVE_REPAIRED') ? (
                  <ResolutionForm
                    title="Đã sửa chữa"
                    action="RESOLVE_REPAIRED"
                    note={repairedNote}
                    setNote={setRepairedNote}
                    busy={busy}
                    onSubmit={() => resolveAfterSalesRepaired(client, caseId, repairedNote.trim())}
                    runCommand={runCommand}
                  />
                ) : null}

                {hasAction('RESOLVE_REPLACED') ? (
                  <ActionForm
                    title="Đổi unit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const note = replacementNote.trim();
                      const unitId = replacementUnitId.trim();
                      if (!isUuid(unitId)) {
                        setError('UUID unit thay thế không hợp lệ.');
                        return;
                      }
                      if (!validText(note, 5, 2000)) {
                        setError('Ghi chú xử lý phải có từ 5 đến 2.000 ký tự.');
                        return;
                      }
                      void runCommand(
                        'RESOLVE_REPLACED',
                        () =>
                          resolveAfterSalesReplaced(client, caseId, {
                            replacementInventoryUnitId: unitId,
                            resolutionNote: note,
                          }),
                        'Đã chốt phương án đổi unit.',
                      );
                    }}
                    busy={busy !== null}
                  >
                    <label>
                      UUID unit thay thế
                      <input
                        value={replacementUnitId}
                        required
                        disabled={busy !== null}
                        onChange={(event) => {
                          setReplacementUnitId(event.target.value);
                        }}
                      />
                    </label>
                    <label>
                      Ghi chú xử lý
                      <textarea
                        value={replacementNote}
                        minLength={5}
                        maxLength={2000}
                        required
                        disabled={busy !== null}
                        onChange={(event) => {
                          setReplacementNote(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button primary" type="submit" disabled={busy !== null}>
                      {busy === 'RESOLVE_REPLACED' ? 'Đang xử lý…' : 'Xác nhận đổi unit'}
                    </button>
                  </ActionForm>
                ) : null}

                {hasAction('RESOLVE_REFUNDED') ? (
                  <ActionForm
                    title="Đã hoàn tiền"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const note = refundNote.trim();
                      const completedRefundId = refundId.trim();
                      if (!isUuid(completedRefundId)) {
                        setError('UUID Refund không hợp lệ.');
                        return;
                      }
                      if (!validText(note, 5, 2000)) {
                        setError('Ghi chú xử lý phải có từ 5 đến 2.000 ký tự.');
                        return;
                      }
                      void runCommand(
                        'RESOLVE_REFUNDED',
                        () =>
                          resolveAfterSalesRefunded(client, caseId, {
                            refundId: completedRefundId,
                            resolutionNote: note,
                          }),
                        'Đã liên kết Refund hoàn tất.',
                      );
                    }}
                    busy={busy !== null}
                  >
                    <label>
                      UUID Refund COMPLETED
                      <input
                        value={refundId}
                        required
                        disabled={busy !== null}
                        onChange={(event) => {
                          setRefundId(event.target.value);
                        }}
                      />
                    </label>
                    <label>
                      Ghi chú xử lý
                      <textarea
                        value={refundNote}
                        minLength={5}
                        maxLength={2000}
                        required
                        disabled={busy !== null}
                        onChange={(event) => {
                          setRefundNote(event.target.value);
                        }}
                      />
                    </label>
                    <button className="button primary" type="submit" disabled={busy !== null}>
                      {busy === 'RESOLVE_REFUNDED' ? 'Đang xử lý…' : 'Xác nhận hoàn tiền'}
                    </button>
                  </ActionForm>
                ) : null}

                {hasAction('RESOLVE_RETURNED_UNCHANGED') ? (
                  <ResolutionForm
                    title="Trả nguyên trạng"
                    action="RESOLVE_RETURNED_UNCHANGED"
                    note={unchangedNote}
                    setNote={setUnchangedNote}
                    busy={busy}
                    onSubmit={() =>
                      resolveAfterSalesReturnedUnchanged(client, caseId, unchangedNote.trim())
                    }
                    runCommand={runCommand}
                  />
                ) : null}

                {hasAction('RESOLVE_OTHER') && isAdmin ? (
                  <ResolutionForm
                    title="Phương án khác (ADMIN)"
                    action="RESOLVE_OTHER"
                    note={otherNote}
                    setNote={setOtherNote}
                    busy={busy}
                    onSubmit={() => resolveAfterSalesOther(client, caseId, otherNote.trim())}
                    runCommand={runCommand}
                  />
                ) : null}

                {detail.availableActions.length === 0 ? (
                  <section className="review-action-card">
                    <h2>Không có thao tác tiếp theo</h2>
                    <p>Hồ sơ đã ở trạng thái terminal hoặc không còn command phù hợp.</p>
                  </section>
                ) : null}
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

function ActionForm({
  title,
  onSubmit,
  busy,
  children,
}: {
  title: string;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <form className="review-action-card" aria-busy={busy} onSubmit={onSubmit}>
      <h2>{title}</h2>
      {children}
    </form>
  );
}

function ResolutionForm({
  title,
  action,
  note,
  setNote,
  busy,
  onSubmit,
  runCommand,
}: {
  title: string;
  action: Extract<
    AfterSalesAction,
    'RESOLVE_REPAIRED' | 'RESOLVE_RETURNED_UNCHANGED' | 'RESOLVE_OTHER'
  >;
  note: string;
  setNote: (value: string) => void;
  busy: BusyAction;
  onSubmit: () => Promise<AfterSalesDetail>;
  runCommand: (
    action: AfterSalesAction,
    operation: () => Promise<AfterSalesDetail>,
    success: string,
  ) => Promise<void>;
}) {
  return (
    <ActionForm
      title={title}
      busy={busy !== null}
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = note.trim();
        if (!validText(normalized, 5, 2000)) return;
        void runCommand(action, onSubmit, `Đã chốt: ${title.toLowerCase()}.`);
      }}
    >
      <label>
        Ghi chú xử lý
        <textarea
          value={note}
          minLength={5}
          maxLength={2000}
          required
          disabled={busy !== null}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </label>
      <button className="button primary" type="submit" disabled={busy !== null}>
        {busy === action ? 'Đang xử lý…' : `Xác nhận ${title.toLowerCase()}`}
      </button>
    </ActionForm>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function timeline(detail: AfterSalesDetail): Array<{ label: string; at: string }> {
  const rows: Array<[string, string | null | undefined]> = [
    ['Khách gửi yêu cầu', detail.timeline.requestedAt],
    ['Đã tiếp nhận', detail.timeline.receivedAt],
    ['Bắt đầu kiểm định', detail.timeline.inspectedAt],
    ['Đã quyết định', detail.timeline.decidedAt],
    ['Đã xử lý', detail.timeline.resolvedAt],
    ['Đã trả sản phẩm', detail.timeline.returnedAt],
    ['Đã hủy', detail.timeline.cancelledAt],
  ];
  return rows.flatMap(([label, at]) => (at === null || at === undefined ? [] : [{ label, at }]));
}

function isIphone(detail: AfterSalesDetail | null): boolean {
  return detail?.orderItem.inventoryCode !== null && detail?.orderItem.inventoryCode !== undefined;
}

function validText(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function messageFrom(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : afterSalesBackofficeError(value, fallback);
}

function fileLabel(value: string): string {
  if (value === 'application/pdf') return 'PDF';
  if (value === 'image/jpeg') return 'JPEG';
  if (value === 'image/png') return 'PNG';
  if (value === 'image/webp') return 'WebP';
  return 'Tệp';
}

function fileSize(value: number): string {
  return value < 1024 * 1024
    ? `${String(Math.max(1, Math.round(value / 1024)))} KiB`
    : `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function typeLabel(value: string): string {
  if (value === 'WARRANTY') return 'Bảo hành';
  if (value === 'RETURN') return 'Trả hàng';
  if (value === 'EXCHANGE') return 'Đổi hàng';
  return value;
}

function statusLabel(value: string): string {
  if (value === 'REQUESTED') return 'Mới yêu cầu';
  if (value === 'RECEIVED') return 'Đã tiếp nhận';
  if (value === 'INSPECTING') return 'Đang kiểm định';
  if (value === 'APPROVED') return 'Đã duyệt';
  if (value === 'REJECTED') return 'Từ chối';
  if (value === 'RESOLVED') return 'Đã xử lý';
  if (value === 'CANCELLED') return 'Đã hủy';
  return value;
}

function dateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}
