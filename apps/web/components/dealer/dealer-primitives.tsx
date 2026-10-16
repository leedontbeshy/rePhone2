'use client';
import { useId, useState, type SyntheticEvent, type ReactNode } from 'react';
import { Button, InlineAlert, Input, Select, Textarea, type ButtonVariant } from '@/components/ui';
import type { DealerApi, DealerRecord } from '@/lib/dealer-api';
import { DealerApiError, dealerRecord, dealerText } from '@/lib/dealer-api';
import styles from './dealer.module.css';

export function DealerDeviceFacts({ configuration }: { configuration: unknown }) {
  const value = dealerRecord(configuration);
  const battery = dealerText(value['batteryHealthPercent']);
  const condition = dealerText(value['conditionGrade']);
  return (
    <p className={styles.muted}>
      Pin: {battery ? `${battery}%` : 'Chưa có thông tin'} · Ngoại hình:{' '}
      {condition ? `Loại ${condition}` : 'Chưa có thông tin'}
    </p>
  );
}

export interface DealerField {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string | number;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
}
export function DealerForm({
  fields,
  submit,
  onSubmit,
  children,
  onChange,
  fieldsClassName,
  disabled = false,
  submitVariant = 'primary',
}: {
  fields: DealerField[];
  submit: string;
  onSubmit: (data: Record<string, string>) => Promise<void> | void;
  children?: ReactNode;
  onChange?: () => void;
  fieldsClassName?: string | undefined;
  disabled?: boolean;
  submitVariant?: ButtonVariant;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function send(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      await onSubmit(
        Object.fromEntries(
          fields.map((field) => {
            const value = data.get(field.name);
            const text = typeof value === 'string' ? value : '';
            return [field.name, field.type === 'password' ? text : text.trim()];
          }),
        ),
      );
      for (const input of form.querySelectorAll<HTMLInputElement>('input[type=password]'))
        input.value = '';
    } catch (caught) {
      const errors: Record<string, string> = {};
      if (caught instanceof DealerApiError && caught.code === 'VALIDATION_FAILED') {
        for (const detail of caught.details) {
          const field = fields.find(
            (item) => detail.field === item.name || detail.field.startsWith(`${item.name}.`),
          );
          if (field && !errors[field.name]) errors[field.name] = detail.message;
        }
      }
      setFieldErrors(errors);
      setError(
        Object.keys(errors).length > 0
          ? 'Vui lòng kiểm tra các ô được đánh dấu.'
          : caught instanceof Error
            ? caught.message
            : 'Thao tác chưa thành công.',
      );
      if (Object.keys(errors).length > 0) {
        const input = form.elements.namedItem(Object.keys(errors)[0] ?? '');
        if (input instanceof HTMLElement) input.focus();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={styles.form}
      onChange={(event) => {
        const input = event.target;
        if (
          input instanceof HTMLInputElement ||
          input instanceof HTMLSelectElement ||
          input instanceof HTMLTextAreaElement
        ) {
          setFieldErrors((previous) =>
            Object.fromEntries(Object.entries(previous).filter(([name]) => name !== input.name)),
          );
          setError('');
        }
        onChange?.();
      }}
      onSubmit={(event) => {
        void send(event);
      }}
    >
      <div className={[styles.fields, fieldsClassName].filter(Boolean).join(' ')}>
        {fields.map((field) => {
          const common = {
            id: `${id}-${field.name}`,
            name: field.name,
            label: field.label,
            hint: field.hint,
            error: fieldErrors[field.name],
            required: field.required !== false,
            defaultValue: field.value,
          };
          return field.options ? (
            <Select key={field.name} {...common}>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ) : field.type === 'textarea' ? (
            <Textarea key={field.name} {...common} maxLength={2000} />
          ) : (
            <Input
              key={field.name}
              {...common}
              type={field.type ?? 'text'}
              maxLength={field.type === 'password' ? 128 : 1000}
              autoComplete={field.type === 'password' ? 'current-password' : undefined}
            />
          );
        })}
      </div>
      {children}
      {error && (
        <InlineAlert tone="danger" title="Chưa thể hoàn tất">
          {error}
        </InlineAlert>
      )}
      <div>
        <Button type="submit" loading={busy} disabled={disabled} variant={submitVariant}>
          {submit}
        </Button>
      </div>
    </form>
  );
}
export function DealerUpload({
  api,
  path,
  done,
  label = 'Gửi chứng từ',
}: {
  api: DealerApi;
  path: string;
  done: () => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useId();
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const file = new FormData(form).get('file');
        if (!(file instanceof File)) return;
        setBusy(true);
        setError('');
        void api
          .upload(path, file)
          .then(() => {
            form.reset();
            done();
          })
          .catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : 'Không tải được tệp.');
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <Input
        id={id}
        label={label}
        hint="JPEG, PNG, WebP hoặc PDF, tối đa 10 MB."
        name="file"
        type="file"
        required
        accept="image/jpeg,image/png,image/webp,application/pdf"
      />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <Button type="submit" loading={busy}>
        {label}
      </Button>
    </form>
  );
}
export function DealerEmpty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
export function DealerSecret({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className={styles.card}>
      <h3>{label}</h3>
      <p className={styles.muted}>
        Chỉ hiển thị lần này. Lưu vào hệ thống máy chủ của bạn trước khi đóng.
      </p>
      <textarea aria-label={label} className={styles.secret} value={value} readOnly rows={3} />
      <Button
        variant="secondary"
        onClick={() => {
          void navigator.clipboard
            .writeText(value)
            .then(() => {
              setCopied(true);
            })
            .catch(() => {
              setError('Hãy chọn và sao chép nội dung trong ô.');
            });
        }}
      >
        {copied ? 'Đã sao chép' : 'Sao chép'}
      </Button>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
export function recordFields(
  record: DealerRecord,
  definitions: Array<[string, string]>,
): DealerField[] {
  return definitions.map(([name, label]) => ({ name, label, value: dealerText(record[name]) }));
}
