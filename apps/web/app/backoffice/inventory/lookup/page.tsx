'use client';

import { useAuth } from '@/app/auth-provider';
import { InventoryShell, inventoryLifecyclePresentation } from '@/components/backoffice';
import {
  InventoryLookupView,
  type InventoryLookupInput,
  type InventoryLookupResult,
} from '@/components/backoffice/inventory/lookup/inventory-lookup-view';
import { lookupInventoryUnitIdentifier } from '@/lib/backoffice-inventory-api';

export default function InventoryLookupPage() {
  const { client } = useAuth();

  async function lookup(input: InventoryLookupInput): Promise<InventoryLookupResult> {
    const unit = await lookupInventoryUnitIdentifier(client, {
      type: input.identifierType,
      value: input.identifier,
      reason: input.reason,
    });
    const presentation = inventoryLifecyclePresentation(unit.lifecycleStatus);
    return {
      id: unit.id,
      inventoryCode: unit.inventoryCode,
      lifecycleLabel: presentation.label,
      lifecycleTone: presentation.tone,
      locationName: unit.location.name,
      maskedIdentifiers: unit.maskedIdentifiers,
      productName: unit.product.name,
      variantName: unit.variant.displayName,
    };
  }

  return (
    <InventoryShell breadcrumbs={[{ label: 'Kho hàng' }, { label: 'Tra cứu mã' }]}>
      <InventoryLookupView onLookup={lookup} />
    </InventoryShell>
  );
}
