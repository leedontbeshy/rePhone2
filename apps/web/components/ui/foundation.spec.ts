import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classNames } from './class-names';
import { formatVnd } from './money';

describe('frontend design foundation', () => {
  it('formats VND without converting money to floating point', () => {
    expect(formatVnd('21490000')).toBe('21.490.000\u00a0₫');
    expect(formatVnd(BigInt(-125000))).toBe('-125.000\u00a0₫');
    expect(formatVnd('000100')).toBe('100\u00a0₫');
    expect(() => formatVnd('10.5')).toThrow(TypeError);
  });

  it('joins optional CSS module classes without leaking false values', () => {
    expect(classNames('button', false, undefined, 'primary', null)).toBe('button primary');
  });

  it('keeps approved color, target-size and reduced-motion contracts executable', () => {
    const tokensPath = fileURLToPath(new URL('../../styles/tokens.css', import.meta.url));
    const basePath = fileURLToPath(new URL('../../styles/base.css', import.meta.url));
    const primitivesPath = fileURLToPath(new URL('./primitives.module.css', import.meta.url));
    const tokens = readFileSync(tokensPath, 'utf8');
    const base = readFileSync(basePath, 'utf8');
    const primitives = readFileSync(primitivesPath, 'utf8');

    expect(tokens).toContain('--color-canvas: #f7f9fb;');
    expect(tokens).toContain('--color-primary: #007c9f;');
    expect(tokens).toContain('--color-danger: #b4232d;');
    expect(tokens).toContain('--control-height: 2.75rem;');
    expect(base).toContain('@media (prefers-reduced-motion: reduce)');
    expect(base).toContain('.rp-surface h1');
    expect(base).not.toMatch(/\nbody\s*\{[^}]*background:/);
    expect(primitives).toContain('min-height: var(--control-height);');
    expect(primitives).not.toContain('min-height: 2.5rem;');
    expect(contrastRatio('#006780', '#e2f5f9')).toBeGreaterThanOrEqual(4.5);
  });

  it('does not reference undefined global color tokens without a fallback', () => {
    const webRoot = fileURLToPath(new URL('../..', import.meta.url));
    const tokensPath = join(webRoot, 'styles', 'tokens.css');
    const tokenDefinitions = new Set(
      [...readFileSync(tokensPath, 'utf8').matchAll(/(--color-[a-z0-9-]+)\s*:/g)].map(
        ([, token]) => token,
      ),
    );
    const unresolved: string[] = [];

    for (const path of listCssFiles(webRoot)) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/var\((--color-[a-z0-9-]+)(\s*,)?/g)) {
        const [, token, fallbackMarker] = match;
        if (token !== undefined && fallbackMarker === undefined && !tokenDefinitions.has(token)) {
          unresolved.push(`${path.replaceAll('\\', '/')}: ${token}`);
        }
      }
    }

    expect(unresolved).toEqual([]);
  });
});

function listCssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
      return listCssFiles(path);
    }
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lightest = Math.max(foregroundLuminance, backgroundLuminance);
  const darkest = Math.min(foregroundLuminance, backgroundLuminance);
  return (lightest + 0.05) / (darkest + 0.05);
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (channels === undefined || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);

  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
