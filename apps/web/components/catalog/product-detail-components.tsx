import { CaretRightIcon, HouseIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { classNames } from '@/components/ui/class-names';
import styles from './product-detail-components.module.css';

interface ProductBreadcrumbsProps {
  readonly inventoryCode?: string;
  readonly productName: string;
  readonly productSlug?: string;
}

export function ProductBreadcrumbs({
  inventoryCode,
  productName,
  productSlug,
}: ProductBreadcrumbsProps) {
  return (
    <nav className={styles.breadcrumbs} aria-label="Đường dẫn">
      <Link className={styles.homeLink} href="/">
        <HouseIcon aria-hidden="true" size={17} weight="fill" />
        <span className={styles.visuallyHidden}>Trang chủ</span>
      </Link>
      <CaretRightIcon aria-hidden="true" size={14} />
      <Link href="/products">Sản phẩm</Link>
      <CaretRightIcon aria-hidden="true" size={14} />
      {inventoryCode === undefined || productSlug === undefined ? (
        <span aria-current="page">{productName}</span>
      ) : (
        <>
          <Link href={`/products/${productSlug}`}>{productName}</Link>
          <CaretRightIcon aria-hidden="true" size={14} />
          <span aria-current="page">{inventoryCode}</span>
        </>
      )}
    </nav>
  );
}

export interface ProductSpecItem {
  readonly detail?: string | undefined;
  readonly icon: ReactNode;
  readonly label: string;
  readonly value?: string | number | null | undefined;
}

interface ProductSpecGridProps {
  readonly className?: string;
  readonly items: readonly ProductSpecItem[];
  readonly title?: string;
  readonly variant?: 'cards' | 'rows';
}

export function ProductSpecGrid({
  className,
  items,
  title,
  variant = 'cards',
}: ProductSpecGridProps) {
  const visibleItems = items.filter(
    ({ value }) => value !== null && value !== undefined && value !== '',
  );
  if (visibleItems.length === 0) return null;

  const content = (
    <dl className={classNames(styles.specGrid, styles[variant], className)}>
      {visibleItems.map((item) => (
        <div key={`${item.label}-${String(item.value)}`}>
          <dt>
            <span className={styles.specIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </dt>
          <dd>
            <span>{item.value}</span>
            {item.detail === undefined ? null : <small>{item.detail}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (title === undefined) return content;
  return (
    <section className={styles.specSection} aria-labelledby="product-specification-heading">
      <h2 id="product-specification-heading">{title}</h2>
      {content}
    </section>
  );
}

interface ProductTrustCalloutProps {
  readonly children: ReactNode;
  readonly icon: ReactNode;
}

export function ProductTrustCallout({ children, icon }: ProductTrustCalloutProps) {
  return (
    <div className={styles.trustCallout}>
      <span aria-hidden="true">{icon}</span>
      <p>{children}</p>
    </div>
  );
}
