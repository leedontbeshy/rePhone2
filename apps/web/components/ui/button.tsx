import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { classNames } from './class-names';
import styles from './primitives.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'default' | 'compact' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  iconLeading?: ReactNode;
  iconTrailing?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled,
  iconLeading,
  iconTrailing,
  loading = false,
  loadingLabel = 'Đang xử lý',
  size = 'default',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      aria-label={loading ? loadingLabel : props['aria-label']}
      className={classNames(
        styles.button,
        styles[variant],
        size === 'compact' && styles.compact,
        size === 'icon' && styles.iconOnly,
        className,
      )}
      disabled={disabled || loading}
      type={type}
    >
      <span
        aria-hidden={size === 'icon' ? true : undefined}
        className={classNames(styles.buttonContent, loading && styles.buttonContentHidden)}
      >
        {iconLeading}
        {children}
        {iconTrailing}
      </span>
      {loading ? <span aria-hidden="true" className={styles.spinner} /> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'aria-label' | 'children' | 'size'> {
  'aria-label': string;
  children: ReactNode;
}

export function IconButton(props: IconButtonProps) {
  return <Button {...props} size="icon" />;
}
