import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';
import { classNames } from './class-names';
import styles from './primitives.module.css';

export type FeedbackTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface InlineAlertProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'role' | 'title'
> {
  children: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
  title?: ReactNode;
  tone?: FeedbackTone;
}

export const InlineAlert = forwardRef<HTMLDivElement, InlineAlertProps>(function InlineAlert(
  { children, className, role, title, tone = 'info', ...props },
  ref,
) {
  return (
    <div
      {...props}
      className={classNames(styles.alert, styles[tone], className)}
      ref={ref}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
    >
      {title ? <strong className={styles.alertTitle}>{title}</strong> : null}
      <div className={styles.alertBody}>{children}</div>
    </div>
  );
});

export interface ErrorSummaryItem {
  href?: `#${string}`;
  message: string;
}

export interface ErrorSummaryProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'title'
> {
  errors: ErrorSummaryItem[];
  id?: string;
  title?: string;
}

export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(function ErrorSummary(
  { className, errors, id, tabIndex = -1, title = 'Kiểm tra lại thông tin', ...props },
  ref,
) {
  if (errors.length === 0) return null;

  return (
    <div
      {...props}
      className={classNames(styles.alert, styles.danger, styles.errorSummary, className)}
      id={id}
      ref={ref}
      role="alert"
      tabIndex={tabIndex}
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
});

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
