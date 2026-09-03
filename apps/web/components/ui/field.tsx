import type {
  FieldsetHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef } from 'react';
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

function mergeDescribedBy(...values: Array<string | undefined>) {
  return (
    values.filter((value): value is string => value !== undefined && value.length > 0).join(' ') ||
    undefined
  );
}

export interface FieldProps {
  children: ReactNode;
  className?: string | undefined;
  error?: ReactNode | undefined;
  errorId?: string | undefined;
  errorRole?: 'alert' | 'status' | undefined;
  hint?: ReactNode | undefined;
  hintId?: string | undefined;
  id: string;
  label: ReactNode;
  required?: boolean | undefined;
}

export function Field({
  children,
  className,
  error,
  errorId,
  errorRole,
  hint,
  hintId,
  id,
  label,
  required,
}: FieldProps) {
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
        <p className={styles.error} id={errorId} role={errorRole}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
  endAction?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  id: string;
  label: ReactNode;
}

export function Input({
  className,
  containerClassName,
  endAction,
  error,
  hint,
  id,
  label,
  required,
  ...props
}: InputProps) {
  const messages = fieldMessages(id, hint, error);
  const callerDescribedBy = props['aria-describedby'];
  const control = (
    <input
      {...props}
      aria-describedby={mergeDescribedBy(callerDescribedBy, messages.describedBy)}
      aria-invalid={error ? true : undefined}
      className={classNames(styles.control, className)}
      id={id}
      required={required}
    />
  );

  return (
    <Field
      className={containerClassName}
      error={error}
      errorId={messages.errorId}
      hint={hint}
      hintId={messages.hintId}
      id={id}
      label={label}
      required={required}
    >
      {endAction ? (
        <div className={styles.controlFrame}>
          {control}
          <span className={styles.controlEndAction}>{endAction}</span>
        </div>
      ) : (
        control
      )}
    </Field>
  );
}

export interface FilePickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value'
> {
  buttonLabel?: ReactNode;
  containerClassName?: string;
  emptyLabel?: ReactNode;
  error?: ReactNode;
  errorRole?: 'alert' | 'status';
  hint?: ReactNode;
  id: string;
  label: ReactNode;
  selectedFileName?: string | null;
}

export const FilePicker = forwardRef<HTMLInputElement, FilePickerProps>(function FilePicker(
  {
    buttonLabel = 'Chọn tệp',
    className,
    containerClassName,
    disabled,
    emptyLabel = 'Chưa chọn tệp',
    error,
    errorRole,
    hint,
    id,
    label,
    required,
    selectedFileName,
    ...props
  },
  ref,
) {
  const messages = fieldMessages(id, hint, error);
  const callerDescribedBy = props['aria-describedby'];
  const hasSelection = Boolean(selectedFileName?.trim());

  return (
    <Field
      className={containerClassName}
      error={error}
      errorId={messages.errorId}
      errorRole={errorRole}
      hint={hint}
      hintId={messages.hintId}
      id={id}
      label={label}
      required={required}
    >
      <div
        className={classNames(styles.filePicker, className)}
        data-disabled={disabled ? 'true' : undefined}
        data-invalid={error ? 'true' : undefined}
      >
        <input
          {...props}
          ref={ref}
          aria-describedby={mergeDescribedBy(callerDescribedBy, messages.describedBy)}
          aria-invalid={error ? true : undefined}
          className={styles.fileInput}
          data-rp-file-picker-control="true"
          disabled={disabled}
          id={id}
          required={required}
          type="file"
        />
        <span aria-hidden="true" className={styles.filePickerAction}>
          {buttonLabel}
        </span>
        <span
          aria-atomic="true"
          aria-live="polite"
          className={styles.filePickerName}
          data-empty={hasSelection ? undefined : 'true'}
          title={typeof selectedFileName === 'string' ? selectedFileName : undefined}
        >
          {hasSelection ? selectedFileName : emptyLabel}
        </span>
      </div>
    </Field>
  );
});

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
  const callerDescribedBy = props['aria-describedby'];

  return (
    <Field
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
        aria-describedby={mergeDescribedBy(callerDescribedBy, messages.describedBy)}
        aria-invalid={error ? true : undefined}
        className={classNames(styles.control, styles.textarea, className)}
        id={id}
        required={required}
      />
    </Field>
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
  const callerDescribedBy = props['aria-describedby'];

  return (
    <Field
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
        aria-describedby={mergeDescribedBy(callerDescribedBy, messages.describedBy)}
        aria-invalid={error ? true : undefined}
        className={classNames(styles.control, className)}
        id={id}
        required={required}
      >
        {children}
      </select>
    </Field>
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
  const callerDescribedBy = props['aria-describedby'];

  return (
    <div>
      <label className={styles.checkboxField}>
        <input
          {...props}
          aria-describedby={mergeDescribedBy(callerDescribedBy, messages.describedBy)}
          aria-invalid={error ? true : undefined}
          className={classNames(styles.checkbox, className)}
          id={id}
          type="checkbox"
        />
        <span className={styles.checkboxCopy}>
          <span className={styles.label}>{label}</span>
          {props.required ? <span className={styles.visuallyHidden}> (bắt buộc)</span> : null}
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
  const callerDescribedBy = props['aria-describedby'];

  return (
    <label className={styles.radioCard}>
      <input
        {...props}
        aria-describedby={mergeDescribedBy(callerDescribedBy, descriptionId)}
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

export interface RadioGroupProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  error?: ReactNode;
  hint?: ReactNode;
  legend: ReactNode;
  required?: boolean;
}

export function RadioGroup({
  children,
  className,
  error,
  hint,
  id,
  legend,
  required,
  ...props
}: RadioGroupProps) {
  const groupId = id ?? 'radio-group';
  const messages = fieldMessages(groupId, hint, error);
  const callerDescribedBy = props['aria-describedby'];

  return (
    <fieldset
      {...props}
      aria-describedby={mergeDescribedBy(callerDescribedBy, messages.describedBy)}
      aria-invalid={error ? true : undefined}
      className={classNames(styles.fieldGroup, className)}
      id={id}
    >
      <legend className={styles.fieldGroupLegend}>
        {legend}
        {required ? (
          <>
            <span aria-hidden="true" className={styles.requiredMark}>
              {' *'}
            </span>
            <span className={styles.visuallyHidden}> (bắt buộc)</span>
          </>
        ) : null}
      </legend>
      <div className={styles.fieldGroupContent}>{children}</div>
      {hint ? (
        <p className={styles.hint} id={messages.hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={messages.errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
