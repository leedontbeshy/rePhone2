'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui';
import styles from './confirmation-dialog.module.css';

export interface ConfirmationDialogProps {
  readonly cancelLabel?: string | undefined;
  readonly confirmLabel: string;
  readonly description: string;
  readonly error?: string | null | undefined;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly open: boolean;
  readonly pending?: boolean | undefined;
  readonly reason?: string | undefined;
  readonly reasonLabel?: string | undefined;
  readonly onReasonChange?: ((value: string) => void) | undefined;
  readonly title: string;
}

export function ConfirmationDialog({
  cancelLabel = 'Quay lại',
  confirmLabel,
  description,
  error,
  onClose,
  onConfirm,
  open,
  pending = false,
  reason,
  reasonLabel,
  onReasonChange,
  title,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      return;
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (pending) return;
    dialogRef.current?.close();
  };

  return (
    <dialog
      className={styles.dialog}
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        if (open && !pending) onClose();
        window.setTimeout(() => previousFocusRef.current?.focus(), 0);
      }}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        {reasonLabel && onReasonChange ? (
          <label className={styles.reasonField}>
            <span>{reasonLabel}</span>
            <textarea
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              disabled={pending}
              maxLength={500}
              minLength={5}
              required
              rows={4}
              value={reason ?? ''}
              onChange={(event) => {
                onReasonChange(event.target.value);
              }}
            />
            <small>{(reason ?? '').length}/500 ký tự</small>
          </label>
        ) : null}
        {error ? (
          <p className={styles.error} id={errorId} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button disabled={pending} onClick={close} variant="secondary">
            {cancelLabel}
          </Button>
          <Button loading={pending} loadingLabel="Đang xử lý" type="submit" variant="destructive">
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
