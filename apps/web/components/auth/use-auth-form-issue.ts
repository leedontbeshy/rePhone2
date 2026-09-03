'use client';

import { useCallback, useRef, useState } from 'react';
import type { ErrorSummaryProps } from '@/components/ui';
import { EMPTY_AUTH_ISSUE, type AuthFormIssue, withoutAuthFieldIssue } from './auth-errors';
import type { AuthFieldName } from './auth-validation';

export function useAuthFormIssue() {
  const [issue, setIssue] = useState<AuthFormIssue>(EMPTY_AUTH_ISSUE);
  const summaryRef = useRef<HTMLDivElement>(null);

  const clearIssue = useCallback(() => {
    setIssue(EMPTY_AUTH_ISSUE);
  }, []);

  const clearFieldIssue = useCallback((field: AuthFieldName) => {
    setIssue((current) => withoutAuthFieldIssue(current, field));
  }, []);

  const showIssue = useCallback((nextIssue: AuthFormIssue) => {
    setIssue(nextIssue);
    window.requestAnimationFrame(() => summaryRef.current?.focus());
  }, []);

  return { clearFieldIssue, clearIssue, issue, setIssue, showIssue, summaryRef };
}

export type AuthErrorSummaryProps = Pick<ErrorSummaryProps, 'errors'>;
