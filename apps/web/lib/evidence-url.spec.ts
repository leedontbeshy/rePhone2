import { describe, expect, it } from 'vitest';
import { assertSafeEvidenceUrl } from './evidence-url';

describe('evidence URL safety', () => {
  it('accepts secure provider links and local development links', () => {
    expect(assertSafeEvidenceUrl('https://storage.example.test/evidence/file.pdf').hostname).toBe(
      'storage.example.test',
    );
    expect(assertSafeEvidenceUrl('http://localhost:54321/evidence/file.pdf').port).toBe('54321');
  });

  it('rejects credentials, insecure remote hosts and unsupported protocols', () => {
    expect(() => assertSafeEvidenceUrl('https://user:secret@example.test/file')).toThrow(
      'Không thể mở minh chứng lúc này.',
    );
    expect(() => assertSafeEvidenceUrl('http://storage.example.test/file')).toThrow(
      'Không thể mở minh chứng lúc này.',
    );
    expect(() => assertSafeEvidenceUrl('javascript:alert(1)')).toThrow(
      'Không thể mở minh chứng lúc này.',
    );
  });
});
