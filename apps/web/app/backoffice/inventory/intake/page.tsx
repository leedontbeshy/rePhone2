import { Suspense } from 'react';
import { InventoryShell } from '@/components/backoffice';
import { InventoryIntakeWizard } from './wizard';

export default function InventoryIntakePage() {
  return (
    <InventoryShell breadcrumbs={[{ label: 'Kho hàng' }, { label: 'Nhập máy' }]}>
      <Suspense fallback={<div className="status">Đang mở quy trình nhập máy…</div>}>
        <InventoryIntakeWizard />
      </Suspense>
    </InventoryShell>
  );
}
