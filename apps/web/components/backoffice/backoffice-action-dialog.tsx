'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Button, InlineAlert, Textarea } from '@/components/ui';
import styles from './catalog-voucher.module.css';

export interface BackofficeActionDialogReason {
  readonly hint?: ReactNode;
  readonly label?: string;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

export interface BackofficeActionDialogProps {
  readonly cancelLabel?: string;
  readonly confirmLabel: string;
  readonly description: ReactNode;
  readonly destructive?: boolean;
  readonly error?: ReactNode;
  readonly onCancel: () => void;
  readonly onConfirm: (reason?: string) => void;
  readonly open: boolean;
  readonly pending?: boolean;
  readonly reason?: BackofficeActionDialogReason;
  readonly title: string;
}

export function BackofficeActionDialog({
  cancelLabel = 'Hủy',
  confirmLabel,
  description,
  destructive = false,
  error,
  onCancel,
  onConfirm,
  open,
  pending = false,
  reason,
  title,
}: BackofficeActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const [attempted, setAttempted] = useState(false);
  const reasonError = reason === undefined ? undefined : validateReason(reason.value, reason);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    if (!open) setAttempted(false);
  }, [open]);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (reasonError !== undefined || pending) return;
    onConfirm(reason?.value.trim());
  }

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={styles.actionDialog}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <form method="dialog" onSubmit={submit}>
        <div className={styles.dialogHeading}>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        {reason ? (
          <Textarea
            error={attempted ? reasonError : undefined}
            hint={reason.hint ?? 'Nhập từ 5 đến 500 ký tự.'}
            id={reasonId}
            label={reason.label ?? 'Lý do'}
            maxLength={reason.maxLength ?? 500}
            minLength={reason.minLength ?? 5}
            required
            value={reason.value}
            onChange={(event) => {
              reason.onChange(event.target.value);
            }}
          />
        ) : null}
        {error ? (
          <InlineAlert title="Chưa thể hoàn tất thao tác" tone="danger">
            {error}
          </InlineAlert>
        ) : null}
        <div className={styles.dialogActions}>
          <Button autoFocus disabled={pending} type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            loading={pending}
            loadingLabel="Đang xử lý"
            type="submit"
            variant={destructive ? 'destructive' : 'primary'}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function validateBackofficeActionReason(
  value: string,
  constraints: Pick<BackofficeActionDialogReason, 'minLength' | 'maxLength'> = {},
): string | undefined {
  const normalized = value.trim();
  const minLength = constraints.minLength ?? 5;
  const maxLength = constraints.maxLength ?? 500;
  if (normalized.length < minLength) return `Lý do cần ít nhất ${String(minLength)} ký tự.`;
  if (normalized.length > maxLength) return `Lý do không được quá ${String(maxLength)} ký tự.`;
  return undefined;
}

function validateReason(value: string, reason: BackofficeActionDialogReason): string | undefined {
  return validateBackofficeActionReason(value, reason);
}
