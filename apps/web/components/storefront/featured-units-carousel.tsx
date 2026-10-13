'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExactUnitCard } from '@/components/catalog/exact-unit-card';
import { Button } from '@/components/ui';
import type { PublicUnitOffer } from '@/lib/catalog-api';
import styles from './featured-units-carousel.module.css';

export function FeaturedUnitsCarousel({
  offers,
}: Readonly<{ offers: readonly PublicUnitOffer[] }>) {
  const track = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReducedMotion(media.matches);
    };
    sync();
    media.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
    };
  }, []);

  const advance = useCallback(
    (direction: number) => {
      const element = track.current;
      if (element === null) return;
      const max = element.scrollWidth - element.clientWidth;
      const next = element.scrollLeft + direction * element.clientWidth;
      element.scrollTo({
        left:
          direction > 0 && element.scrollLeft >= max - 4
            ? 0
            : direction < 0 && element.scrollLeft <= 4
              ? max
              : next,
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    },
    [reducedMotion],
  );
  useEffect(() => {
    if (paused || hovered || focused || reducedMotion || offers.length <= 1) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') advance(1);
    }, 4000);
    return () => {
      window.clearInterval(timer);
    };
  }, [paused, hovered, focused, reducedMotion, offers.length, advance]);
  if (offers.length === 0) return null;
  return (
    <section
      className={styles.section}
      aria-labelledby="featured-units-title"
      aria-roledescription="băng chuyền"
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <header className={styles.header}>
        <div>
          <p>Đáng xem hôm nay</p>
          <h2 id="featured-units-title">Máy nổi bật</h2>
        </div>
        <div className={styles.controls}>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => {
              advance(-1);
            }}
          >
            Trước
          </Button>
          {!reducedMotion && (
            <Button
              size="compact"
              variant="secondary"
              aria-pressed={paused}
              onClick={() => {
                setPaused((value) => !value);
              }}
            >
              {paused ? 'Tự chuyển' : 'Tạm dừng'}
            </Button>
          )}
          <Button
            size="compact"
            variant="secondary"
            onClick={() => {
              advance(1);
            }}
          >
            Tiếp
          </Button>
        </div>
      </header>
      <div className={styles.track} ref={track} aria-label={`${String(offers.length)} máy nổi bật`}>
        {offers.slice(0, 10).map((offer) => (
          <div className={styles.slide} key={offer.unit.inventoryCode}>
            <ExactUnitCard {...offer} idPrefix="featured-unit" layout="stacked" />
          </div>
        ))}
      </div>
    </section>
  );
}
