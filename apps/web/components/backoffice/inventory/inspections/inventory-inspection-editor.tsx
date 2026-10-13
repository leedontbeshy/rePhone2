'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  InventoryWorkflowProgress,
  type InventoryWorkflowStep,
} from '@/components/backoffice/inventory/inventory-workflow-progress';
import { Button, InlineAlert, Input, Select, StatusChip, Textarea } from '@/components/ui';
import type {
  InventoryCheckStatus,
  InventoryInspectionDetail,
  UpdateInventoryInspectionInput,
} from '@/lib/backoffice-inventory-api';
import {
  inspectionCheckStatusPresentation,
  inspectionResultPresentation,
  inspectionStatusPresentation,
  inspectionTypeLabel,
} from '../inventory-presenter';
import {
  INSPECTION_CHECK_GROUPS,
  INSPECTION_CHECKS,
  inspectionCheckRequiresNote,
  inspectionDraftFrom,
  inspectionDraftProgress,
  inspectionDraftResult,
  type InspectionEditorDraft,
  type InspectionEditorFieldErrors,
  type InventoryInspectionCheckKey,
  validateInspectionDraft,
} from './inspection-editor-logic';
import styles from './inventory-inspection.module.css';

const CHECK_STATUS_OPTIONS: ReadonlyArray<{
  label: string;
  value: InventoryCheckStatus;
}> = [
  { label: 'Đạt', value: 'PASS' },
  { label: 'Không đạt', value: 'FAIL' },
  { label: 'Hoạt động chưa tốt', value: 'DEGRADED' },
  { label: 'Chưa kiểm tra', value: 'NOT_TESTED' },
  { label: 'Không áp dụng', value: 'NOT_APPLICABLE' },
  { label: 'Chưa xác định', value: 'UNKNOWN' },
];

export interface InventoryInspectionEditorProps {
  readonly busyAction?: 'save' | 'complete' | null;
  readonly editable?: boolean;
  readonly embedded?: boolean;
  readonly error?: string | null;
  readonly inspection: InventoryInspectionDetail;
  readonly notice?: string | null;
  readonly onComplete: (input: UpdateInventoryInspectionInput) => void;
  readonly onReload?: () => void;
  readonly onSave: (input: UpdateInventoryInspectionInput) => void;
  readonly returnToIntakeHref?: string;
  readonly showIntakeWorkflow?: boolean;
  readonly unitSummary?: {
    readonly inventoryCode: string;
    readonly maskedIdentifiers: readonly string[];
    readonly productName: string;
    readonly variantName: string;
  } | null;
}

