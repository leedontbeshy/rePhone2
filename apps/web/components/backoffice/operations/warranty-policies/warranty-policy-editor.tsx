'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { BackofficeActionDialog } from '@/components/backoffice/backoffice-action-dialog';
import { OperationsActionRail } from '../operations-primitives';
import {
  Button,
  ErrorSummary,
  InlineAlert,
  Input,
  Textarea,
  type ErrorSummaryItem,
} from '@/components/ui';
import {
  activateWarrantyPolicy,
  archiveWarrantyPolicy,
  createWarrantyPolicy,
  deactivateWarrantyPolicy,
  updateWarrantyPolicy,
  type BackofficeWarrantyPolicyDetail,
  type WarrantyApiClient,
  type WarrantyPolicy,
} from '@/lib/warranty-api';
import {
  formatWarrantyPolicyDate,
  validateWarrantyPolicyDraft,
  warrantyPolicyDraftFrom,
  warrantyPolicyStatusPresentation,
  type WarrantyPolicyDraft,
  type WarrantyPolicyDraftErrors,
} from './warranty-policy-presenter';
import styles from './warranty-policies.module.css';

export interface WarrantyPolicyEditorProps {
  readonly client: WarrantyApiClient;
  readonly notice: string | null;
  readonly onNoticeChange: (notice: string | null) => void;
  readonly onReload: (policyId: string) => Promise<BackofficeWarrantyPolicyDetail>;
  readonly onClose: () => void;
  readonly policy: BackofficeWarrantyPolicyDetail | null;
}

