import {
  ArrowCounterClockwiseIcon,
  ArrowsLeftRightIcon,
  ClockCounterClockwiseIcon,
  CreditCardIcon,
  CubeIcon,
  DeviceMobileIcon,
  FileTextIcon,
  GearIcon,
  HeadsetIcon,
  HeartbeatIcon,
  HouseIcon,
  IdentificationBadgeIcon,
  MapPinIcon,
  PackageIcon,
  PlusIcon,
  ScanIcon,
  ShoppingBagIcon,
  ShieldCheckIcon,
  TagIcon,
  TicketIcon,
  UsersIcon,
} from '@phosphor-icons/react/ssr';
import type { ShellNavigationItem } from './shell.types';

type NavigationIconName = NonNullable<ShellNavigationItem['icon']>;

const NAVIGATION_ICONS = {
  overview: HouseIcon,
  catalog: TagIcon,
  inventory: CubeIcon,
  orders: ShoppingBagIcon,
  vouchers: TicketIcon,
  devices: DeviceMobileIcon,
  intake: PlusIcon,
  lookup: ScanIcon,
  stock: PackageIcon,
  movements: ArrowsLeftRightIcon,
  locations: MapPinIcon,
  payments: CreditCardIcon,
  refunds: ArrowCounterClockwiseIcon,
  'after-sales': HeadsetIcon,
  warranties: ShieldCheckIcon,
  'warranty-policies': FileTextIcon,
  employees: IdentificationBadgeIcon,
  customers: UsersIcon,
  settings: GearIcon,
  'audit-logs': ClockCounterClockwiseIcon,
  'system-health': HeartbeatIcon,
} satisfies Record<NavigationIconName, typeof HouseIcon>;

export function renderBackofficeNavigationIcon(name: NavigationIconName) {
  const Icon = NAVIGATION_ICONS[name];
  return <Icon size={22} weight="regular" />;
}