export function InventoryInspectionEditor({
  busyAction = null,
  editable = true,
  embedded = false,
  error = null,
  inspection,
  notice = null,
  onComplete,
  onReload,
  onSave,
  returnToIntakeHref,
  showIntakeWorkflow = false,
  unitSummary = null,
}: InventoryInspectionEditorProps) {
  const [draft, setDraft] = useState(() => inspectionDraftFrom(inspection));
  const [errors, setErrors] = useState<InspectionEditorFieldErrors>({});
  const [completionInput, setCompletionInput] = useState<UpdateInventoryInspectionInput | null>(
    null,
  );

  useEffect(() => {
    setDraft(inspectionDraftFrom(inspection));
    setErrors({});
    setCompletionInput(null);
  }, [inspection]);

  useEffect(() => {
    if (completionInput === null || typeof document === 'undefined') return;
    globalThis.setTimeout(() => {
      document.getElementById('inspection-review-title')?.focus();
    }, 0);
  }, [completionInput]);

  const progress = useMemo(() => inspectionDraftProgress(draft), [draft]);
  const checklistLabels = useMemo(
    () =>
      new Map((inspection.checklist?.items ?? []).map((item) => [item.key, item.label] as const)),
    [inspection.checklist],
  );
  const readonly = inspection.status === 'COMPLETED' || !editable;
  const statusPresentation = inspectionStatusPresentation(inspection.status);
  const resultPresentation = inspectionResultPresentation(inspection.overallResult);
  const workflowCompletedSteps: readonly InventoryWorkflowStep[] =
    inspection.status === 'COMPLETED' && inspection.overallResult === 'PASSED' ? [1, 2, 3] : [1, 2];

  function updateField<Key extends Exclude<keyof InspectionEditorDraft, 'checks'>>(
    field: Key,
    value: InspectionEditorDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    clearError(field);
    if (field === 'repairHistoryStatus' && value !== 'KNOWN') clearError('repairNotes');
  }

  function updateCheck(key: InventoryInspectionCheckKey, field: 'status' | 'note', value: string) {
    setDraft((current) => ({
      ...current,
      checks: {
        ...current.checks,
        [key]: { ...current.checks[key], [field]: value },
      },
    }));
    clearError(`checks.${key}.${field}`);
    if (field === 'status' && (value === 'PASS' || value === 'NOT_APPLICABLE')) {
      clearError(`checks.${key}.note`);
    }
  }

  function selectAllPassed() {
    if (readonly || busyAction !== null) return;
    setDraft((current) => {
      const checks = { ...current.checks };
      for (const { key } of INSPECTION_CHECKS) {
        checks[key] = { ...checks[key], status: 'PASS' };
      }
      return { ...current, checks };
    });
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => !field.startsWith('checks.'))),
    );
  }

  function clearError(field: string) {
    setErrors((current) => {
      if (current[field] === undefined) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== field));
    });
  }

  function submit(mode: 'save' | 'complete') {
    const validation = validateInspectionDraft(draft, mode);
    setErrors(validation.errors);
    if (!validation.isValid) {
      focusFirstInvalidField(validation.errors);
      return;
    }
    if (mode === 'save') {
      onSave(validation.input);
      return;
    }
    setCompletionInput(validation.input);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Kho hàng · Kiểm định máy</p>
          <div className={styles.titleLine}>
            {embedded ? <h2>Phiếu kiểm định iPhone</h2> : <h1>Phiếu kiểm định iPhone</h1>}
            <StatusChip label={statusPresentation.label} tone={statusPresentation.tone} />
          </div>
          <p>
            {inspectionTypeLabel(inspection.inspectionType)} ·{' '}
            <Link href={`/backoffice/inventory/units/${inspection.inventoryUnitId}`}>
              Mở hồ sơ máy
            </Link>
          </p>
        </div>
      </header>

      {showIntakeWorkflow ? (
        <InventoryWorkflowProgress completedSteps={workflowCompletedSteps} currentStep={3} />
      ) : null}

      <dl className={styles.contextGrid} aria-label="Thông tin máy và phiếu kiểm định">
        {unitSummary === null ? null : (
          <>
            <ContextItem label="Mã máy">{unitSummary.inventoryCode}</ContextItem>
            <ContextItem label="Thiết bị">
              <span>{unitSummary.productName}</span>
              <small>{unitSummary.variantName}</small>
            </ContextItem>
            <ContextItem label="Định danh">
              {unitSummary.maskedIdentifiers.join(' · ') || 'Chưa có mã định danh'}
            </ContextItem>
          </>
        )}
        <ContextItem label="Kỹ thuật viên">
          <span>{inspection.inspector?.fullName ?? 'Chưa có thông tin'}</span>
          {inspection.inspector?.employeeCode ? (
            <small>{inspection.inspector.employeeCode}</small>
          ) : null}
        </ContextItem>
        <ContextItem label="Kết quả hiện tại">
          <StatusChip label={resultPresentation.label} tone={resultPresentation.tone} />
          <small>Cập nhật {formatInventoryDateTime(inspection.updatedAt)}</small>
        </ContextItem>
      </dl>

      {error === null ? null : (
        <InlineAlert title="Chưa thể cập nhật phiếu kiểm định" tone="danger">
          {error}{' '}
          {onReload === undefined ? null : (
            <Button size="compact" variant="secondary" onClick={onReload}>
              Tải lại dữ liệu
            </Button>
          )}
        </InlineAlert>
      )}
      {notice === null ? null : (
        <InlineAlert title="Đã cập nhật" tone="success">
          {notice}
        </InlineAlert>
      )}
      {!editable && inspection.status === 'DRAFT' ? (
        <InlineAlert title="Phiếu đang do người khác phụ trách" tone="warning">
          Bạn có thể xem kết quả hiện tại nhưng không thể sửa hoặc hoàn tất phiếu này.
        </InlineAlert>
      ) : null}

      {readonly ? (
        <CompletedInspection
          checklistLabels={checklistLabels}
          inspection={inspection}
          draft={draft}
          {...(returnToIntakeHref === undefined ? {} : { returnToIntakeHref })}
        />
      ) : completionInput !== null ? (
        <InspectionCompletionReview
          busy={busyAction === 'complete'}
          checklistLabels={checklistLabels}
          draft={draft}
          onBack={() => {
            if (busyAction === null) {
              setCompletionInput(null);
              globalThis.setTimeout(() => {
                document.getElementById('inspection-complete-trigger')?.focus();
              }, 0);
            }
          }}
          onConfirm={() => {
            onComplete(completionInput);
          }}
        />
      ) : (
        <form
          noValidate
          className={styles.editor}
          onSubmit={(event) => {
            event.preventDefault();
            submit('save');
          }}
        >
          <section className={styles.panel} aria-labelledby="inspection-overview-title">
            <div className={styles.panelHeading}>
              <div>
                <h2 id="inspection-overview-title">Tình trạng chung</h2>
                <p>Ghi nhận pin, ngoại hình và lịch sử sửa chữa trước khi hoàn tất.</p>
              </div>
            </div>
            <div className={styles.summaryFields}>
              <Input
                error={errors['batteryHealthPercent']}
                id="battery-health-percent"
                inputMode="numeric"
                label="Tình trạng pin (%)"
                hint="Bắt buộc trước khi hoàn tất phiếu."
                max={100}
                min={0}
                placeholder="Ví dụ: 91"
                type="number"
                value={draft.batteryHealthPercent}
                onChange={(event) => {
                  updateField('batteryHealthPercent', event.target.value);
                }}
              />
              <Input
                error={errors['batteryCycleCount']}
                id="battery-cycle-count"
                inputMode="numeric"
                label="Số chu kỳ sạc"
                min={0}
                placeholder="Nếu đọc được từ máy"
                type="number"
                value={draft.batteryCycleCount}
                onChange={(event) => {
                  updateField('batteryCycleCount', event.target.value);
                }}
              />
              <Select
                id="battery-replacement-status"
                label="Tình trạng thay pin"
                value={draft.batteryReplacementStatus}
                onChange={(event) => {
                  updateField(
                    'batteryReplacementStatus',
                    event.target.value as InspectionEditorDraft['batteryReplacementStatus'],
                  );
                }}
              >
                <option value="ORIGINAL">Pin nguyên bản</option>
                <option value="REPLACED">Đã thay pin</option>
                <option value="UNKNOWN">Chưa xác định</option>
              </Select>
              <Select
                error={errors['conditionGrade']}
                id="condition-grade"
                label="Xếp loại ngoại hình"
                hint="Bắt buộc trước khi hoàn tất phiếu."
                value={draft.conditionGrade}
                onChange={(event) => {
                  updateField(
                    'conditionGrade',
                    event.target.value as InspectionEditorDraft['conditionGrade'],
                  );
                }}
              >
                <option value="">Chọn loại ngoại hình</option>
                <option value="A">Loại A · Rất đẹp</option>
                <option value="B">Loại B · Có dấu hiệu sử dụng</option>
                <option value="C">Loại C · Trầy xước rõ</option>
              </Select>
            </div>
            <div className={styles.notesGrid}>
              <Textarea
                error={errors['cosmeticNotes']}
                id="cosmetic-notes"
                label="Ghi chú ngoại hình"
                maxLength={2_000}
                placeholder="Mô tả vết xước, móp hoặc dấu hiệu cần lưu ý"
                rows={4}
                value={draft.cosmeticNotes}
                onChange={(event) => {
                  updateField('cosmeticNotes', event.target.value);
                }}
              />
              <div className={styles.repairFields}>
                <Select
                  id="repair-history-status"
                  label="Lịch sử sửa chữa"
                  value={draft.repairHistoryStatus}
                  onChange={(event) => {
                    updateField(
                      'repairHistoryStatus',
                      event.target.value as InspectionEditorDraft['repairHistoryStatus'],
                    );
                  }}
                >
                  <option value="NONE_KNOWN">Chưa ghi nhận sửa chữa</option>
                  <option value="KNOWN">Có lịch sử sửa chữa</option>
                  <option value="UNKNOWN">Chưa xác định</option>
                </Select>
                <Textarea
                  error={errors['repairNotes']}
                  id="repair-notes"
                  label="Ghi chú sửa chữa"
                  hint={
                    draft.repairHistoryStatus === 'KNOWN'
                      ? 'Bắt buộc trước khi hoàn tất phiếu.'
                      : undefined
                  }
                  maxLength={2_000}
                  placeholder="Mô tả linh kiện hoặc lần sửa chữa đã biết"
                  rows={4}
                  value={draft.repairNotes}
                  onChange={(event) => {
                    updateField('repairNotes', event.target.value);
                  }}
                />
              </div>
            </div>
          </section>

          <section className={styles.checklistSection} aria-labelledby="inspection-checklist-title">
            <div className={styles.checklistHeading}>
              <div>
                <h2 id="inspection-checklist-title">18 hạng mục kỹ thuật</h2>
                <p>Có thể lưu phiếu chưa đủ mục; kết quả chưa đạt chuẩn cần ghi rõ tình trạng.</p>
              </div>
              <div className={styles.progress}>
                <Button
                  disabled={busyAction !== null}
                  onClick={selectAllPassed}
                  size="compact"
                  type="button"
                  variant="secondary"
                >
                  Chọn đạt tất cả
                </Button>
                <strong>
                  {String(progress.completed)}/{String(progress.total)} mục
                </strong>
                <div
                  aria-label={`${String(progress.completed)} trên ${String(progress.total)} hạng mục đã có kết quả`}
                  aria-valuemax={progress.total}
                  aria-valuemin={0}
                  aria-valuenow={progress.completed}
                  role="progressbar"
                >
                  <span
                    style={{
                      width: `${String((progress.completed / progress.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.groups}>
              {INSPECTION_CHECK_GROUPS.map((group) => (
                <section className={styles.checkGroup} key={group.id}>
                  <header>
                    <h3>{group.label}</h3>
                    <p>{group.description}</p>
                  </header>
                  <div className={styles.checkRows}>
                    {group.items.map((check, index) => {
                      const value = draft.checks[check.key];
                      const checkLabel = checklistLabels.get(check.key) ?? check.label;
                      const requiresNote =
                        value.status !== '' && inspectionCheckRequiresNote(value.status);
                      return (
                        <article className={styles.checkRow} key={check.key}>
                          <div className={styles.checkCopy}>
                            <span aria-hidden="true">
                              {String(
                                INSPECTION_CHECK_GROUPS.slice(
                                  0,
                                  INSPECTION_CHECK_GROUPS.indexOf(group),
                                ).reduce((total, item) => total + item.items.length, 0) +
                                  index +
                                  1,
                              )}
                            </span>
                            <div>
                              <h4>{checkLabel}</h4>
                              <p>{check.description}</p>
                            </div>
                          </div>
                          <div className={styles.checkFields}>
                            <Select
                              aria-label={`Kết quả của ${checkLabel}`}
                              error={errors[`checks.${check.key}.status`]}
                              id={`check-${check.key.toLowerCase()}-status`}
                              label="Kết quả"
                              value={value.status}
                              onChange={(event) => {
                                updateCheck(check.key, 'status', event.target.value);
                              }}
                            >
                              <option value="">Chọn kết quả</option>
                              {CHECK_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                            <Textarea
                              aria-label={`Ghi chú cho ${checkLabel}`}
                              error={errors[`checks.${check.key}.note`]}
                              id={`check-${check.key.toLowerCase()}-note`}
                              label="Ghi chú"
                              maxLength={500}
                              placeholder={
                                requiresNote
                                  ? 'Mô tả tình trạng quan sát được'
                                  : 'Thêm ghi chú nếu cần'
                              }
                              required={requiresNote}
                              rows={2}
                              value={value.note}
                              onChange={(event) => {
                                updateCheck(check.key, 'note', event.target.value);
                              }}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>

          {Object.keys(errors).length === 0 ? null : (
            <InlineAlert title="Còn thông tin cần kiểm tra" tone="warning">
              Hãy hoàn thiện các trường được đánh dấu trước khi tiếp tục.
            </InlineAlert>
          )}

          <div className={styles.actionBar}>
            <div>
              <strong>Lưu để tiếp tục sau hoặc hoàn tất phiếu.</strong>
              <span>Phiếu đã hoàn tất sẽ chuyển sang chế độ chỉ đọc.</span>
            </div>
            <div className={styles.actions}>
              <Button
                disabled={busyAction !== null}
                loading={busyAction === 'save'}
                loadingLabel="Đang lưu bản nháp"
                type="submit"
                variant="secondary"
              >
                Lưu bản nháp
              </Button>
              <Button
                disabled={busyAction !== null}
                id="inspection-complete-trigger"
                onClick={() => {
                  submit('complete');
                }}
              >
                Hoàn tất kiểm định
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export function InspectionCompletionReview({
  busy,
  checklistLabels,
  draft,
  onBack,
  onConfirm,
}: Readonly<{
  busy: boolean;
  checklistLabels: ReadonlyMap<string, string>;
  draft: InspectionEditorDraft;
  onBack: () => void;
  onConfirm: () => void;
}>) {
  const result = inspectionDraftResult(draft);
  const resultPresentation = inspectionResultPresentation(result);
  const progress = inspectionDraftProgress(draft);
  const attentionChecks = INSPECTION_CHECKS.filter((check) => {
    const status = draft.checks[check.key].status;
    return status !== 'PASS' && status !== 'NOT_APPLICABLE';
  });

  return (
    <section className={styles.reviewPanel} aria-labelledby="inspection-review-title">
      <div className={styles.reviewHeading}>
        <div>
          <p className={styles.eyebrow}>Bước xác nhận cuối</p>
          <h2 id="inspection-review-title" tabIndex={-1}>
            Xem lại tổng quan kiểm định
          </h2>
          <p>Kiểm tra lần cuối trước khi khóa phiếu và ghi nhận kết quả cho máy.</p>
        </div>
        <div className={styles.reviewResult}>
          <span>Kết quả dự kiến</span>
          <StatusChip label={resultPresentation.label} tone={resultPresentation.tone} />
          <small>
            {result === 'PASSED'
              ? 'Bạn sẽ chuyển sang bước Đưa máy lên bán.'
              : 'Máy sẽ quay lại bước Kiểm định để tiếp tục xử lý.'}
          </small>
        </div>
      </div>

      <dl className={styles.reviewSummary}>
        <SummaryItem
          label="Tình trạng pin"
          value={
            draft.batteryHealthPercent === '' ? 'Chưa ghi nhận' : `${draft.batteryHealthPercent}%`
          }
        />
        <SummaryItem
          label="Số chu kỳ sạc"
          value={draft.batteryCycleCount === '' ? 'Chưa ghi nhận' : draft.batteryCycleCount}
        />
        <SummaryItem
          label="Nguồn gốc pin"
          value={batteryReplacementLabel(draft.batteryReplacementStatus)}
        />
        <SummaryItem
          label="Ngoại hình"
          value={draft.conditionGrade === '' ? 'Chưa xếp loại' : `Loại ${draft.conditionGrade}`}
        />
        <SummaryItem
          label="Lịch sử sửa chữa"
          value={repairHistoryLabel(draft.repairHistoryStatus)}
        />
        <SummaryItem
          label="Hạng mục đã kiểm tra"
          value={`${String(progress.completed)}/${String(progress.total)} mục`}
        />
      </dl>

      {draft.cosmeticNotes === '' && draft.repairNotes === '' ? null : (
        <div className={styles.reviewNotes}>
          {draft.cosmeticNotes === '' ? null : (
            <div>
              <strong>Ghi chú ngoại hình</strong>
              <p>{draft.cosmeticNotes}</p>
            </div>
          )}
          {draft.repairNotes === '' ? null : (
            <div>
              <strong>Ghi chú sửa chữa</strong>
              <p>{draft.repairNotes}</p>
            </div>
          )}
        </div>
      )}

      <div className={styles.reviewChecks}>
        <div>
          <h3>Hạng mục cần lưu ý</h3>
          <p>
            {attentionChecks.length === 0
              ? 'Không có hạng mục lỗi hoặc cần theo dõi thêm.'
              : `${String(attentionChecks.length)} hạng mục không ở trạng thái đạt.`}
          </p>
        </div>
        {attentionChecks.length === 0 ? (
          <InlineAlert title="Đủ điều kiện chuyển bước" tone="success">
            Tất cả hạng mục đã đạt hoặc được xác nhận là không áp dụng.
          </InlineAlert>
        ) : (
          <div className={styles.reviewCheckList}>
            {attentionChecks.map((check) => {
              const value = draft.checks[check.key];
              const presentation =
                value.status === ''
                  ? { label: 'Chưa ghi nhận', tone: 'neutral' as const }
                  : inspectionCheckStatusPresentation(value.status);
              return (
                <article key={check.key}>
                  <div>
                    <strong>{checklistLabels.get(check.key) ?? check.label}</strong>
                    {value.note === '' ? null : <p>{value.note}</p>}
                  </div>
                  <StatusChip label={presentation.label} tone={presentation.tone} />
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.reviewActions}>
        <div>
          <strong>Thông tin sẽ chuyển sang chế độ chỉ đọc sau khi xác nhận.</strong>
          <span>Bạn vẫn có thể quay lại chỉnh sửa trước khi hoàn tất.</span>
        </div>
        <div>
          <Button disabled={busy} variant="secondary" onClick={onBack}>
            Quay lại chỉnh sửa
          </Button>
          <Button loading={busy} loadingLabel="Đang hoàn tất kiểm định" onClick={onConfirm}>
            Xác nhận hoàn tất
          </Button>
        </div>
      </div>
    </section>
  );
}

function CompletedInspection({
  checklistLabels,
  draft,
  inspection,
  returnToIntakeHref,
}: Readonly<{
  checklistLabels: ReadonlyMap<string, string>;
  draft: InspectionEditorDraft;
  inspection: InventoryInspectionDetail;
  returnToIntakeHref?: string;
}>) {
  return (
    <div className={styles.readonlyLayout}>
      <section className={styles.panel} aria-labelledby="completed-summary-title">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="completed-summary-title">Tổng hợp kiểm định</h2>
            <p>Phiếu đã hoàn tất và không thể chỉnh sửa.</p>
          </div>
        </div>
        <dl className={styles.readonlySummary}>
          <SummaryItem
            label="Dung lượng pin"
            value={
              inspection.batteryHealthPercent === null
                ? 'Chưa ghi nhận'
                : `${String(inspection.batteryHealthPercent)}%`
            }
          />
          <SummaryItem
            label="Số chu kỳ sạc"
            value={
              inspection.batteryCycleCount === null
                ? 'Chưa ghi nhận'
                : String(inspection.batteryCycleCount)
            }
          />
          <SummaryItem
            label="Nguồn gốc pin"
            value={batteryReplacementLabel(inspection.batteryReplacementStatus)}
          />
          <SummaryItem
            label="Ngoại hình"
            value={
              inspection.conditionGrade === null
                ? 'Chưa xếp loại'
                : `Loại ${inspection.conditionGrade}`
            }
          />
          <SummaryItem
            label="Lịch sử sửa chữa"
            value={repairHistoryLabel(inspection.repairHistoryStatus)}
          />
          <SummaryItem
            label="Hoàn tất lúc"
            value={
              inspection.inspectedAt === null
                ? 'Chưa ghi nhận'
                : formatInventoryDateTime(inspection.inspectedAt)
            }
          />
        </dl>
        {inspection.cosmeticNotes === null ? null : (
          <div className={styles.readonlyNote}>
            <strong>Ghi chú ngoại hình</strong>
            <p>{inspection.cosmeticNotes}</p>
          </div>
        )}
        {inspection.repairNotes === null ? null : (
          <div className={styles.readonlyNote}>
            <strong>Ghi chú sửa chữa</strong>
            <p>{inspection.repairNotes}</p>
          </div>
        )}
        {returnToIntakeHref === undefined ? null : (
          <div className={styles.completedActions}>
            <Link className="button primary" href={returnToIntakeHref}>
              Quay lại quy trình nhập máy
            </Link>
          </div>
        )}
      </section>

      <section className={styles.checklistSection} aria-labelledby="completed-checklist-title">
        <div className={styles.checklistHeading}>
          <div>
            <h2 id="completed-checklist-title">Kết quả 18 hạng mục</h2>
            <p>Thông tin được giữ nguyên theo thời điểm hoàn tất phiếu.</p>
          </div>
        </div>
        <div className={styles.groups}>
          {INSPECTION_CHECK_GROUPS.map((group) => (
            <section className={styles.checkGroup} key={group.id}>
              <header>
                <h3>{group.label}</h3>
                <p>{group.description}</p>
              </header>
              <div className={styles.readonlyChecks}>
                {group.items.map((check) => {
                  const value = draft.checks[check.key];
                  const presentation =
                    value.status === ''
                      ? { label: 'Chưa ghi nhận', tone: 'neutral' as const }
                      : inspectionCheckStatusPresentation(value.status);
                  return (
                    <article key={check.key}>
                      <div>
                        <h4>{checklistLabels.get(check.key) ?? check.label}</h4>
                        {value.note === '' ? null : <p>{value.note}</p>}
                      </div>
                      <StatusChip label={presentation.label} tone={presentation.tone} />
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function ContextItem({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SummaryItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function focusFirstInvalidField(errors: InspectionEditorFieldErrors) {
  const field = Object.keys(errors)[0];
  if (field === undefined || typeof document === 'undefined') return;
  const checkKey = field.startsWith('checks.') ? field.split('.')[1] : undefined;
  if (field.startsWith('checks.') && checkKey === undefined) return;
  const id =
    checkKey === undefined
      ? field.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
      : `check-${checkKey.toLowerCase()}-${field.endsWith('.note') ? 'note' : 'status'}`;
  globalThis.setTimeout(() => {
    document.getElementById(id)?.focus();
  }, 0);
}

function batteryReplacementLabel(status: InventoryInspectionDetail['batteryReplacementStatus']) {
  if (status === 'ORIGINAL') return 'Pin nguyên bản';
  if (status === 'REPLACED') return 'Đã thay pin';
  return 'Chưa xác định';
}

function repairHistoryLabel(status: InventoryInspectionDetail['repairHistoryStatus']) {
  if (status === 'NONE_KNOWN') return 'Chưa ghi nhận sửa chữa';
  if (status === 'KNOWN') return 'Có lịch sử sửa chữa';
  return 'Chưa xác định';
}

function formatInventoryDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa ghi nhận';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
