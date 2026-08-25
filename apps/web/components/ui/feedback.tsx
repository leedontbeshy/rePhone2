import type { CSSProperties, ReactNode } from 'react';
import { classNames } from './class-names';
import styles from './primitives.module.css';

export type FeedbackTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface InlineAlertProps {
  children: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
  title?: ReactNode;
  tone?: FeedbackTone;
}

export function InlineAlert({ children, className, role, title, tone = 'info' }: InlineAlertProps) {
  return (
    <div
      className={classNames(styles.alert, styles[tone], className)}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
    >
      {title ? <strong className={styles.alertTitle}>{title}</strong> : null}
      <div className={styles.alertBody}>{children}</div>
    </div>
  );
}

export interface ErrorSummaryItem {
  href?: `#${string}`;
  message: string;
}

export interface ErrorSummaryProps {
  className?: string;
  errors: ErrorSummaryItem[];
  id?: string;
  title?: string;
}

export function ErrorSummary({
  className,
  errors,
  id,
  title = 'Kiểm tra lại thông tin',
}: ErrorSummaryProps) {
  if (errors.length === 0) return null;

  return (
    <div
      className={classNames(styles.alert, styles.danger, styles.errorSummary, className)}
      id={id}
      role="alert"
      tabIndex={-1}
    >
      <strong className={styles.alertTitle}>{title}</strong>
      <ul className={styles.errorSummaryList}>
        {errors.map((error, index) => (
          <li key={`${error.href ?? 'message'}-${String(index)}`}>
            {error.href ? <a href={error.href}>{error.message}</a> : error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SkeletonProps {
  className?: string;
  height?: CSSProperties['height'];
  width?: CSSProperties['width'];
}

export function Skeleton({ className, height, width }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={classNames(styles.skeleton, className)}
      style={{ height, width }}
    />
  );
}
