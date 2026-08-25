import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from './class-names';
import { formatVnd } from './money';
import type { VndAmount } from './money';
import styles from './primitives.module.css';
import type { FeedbackTone } from './feedback';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: FeedbackTone;
}

export function Badge({ children, className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span {...props} className={classNames(styles.badge, styles[tone], className)}>
      {children}
    </span>
  );
}

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: ReactNode;
  label: string;
  tone?: FeedbackTone;
}

export function StatusChip({
  className,
  icon,
  label,
  tone = 'neutral',
  ...props
}: StatusChipProps) {
  return (
    <span {...props} className={classNames(styles.statusChip, styles[tone], className)}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </span>
  );
}

export interface PriceProps extends HTMLAttributes<HTMLSpanElement> {
  amount: VndAmount;
}

export function Price({ amount, className, ...props }: PriceProps) {
  return (
    <span {...props} className={classNames(styles.price, className)}>
      {formatVnd(amount)}
    </span>
  );
}

export type DividerProps = HTMLAttributes<HTMLHRElement>;

export function Divider({ className, ...props }: DividerProps) {
  return <hr {...props} className={classNames(styles.divider, className)} />;
}
