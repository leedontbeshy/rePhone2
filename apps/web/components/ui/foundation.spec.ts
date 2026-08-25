import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
    expect(primitives).toContain('min-height: var(--control-height);');
  });
});
