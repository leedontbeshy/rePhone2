'use client';

import { useEffect } from 'react';

export function useUnsavedCatalogChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const protectPageExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by browsers that still use the legacy value to trigger their standard prompt.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', protectPageExit);
    return () => {
      window.removeEventListener('beforeunload', protectPageExit);
    };
  }, [dirty]);
}

export function catalogFormChanged(baseline: Readonly<object>, current: Readonly<object>): boolean {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  return [...keys].some((key) => !Object.is(Reflect.get(baseline, key), Reflect.get(current, key)));
}

export function catalogInternalNavigationTarget(href: string, currentHref: string): string | null {
  const current = new URL(currentHref);
  const destination = new URL(href, current);
  if (destination.origin !== current.origin) return null;
  const target = `${destination.pathname}${destination.search}${destination.hash}`;
  const currentTarget = `${current.pathname}${current.search}${current.hash}`;
  return target === currentTarget ? null : target;
}
