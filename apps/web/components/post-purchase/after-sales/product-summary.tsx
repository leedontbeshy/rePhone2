import { DeviceMobileIcon, PlugsIcon } from '@phosphor-icons/react';
import styles from './after-sales.module.css';

export function AfterSalesProductSummary({
  name,
  productType,
  secondary,
}: Readonly<{
  name: string;
  productType?: 'IPHONE' | 'ACCESSORY' | undefined;
  secondary?: string | undefined;
}>) {
  const Icon =
    productType === 'IPHONE' ? DeviceMobileIcon : productType === 'ACCESSORY' ? PlugsIcon : null;
  return (
    <div className={styles.productSummary}>
      {Icon ? (
        <span className={styles.productIcon} aria-hidden="true">
          <Icon size={26} />
        </span>
      ) : null}
      <span className={styles.productCopy}>
        <strong>{name}</strong>
        {secondary ? <small>{secondary}</small> : null}
      </span>
    </div>
  );
}
