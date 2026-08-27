import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { UsedIphoneDetail } from '@/lib/catalog-api';
import { PublicInspectionSummary } from './public-inspection-summary';

type FunctionalCheck = UsedIphoneDetail['unit']['functionalChecks'][number];

describe('PublicInspectionSummary', () => {
  it('shows at most five public results without operational count copy', () => {
    const html = renderToStaticMarkup(
      <PublicInspectionSummary checks={checks} inventoryCode="RPH-IP11-64-BLK-U04" />,
    );

    expect(html).toContain('Máy đã được kiểm tra kỹ thuật');
    expect(html).toContain(
      'Các kết quả tiêu biểu dưới đây được ghi nhận riêng cho máy mã RPH-IP11-64-BLK-U04.',
    );
    expect(html.match(/data-inspection-summary-check/g)).toHaveLength(5);
    expect(html).not.toContain('5/18');
    expect(html).not.toContain('18 hạng mục');
    expect(html).not.toContain('Kết quả 6');
  });

  it('renders nothing when no public result is available', () => {
    expect(
      renderToStaticMarkup(
        <PublicInspectionSummary checks={[]} inventoryCode="RPH-IP11-64-BLK-U04" />,
      ),
    ).toBe('');
  });
});

const checks = Array.from({ length: 6 }, (_, index) => ({
  key: `CHECK_${String(index + 1)}`,
  label: `Kết quả ${String(index + 1)}`,
  note: null,
  status: 'PASS',
})) as FunctionalCheck[];