export function WarrantyPolicyEditor({
  client,
  notice,
  onNoticeChange,
  onReload,
  onClose,
  policy,
}: WarrantyPolicyEditorProps) {
  const creating = policy === null;
  const [draft, setDraft] = useState(() => warrantyPolicyDraftFrom(policy));
  const [errors, setErrors] = useState<WarrantyPolicyDraftErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshRequiredId, setRefreshRequiredId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'archive' | 'deactivate' | null>(null);
  const [reason, setReason] = useState('');
  const mutationRef = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setErrors({});
    setServerError(null);
    setRefreshRequiredId(null);
    setDialog(null);
    setReason('');
  }, [policy?.id]);

  useEffect(() => {
    setDraft(warrantyPolicyDraftFrom(policy));
  }, [policy]);

  useEffect(() => {
    if (Object.keys(errors).length > 0) summaryRef.current?.focus();
  }, [errors]);

  const actions = policy?.availableActions ?? [];
  const presentation = policy === null ? null : warrantyPolicyStatusPresentation(policy);
  const policyId = policy?.id;

  async function run(command: () => Promise<WarrantyPolicy>, success: string) {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    setServerError(null);
    onNoticeChange(null);
    try {
      const outcome = await reconcileWarrantyPolicyMutation({
        command,
        ...(policyId === undefined ? {} : { currentPolicyId: policyId }),
        onReload,
        success,
      });
      onNoticeChange(outcome.notice);
      setServerError(outcome.serverError);
      setRefreshRequiredId(outcome.refreshRequiredId);
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  }

  async function retryReload() {
    if (refreshRequiredId === null || mutationRef.current) return;
    mutationRef.current = true;
    setBusy(true);
    setServerError(null);
    try {
      await onReload(refreshRequiredId);
      setRefreshRequiredId(null);
      onNoticeChange('Đã tải lại chi tiết mới nhất.');
    } catch (caught) {
      setServerError(messageFrom(caught, 'Chưa thể tải lại chi tiết mới nhất.'));
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateWarrantyPolicyDraft(draft, creating);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const input = {
      defaultDays: Number(draft.defaultDays),
      name: draft.name.trim(),
      terms: draft.terms.trim(),
    };
    if (policy === null) {
      void run(
        () => createWarrantyPolicy(client, { ...input, code: draft.code.trim().toUpperCase() }),
        'Đã tạo chính sách. Chính sách vẫn chưa được áp dụng cho đến khi kích hoạt.',
      );
      return;
    }
    void run(() => updateWarrantyPolicy(client, policy.id, input), 'Đã lưu thay đổi chính sách.');
  }

  function update<Key extends keyof WarrantyPolicyDraft>(
    field: Key,
    value: WarrantyPolicyDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (current[field] === undefined) return current;
      return {
        ...(field === 'code' || current.code === undefined ? {} : { code: current.code }),
        ...(field === 'defaultDays' || current.defaultDays === undefined
          ? {}
          : { defaultDays: current.defaultDays }),
        ...(field === 'name' || current.name === undefined ? {} : { name: current.name }),
        ...(field === 'terms' || current.terms === undefined ? {} : { terms: current.terms }),
      };
    });
  }

  if (refreshRequiredId !== null) {
    return (
      <OperationsActionRail
        description="Thao tác đã kết thúc nhưng trạng thái mới nhất chưa được tải về. Các nút thay đổi tạm thời được khóa để tránh lặp thao tác."
        primary={
          <Button loading={busy} loadingLabel="Đang tải lại" onClick={() => void retryReload()}>
            Tải lại chi tiết
          </Button>
        }
        supporting={
          <Button disabled={busy} variant="secondary" onClick={onClose}>
            Đóng chi tiết
          </Button>
        }
        title="Cần tải lại chính sách"
      >
        <InlineAlert title="Chưa xác nhận được trạng thái mới nhất" tone="warning">
          {serverError ?? 'Vui lòng tải lại chi tiết trước khi thực hiện thao tác khác.'}
        </InlineAlert>
      </OperationsActionRail>
    );
  }

  if (policy !== null && !actions.includes('EDIT')) {
    return (
      <OperationsActionRail
        description={
          policy.isArchived
            ? 'Chính sách đã lưu trữ và được giữ ở chế độ chỉ đọc.'
            : 'Bạn có thể xem nội dung nhưng chỉ quản trị viên mới được thay đổi chính sách.'
        }
        supporting={
          <Button variant="secondary" onClick={onClose}>
            Đóng chi tiết
          </Button>
        }
        title="Chi tiết chính sách"
      >
        <ReadonlyPolicy policy={policy} />
      </OperationsActionRail>
    );
  }

  return (
    <>
      <OperationsActionRail
        description={
          creating
            ? 'Chính sách mới luôn ở trạng thái chưa áp dụng.'
            : `Trạng thái: ${presentation?.label ?? 'Chưa xác định'}.`
        }
        supporting={
          <div className={styles.lifecycleActions}>
            {policyId !== undefined && actions.includes('ACTIVATE') ? (
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => {
                  void run(
                    () => activateWarrantyPolicy(client, policyId),
                    'Đã kích hoạt chính sách.',
                  );
                }}
              >
                Bắt đầu áp dụng
              </Button>
            ) : null}
            {policyId !== undefined && actions.includes('DEACTIVATE') ? (
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => {
                  setReason('');
                  setDialog('deactivate');
                }}
              >
                Ngừng áp dụng
              </Button>
            ) : null}
            {policyId !== undefined && actions.includes('ARCHIVE') ? (
              <Button
                disabled={busy}
                variant="destructive"
                onClick={() => {
                  setReason('');
                  setDialog('archive');
                }}
              >
                Lưu trữ vĩnh viễn
              </Button>
            ) : null}
            <Button disabled={busy} variant="ghost" onClick={onClose}>
              Đóng
            </Button>
          </div>
        }
        title={creating ? 'Thêm chính sách' : 'Chỉnh sửa chính sách'}
      >
        {policy?.archiveBlockedReason === 'ACTIVE_CATALOG_REFERENCES' ? (
          <InlineAlert title="Chưa thể lưu trữ" tone="warning">
            Chính sách vẫn đang được sản phẩm hoặc phiên bản đang bán sử dụng.
          </InlineAlert>
        ) : null}
        <form noValidate className={styles.editor} onSubmit={submit}>
          <ErrorSummary errors={policyErrorSummary(errors)} ref={summaryRef} />
          {serverError === null ? null : (
            <InlineAlert title="Chưa thể cập nhật chính sách" tone="danger">
              {serverError}
            </InlineAlert>
          )}
          {notice === null ? null : (
            <InlineAlert title="Đã cập nhật" tone="success">
              {notice}
            </InlineAlert>
          )}
          <Input
            disabled={!creating || busy}
            error={errors.code}
            hint={
              creating ? 'Dùng để nhận biết chính sách; không đổi được sau khi tạo.' : undefined
            }
            id="warranty-policy-code"
            label="Mã chính sách"
            maxLength={64}
            required={creating}
            value={draft.code}
            onChange={(event) => {
              update('code', event.target.value.toUpperCase());
            }}
          />
          <Input
            disabled={busy}
            error={errors.name}
            id="warranty-policy-name"
            label="Tên chính sách"
            maxLength={255}
            required
            value={draft.name}
            onChange={(event) => {
              update('name', event.target.value);
            }}
          />
          <Input
            disabled={busy}
            error={errors.defaultDays}
            id="warranty-policy-days"
            label="Thời hạn mặc định (ngày)"
            max={3650}
            min={0}
            required
            type="number"
            value={draft.defaultDays}
            onChange={(event) => {
              update('defaultDays', event.target.value);
            }}
          />
          <Textarea
            disabled={busy}
            error={errors.terms}
            hint="Nội dung này được lưu theo từng bảo hành khi bán hàng."
            id="warranty-policy-terms"
            label="Điều khoản"
            maxLength={10_000}
            required
            rows={9}
            value={draft.terms}
            onChange={(event) => {
              update('terms', event.target.value);
            }}
          />
          <div className={styles.editorActions}>
            <Button loading={busy} loadingLabel="Đang lưu" type="submit">
              {creating ? 'Tạo chính sách' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </OperationsActionRail>

      <BackofficeActionDialog
        confirmLabel={dialog === 'archive' ? 'Lưu trữ vĩnh viễn' : 'Ngừng áp dụng'}
        description={
          dialog === 'archive'
            ? 'Chính sách đã lưu trữ không thể khôi phục. Hệ thống sẽ chặn nếu chính sách còn được danh mục sử dụng.'
            : 'Chính sách sẽ không còn được chọn cho sản phẩm mới; bảo hành đã cấp vẫn giữ nguyên.'
        }
        destructive={dialog === 'archive'}
        open={dialog !== null}
        pending={busy}
        reason={{
          hint: 'Nhập từ 5 đến 500 ký tự.',
          label: dialog === 'archive' ? 'Lý do lưu trữ' : 'Lý do ngừng áp dụng',
          maxLength: 500,
          minLength: 5,
          onChange: setReason,
          value: reason,
        }}
        title={dialog === 'archive' ? 'Lưu trữ chính sách?' : 'Ngừng áp dụng chính sách?'}
        onCancel={() => {
          setDialog(null);
        }}
        onConfirm={(value) => {
          if (policy === null || value === undefined || dialog === null) return;
          const selected = dialog;
          setDialog(null);
          void run(
            () =>
              selected === 'archive'
                ? archiveWarrantyPolicy(client, policy.id, value)
                : deactivateWarrantyPolicy(client, policy.id, value),
            selected === 'archive' ? 'Đã lưu trữ chính sách.' : 'Đã ngừng áp dụng chính sách.',
          );
        }}
      />
    </>
  );
}

