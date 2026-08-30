'use client';

import { Suspense } from 'react';
import { CustomerAdminView } from '@/components/backoffice/system/users';

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomerAdminView />
    </Suspense>
  );
}
