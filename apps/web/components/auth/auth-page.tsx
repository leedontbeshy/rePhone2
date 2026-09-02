import type { FormHTMLAttributes, ReactNode } from 'react';
import { AuthShell } from '@/components/shells';
import { InlineAlert, Skeleton } from '@/components/ui';
import styles from './auth.module.css';

interface AuthPageProps {
  children: ReactNode;
  description?: ReactNode;
  title: string;
}

export function AuthPage({ children, description, title }: Readonly<AuthPageProps>) {
  return (
    <AuthShell
      title={title}
      description={description}
      footer={
        <p className={styles.shellFooter}>
          rePhone không bao giờ yêu cầu bạn gửi mật khẩu qua tin nhắn.
        </p>
      }
    >
      {children}
    </AuthShell>
  );
}

export function AuthForm({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form {...props} className={styles.form} noValidate>
      {children}
    </form>
  );
}

export function AuthFormActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.formActions}>{children}</div>;
}

export function AuthFormFooter({ children }: Readonly<{ children: ReactNode }>) {
  return <p className={styles.footerCopy}>{children}</p>;
}

export function AuthSecurityNote({ children }: Readonly<{ children: ReactNode }>) {
  return <p className={styles.securityNote}>{children}</p>;
}

export function AuthPending({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={styles.loadingBlock} aria-busy="true">
      <InlineAlert role="status" tone="neutral" aria-live="polite">
        <p className={styles.statusCopy}>{children}</p>
      </InlineAlert>
      <div className={styles.pendingForm} aria-hidden="true">
        <div className={styles.pendingField}>
          <Skeleton height="1rem" width="38%" />
          <Skeleton height="2.75rem" width="100%" />
        </div>
        <div className={styles.pendingField}>
          <Skeleton height="1rem" width="32%" />
          <Skeleton height="2.75rem" width="100%" />
        </div>
        <Skeleton height="2.75rem" width="100%" />
        <Skeleton height="1rem" width="46%" />
        <Skeleton height="1rem" width="72%" />
      </div>
    </div>
  );
}

export const authStyles = {
  copy: styles.copy,
  passwordFields: styles.passwordFields,
  policyList: styles.policyList,
  primaryAction: styles.primaryAction,
  terminalState: styles.terminalState,
};
