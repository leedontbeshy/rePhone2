'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useModalDialogLifecycle(open?: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const restoreFocus = useCallback(() => {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target === null) return;

    window.setTimeout(() => {
      if (target.isConnected) target.focus({ preventScroll: true });
    }, 0);
  }, []);

  const openDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  const closeDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog === null || !dialog.open) return;

    if (typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      restoreFocus();
    }
  }, [restoreFocus]);

  const restoreFocusAfterUnmount = useCallback(() => {
    window.setTimeout(() => {
      const dialog = dialogRef.current;
      // React Strict Mode replays effects while keeping the mounted dialog open.
      // Preserve the captured trigger until the dialog really closes or unmounts.
      if (dialog !== null && dialog.isConnected && dialog.open) return;
      restoreFocus();
    }, 0);
  }, [restoreFocus]);

  useEffect(() => {
    if (open === true) openDialog();
    if (open === false) closeDialog();
  }, [closeDialog, open, openDialog]);

  useEffect(() => restoreFocusAfterUnmount, [restoreFocusAfterUnmount]);

  return {
    closeDialog,
    dialogRef,
    onDialogClose: restoreFocus,
    openDialog,
  } as const;
}