export interface WarrantyPolicyMutationOutcome {
  readonly notice: string | null;
  readonly refreshRequiredId: string | null;
  readonly serverError: string | null;
}

export async function reconcileWarrantyPolicyMutation({
  command,
  currentPolicyId,
  onReload,
  success,
}: Readonly<{
  command: () => Promise<WarrantyPolicy>;
  currentPolicyId?: string;
  onReload: (policyId: string) => Promise<BackofficeWarrantyPolicyDetail>;
  success: string;
}>): Promise<WarrantyPolicyMutationOutcome> {
  let changed: WarrantyPolicy;
  try {
    changed = await command();
  } catch (caught) {
    const commandError = messageFrom(caught, 'Chưa thể cập nhật chính sách.');
    if (currentPolicyId === undefined) {
      return { notice: null, refreshRequiredId: null, serverError: commandError };
    }
    try {
      await onReload(currentPolicyId);
      return { notice: null, refreshRequiredId: null, serverError: commandError };
    } catch {
      return {
        notice: null,
        refreshRequiredId: currentPolicyId,
        serverError: `${commandError} Chưa thể tải lại trạng thái mới nhất.`,
      };
    }
  }

  try {
    await onReload(changed.id);
    return { notice: success, refreshRequiredId: null, serverError: null };
  } catch {
    return {
      notice: null,
      refreshRequiredId: changed.id,
      serverError: 'Thay đổi đã được ghi nhận nhưng chưa tải lại được trạng thái mới nhất.',
    };
  }
}

export function ReadonlyPolicy({ policy }: Readonly<{ policy: WarrantyPolicy }>) {
  const presentation = warrantyPolicyStatusPresentation(policy);
  return (
    <div className={styles.readonlyPolicy}>
      <h3>{policy.name}</h3>
      <p>{presentation.label}</p>
      <dl className={styles.readonlyGrid}>
        <div>
          <dt>Mã chính sách</dt>
          <dd>{policy.code}</dd>
        </div>
        <div>
          <dt>Thời hạn mặc định</dt>
          <dd>{String(policy.defaultDays)} ngày</dd>
        </div>
        <div>
          <dt>Cập nhật gần nhất</dt>
          <dd>{formatWarrantyPolicyDate(policy.updatedAt)}</dd>
        </div>
        <div>
          <dt>Điều khoản</dt>
          <dd className={styles.termsPreview}>{policy.terms}</dd>
        </div>
      </dl>
    </div>
  );
}

function messageFrom(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}

function policyErrorSummary(errors: WarrantyPolicyDraftErrors): ErrorSummaryItem[] {
  const items: ErrorSummaryItem[] = [];
  if (errors.code !== undefined) {
    items.push({ href: '#warranty-policy-code', message: errors.code });
  }
  if (errors.name !== undefined) {
    items.push({ href: '#warranty-policy-name', message: errors.name });
  }
  if (errors.defaultDays !== undefined) {
    items.push({ href: '#warranty-policy-days', message: errors.defaultDays });
  }
  if (errors.terms !== undefined) {
    items.push({ href: '#warranty-policy-terms', message: errors.terms });
  }
  return items;
}
