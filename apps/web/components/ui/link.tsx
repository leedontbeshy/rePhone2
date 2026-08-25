import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { classNames } from './class-names';
import styles from './primitives.module.css';

export interface LinkProps extends ComponentProps<typeof NextLink> {
  quiet?: boolean;
  standalone?: boolean;
}

export function Link({ className, quiet = false, standalone = false, ...props }: LinkProps) {
  return (
    <NextLink
      {...props}
      className={classNames(
        styles.link,
        quiet && styles.linkQuiet,
        standalone && styles.linkStandalone,
        className,
      )}
    />
  );
}
