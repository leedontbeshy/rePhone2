'use client';

import { SystemAdminShell } from '@/components/backoffice';
import { SettingsView } from '@/components/backoffice/system/settings/settings-view';

export default function SettingsPage() {
  return (
    <SystemAdminShell
      breadcrumbs={[{ href: '/backoffice', label: 'Vận hành' }, { label: 'Cấu hình cửa hàng' }]}
    >
      <SettingsView />
    </SystemAdminShell>
  );
}
