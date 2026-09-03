import { CaretRightIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { IphoneModelCard } from '@/components/catalog/iphone-model-card';
import type { IphoneGenerationGroup } from '@/lib/iphone-model-groups';
import styles from './iphone-generation-catalog.module.css';

interface IphoneGenerationSectionProps {
  readonly group: IphoneGenerationGroup;
  readonly priorityProductId?: string | undefined;
}

export function IphoneGenerationSection({
  group,
  priorityProductId,
}: Readonly<IphoneGenerationSectionProps>) {
  const headingId = `${group.id}-heading`;
  const query = new URLSearchParams({ productType: 'IPHONE', q: group.label }).toString();

  return (
    <section className={styles.generation} aria-labelledby={headingId}>
      <div className={styles.heading}>
        <h2 id={headingId}>{group.label}</h2>
        {group.id === 'iphone-other' ? null : (
          <Link href={`/products?${query}`} prefetch={false}>
            <span>Xem dòng {group.label}</span>
            <CaretRightIcon aria-hidden="true" size={16} weight="bold" />
          </Link>
        )}
      </div>
      <ul className={styles.shelf} aria-label={`Các dòng máy thuộc ${group.label}`}>
        {group.products.map((product) => (
          <li key={product.id}>
            <IphoneModelCard priority={product.id === priorityProductId} product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
