import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PartnerLanding } from './partner-landing';

describe('partner landing destinations and disclosures', () => {
  it('preserves each anonymous portal return target, terms and full three-step process', () => {
    for (const kind of ['dealer', 'affiliate'] as const) {
      const html = renderToStaticMarkup(<PartnerLanding kind={kind} />);
      expect(html).toContain(`/login?returnTo=%2F${kind}`);
      expect(html).toContain(`href="/${kind}/terms"`);
      expect(html.match(/Bước [123]/g)).toHaveLength(3);
      expect(html.match(/<details>/g)).toHaveLength(4);
      expect(html.match(/<summary\b/g)).toHaveLength(4);
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toMatch(/sandbox|môi trường thực tế/i);
    }
  });

  it('joins in-place for an authenticated enrollee without another login CTA', () => {
    const html = renderToStaticMarkup(<PartnerLanding kind="affiliate" signedIn />);
    expect(html).toContain('href="#dang-ky"');
    expect(html).not.toContain('/login?returnTo=');
    expect(html).not.toContain('Đăng nhập hoặc tạo tài khoản');
    expect(html).toContain('Tối đa 5%');
    expect(html).toContain('200.000đ');
  });
});
