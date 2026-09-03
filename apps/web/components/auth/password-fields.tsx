'use client';

import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { IconButton, Input, type InputProps } from '@/components/ui';
import type { AuthFieldErrors } from './auth-validation';
import { PASSWORD_POLICY } from './auth-validation';
import styles from './auth.module.css';

interface PasswordFieldsProps {
  disabled?: boolean;
  errors?: AuthFieldErrors;
  includeConfirmation?: boolean;
  onFieldChange?: (field: 'confirmation' | 'password') => void;
  passwordLabel?: string;
}

export function PasswordFields({
  disabled = false,
  errors = {},
  includeConfirmation = true,
  onFieldChange,
  passwordLabel = 'Mật khẩu mới',
}: Readonly<PasswordFieldsProps>) {
  return (
    <div className={styles.passwordFields}>
      <PasswordInput
        id="password"
        name="password"
        autoComplete="new-password"
        label={passwordLabel}
        disabled={disabled}
        required
        minLength={8}
        maxLength={128}
        pattern="(?=.*[A-Za-z])(?=.*\\d)(?!\\s)(?!.*\\s$).{8,128}"
        hint={PASSWORD_POLICY}
        error={errors.password}
        onChange={() => onFieldChange?.('password')}
      />
      {includeConfirmation ? (
        <PasswordInput
          id="confirmation"
          name="confirmation"
          autoComplete="new-password"
          label="Xác nhận mật khẩu"
          disabled={disabled}
          required
          minLength={8}
          maxLength={128}
          error={errors.confirmation}
          onChange={() => onFieldChange?.('confirmation')}
        />
      ) : null}
    </div>
  );
}

export type PasswordInputProps = Omit<InputProps, 'endAction' | 'type'>;

export function PasswordInput({ disabled, id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const actionLabel = visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';

  return (
    <Input
      {...props}
      id={id}
      disabled={disabled}
      type={visible ? 'text' : 'password'}
      endAction={
        <IconButton
          aria-label={actionLabel}
          aria-controls={id}
          aria-pressed={visible}
          disabled={disabled}
          type="button"
          variant="ghost"
          onClick={() => {
            setVisible((current) => !current);
          }}
        >
          {visible ? (
            <EyeSlashIcon aria-hidden="true" size={20} />
          ) : (
            <EyeIcon aria-hidden="true" size={20} />
          )}
        </IconButton>
      }
    />
  );
}
