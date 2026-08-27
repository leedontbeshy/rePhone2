import { Input } from '@/components/ui';
import type { AuthFieldErrors } from './auth-validation';
import { PASSWORD_POLICY } from './auth-validation';
import styles from './auth.module.css';

interface PasswordFieldsProps {
  errors?: AuthFieldErrors;
  includeConfirmation?: boolean;
  passwordLabel?: string;
}

export function PasswordFields({
  errors = {},
  includeConfirmation = true,
  passwordLabel = 'Mật khẩu mới',
}: Readonly<PasswordFieldsProps>) {
  return (
    <div className={styles.passwordFields}>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        label={passwordLabel}
        required
        minLength={8}
        maxLength={128}
        pattern="(?=.*[A-Za-z])(?=.*\\d)(?!\\s)(?!.*\\s$).{8,128}"
        hint={PASSWORD_POLICY}
        error={errors.password}
      />
      {includeConfirmation ? (
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          label="Xác nhận mật khẩu"
          required
          minLength={8}
          maxLength={128}
          error={errors.confirmation}
        />
      ) : null}
    </div>
  );
}
