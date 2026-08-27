import {
  BarcodeIcon,
  BatteryMediumIcon,
  CalendarBlankIcon,
  CpuIcon,
  DeviceMobileIcon,
  GlobeHemisphereWestIcon,
  HardDriveIcon,
  LockOpenIcon,
  MemoryIcon,
  PaletteIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  SimCardIcon,
  WrenchIcon,
} from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';
import type { ProductDetail, UsedIphoneDetail } from '@/lib/catalog-api';
import {
  buildUnitSpecificationGroups,
  type UnitSpecificationKey,
} from './unit-specification-groups-presenter';
import styles from './unit-specification-groups.module.css';

interface UnitSpecificationGroupsProps {
  readonly detail: UsedIphoneDetail;
  readonly product: ProductDetail;
}

export function UnitSpecificationGroups({
  detail,
  product,
}: Readonly<UnitSpecificationGroupsProps>) {
  const groups = buildUnitSpecificationGroups(detail, product);

  return (
    <section className={styles.section} aria-label="Thông tin chi tiết">
      <h2>Thông tin chi tiết</h2>
      <div className={styles.groups}>
        {groups.map((group) => (
          <div className={styles.group} data-specification-group={group.key} key={group.key}>
            <h3>{group.title}</h3>
            <dl className={styles.grid}>
              {group.items.map((item) => (
                <div className={styles.item} data-specification-key={item.key} key={item.key}>
                  <dt>
                    <span className={styles.icon} aria-hidden="true">
                      {specificationIcon(item.key)}
                    </span>
                    <span>{item.label}</span>
                  </dt>
                  <dd>
                    <span>{item.value}</span>
                    {item.detail === undefined ? null : (
                      <small className={styles.detail}>{item.detail}</small>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function specificationIcon(key: UnitSpecificationKey): ReactNode {
  if (key === 'releaseYear') return <CalendarBlankIcon size={23} />;
  if (key === 'chipset') return <CpuIcon size={23} />;
  if (key === 'screen') return <DeviceMobileIcon size={23} />;
  if (key === 'ram') return <MemoryIcon size={23} />;
  if (key === 'storage') return <HardDriveIcon size={23} />;
  if (key === 'color') return <PaletteIcon size={23} />;
  if (key === 'inventoryCode' || key === 'modelNumber') return <BarcodeIcon size={23} />;
  if (key === 'region') return <GlobeHemisphereWestIcon size={23} />;
  if (key === 'simConfiguration') return <SimCardIcon size={23} />;
  if (key === 'networkLock') return <LockOpenIcon size={23} />;
  if (key === 'battery' || key === 'batteryReplacement') {
    return <BatteryMediumIcon size={23} />;
  }
  if (key === 'grade') return <SealCheckIcon size={23} />;
  if (key === 'repairHistory') return <WrenchIcon size={23} />;
  return <ShieldCheckIcon size={23} />;
}
