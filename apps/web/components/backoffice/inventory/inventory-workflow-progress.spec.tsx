import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InventoryWorkflowProgress } from './inventory-workflow-progress';

describe('inventory workflow progress', () => {
  it('marks completed and current steps for sighted and assistive users', () => {
    const markup = renderToStaticMarkup(
      <InventoryWorkflowProgress completedSteps={[1, 2]} currentStep={3} />,
    );

    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain('Tiếp nhận');
    expect(markup).toContain('Ảnh thực tế');
    expect(markup).toContain('Kiểm định');
    expect(markup).toContain('Bước hiện tại');
    expect(markup.match(/Đã hoàn tất/g)).toHaveLength(2);
  });
});
