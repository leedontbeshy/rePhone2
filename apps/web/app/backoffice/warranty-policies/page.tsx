'use client';

import { Suspense } from 'react';
import { WarrantyPolicyView } from '@/components/backoffice/operations/warranty-policies/warranty-policy-view';

export default function BackofficeWarrantyPoliciesPage() {
  return (
    <Suspense fallback={null}>
      <WarrantyPolicyView />
    </Suspense>
  );
}
