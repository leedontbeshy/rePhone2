import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { classNames } from './class-names';
import styles from './primitives.module.css';

interface FieldMessages {
  describedBy?: string | undefined;
  errorId?: string | undefined;
  hintId?: string | undefined;
}

function fieldMessages(id: string, hint?: ReactNode, error?: ReactNode): FieldMessages {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return {
    describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined,
    errorId,
    hintId,
  };
}

interface FieldFrameProps {
  children: ReactNode;
  className?: string | undefined;
  error?: ReactNode | undefined;
  errorId?: string | undefined;
  hint?: ReactNode | undefined;
  hintId?: string | undefined;
  id: string;
  label: ReactNode;
  required?: boolean | undefined;
}

function FieldFrame({
  children,
  className,
  error,
  errorId,
  hint,
  hintId,
  id,
  label,
  required,
}: FieldFrameProps) {
  return (
    <div className={classNames(styles.field, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className={styles.requiredMark}>
              {' *'}
            </span>
            <span className={styles.visuallyHidden}> (bắt buộc)</span>
          </>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
  error?: ReactNode;
  hint?: ReactNode;
  id: string;
  label: ReactNode;
}

export function Input({
  className,
  containerClassName,
  error,
  hint,
  id,
  label,
  required,
  ...props
}: InputProps) {
  const messages = fieldMessages(id, hint, error);

  return (
    <FieldFrame
      className={containerClassName}
      error={error}
      errorId={messages.errorId}
      hint={hint}
      hintId={messages.hintId}
      id={id}
      label={label}
      required={required}
    >
      <input
        {...props}
        aria-describedby={messages.describedBy}
        aria-invalid={error ? true : undefined}
        className={classNames(styles.control, className)}
        id={id}
        required={required}
      />
    </FieldFrame>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  containerClassName?: string;
  error?: ReactNode;
  hint?: ReactNode;
  id: string;
  label: ReactNode;
}

export function Textarea({
  className,
  containerClassName,
  error,
  hint,
  id,
  label,
  required,
  ...props
}: TextareaProps) {
  const messages = fieldMessages(id, hint, error);

  return (
    <FieldFrame
      className={containerClassName}
      error={error}
      errorId={messages.errorId}
      hint={hint}
      hintId={messages.hintId}
      id={id}
      label={label}
      required={required}
    >
      <textarea
        {...props}
        aria-describedby={messages.describedBy}
        aria-invalid={error ? true : undefined}
        className={classNames(styles.control, styles.textarea, className)}
        id={id}
        required={required}
      />
    </FieldFrame>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
  error?: ReactNode;
  hint?: ReactNode;
  id: string;
  label: ReactNode;
}

export function Select({
  children,
  className,
  containerClassName,
  error,
  hint,
  id,
  label,
  required,
  ...props
}: SelectProps) {
  const messages = fieldMessages(id, hint, error);

  return (
    <FieldFrame
      className={containerClassName}
      error={error}
      errorId={messages.errorId}
      hint={hint}
      hintId={messages.hintId}
      id={id}
      label={label}
      required={required}
    >
      <select
        {...props}
        aria-describedby={messages.describedBy}
        aria-invalid={error ? true : undefined}
        className={classNames(styles.control, className)}
        id={id}
        required={required}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  description?: ReactNode;
  error?: ReactNode;
  id: string;
  label: ReactNode;
}

export function Checkbox({ className, description, error, id, label, ...props }: CheckboxProps) {
  const messages = fieldMessages(id, description, error);

  return (
    <div>
      <label className={styles.checkboxField}>
        <input
          {...props}
          aria-describedby={messages.describedBy}
          aria-invalid={error ? true : undefined}
          className={classNames(styles.checkbox, className)}
          id={id}
          type="checkbox"
        />
        <span className={styles.checkboxCopy}>
          <span className={styles.label}>{label}</span>
          {description ? (
            <span className={styles.hint} id={messages.hintId}>
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p className={styles.error} id={messages.errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface RadioCardProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  description?: ReactNode;
  id: string;
  label: ReactNode;
}

export function RadioCard({ className, description, id, label, ...props }: RadioCardProps) {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <label className={styles.radioCard}>
      <input
        {...props}
        aria-describedby={descriptionId}
        className={classNames(styles.radio, className)}
        id={id}
        type="radio"
      />
      <span className={styles.radioCopy}>
        <span className={styles.label}>{label}</span>
        {description ? (
          <span className={styles.hint} id={descriptionId}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
