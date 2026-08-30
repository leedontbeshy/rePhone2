import { describe, expect, it } from 'vitest';
import type { AuditLogListItem } from '@/lib/system-admin-api';
import {
  DEFAULT_AUDIT_QUERY,
  auditActionLabel,
  auditDraftFromQuery,
  auditQueryFromDraft,
  auditWorkspaceHref,
  parseAuditQuery,
  projectAuditListItem,
} from './audit-presenter';

describe('audit query presentation', () => {
  it('accepts only supported URL values and restores safe defaults', () => {
    const query = parseAuditQuery(
      new URLSearchParams(
        'page=-2&pageSize=1000&actorType=ADMIN&action=%3Cscript%3E&resourceType=Order.Item&requestId=this-request-id-is-far-too-long-to-be-accepted-by-the-audit-filter-because-it-is-over-sixty-four-characters&createdFrom=not-a-date&sortOrder=sideways',
      ),
    );

    expect(query).toEqual(DEFAULT_AUDIT_QUERY);
  });

  it('keeps valid filters in a shareable deep link', () => {
    const query = parseAuditQuery(
      new URLSearchParams(
        'page=3&actorType=SYSTEM&action=settings.*&resourceType=StoreSettings&requestId=req-123&createdFrom=2026-08-29T00%3A00%3A00.000Z&sortOrder=asc',
      ),
    );

    expect(query).toMatchObject({
      action: 'settings.*',
      actorType: 'SYSTEM',
      page: 3,
      pageSize: 20,
      requestId: 'req-123',
      resourceType: 'StoreSettings',
      sortOrder: 'asc',
    });
    expect(auditWorkspaceHref(query, 'audit/id')).toContain('/backoffice/audit-logs/audit%2Fid?');
    expect(auditWorkspaceHref(query, 'audit/id')).toContain('action=settings.*');
  });

  it('rejects an inverted date range before making a request', () => {
    const result = auditQueryFromDraft({
      ...auditDraftFromQuery(DEFAULT_AUDIT_QUERY),
      createdFrom: '2026-08-30T12:00',
      createdTo: '2026-08-30T11:00',
    });

    expect(result.query).toBeUndefined();
    expect(result.errors.createdTo).toContain('sau thời điểm bắt đầu');
  });

  it('drops an inverted end date from a manually edited URL', () => {
    const query = parseAuditQuery(
      new URLSearchParams(
        'createdFrom=2026-08-30T12%3A00%3A00.000Z&createdTo=2026-08-30T11%3A00%3A00.000Z',
      ),
    );

    expect(query.createdFrom).toBe('2026-08-30T12:00:00.000Z');
    expect(query.createdTo).toBeUndefined();
  });
});

describe('audit list projection', () => {
  it('uses natural labels for compound operational actions', () => {
    expect(auditActionLabel('settings.bank_qr_updated')).toBe('Đã cập nhật mã QR chuyển khoản');
    expect(auditActionLabel('fulfillment.pickup_completed')).toBe(
      'Đã hoàn tất đơn nhận tại cửa hàng',
    );
  });

  it('projects only list-safe fields and converts technical action values to natural labels', () => {
    const item = {
      action: 'employee.disabled',
      actor: {
        employeeCode: 'NV001',
        fullName: 'Nguyễn Văn An',
        id: 'actor-1',
        role: 'ADMIN',
      },
      actorType: 'USER',
      changes: { secret: 'must-not-enter-the-list-row' },
      createdAt: '2026-08-30T04:30:00.000Z',
      id: 'audit-1',
      metadata: { token: 'must-not-enter-the-list-row' },
      requestId: 'request-private',
      resourceId: 'employee-1',
      resourceType: 'User',
    } as unknown as AuditLogListItem;

    const row = projectAuditListItem(item);

    expect(row).toMatchObject({
      actionLabel: 'Đã vô hiệu hóa nhân viên',
      actorInitials: 'NA',
      actorLabel: 'Nguyễn Văn An',
      id: 'audit-1',
      resourceLabel: 'Tài khoản',
    });
    expect(row).not.toHaveProperty('changes');
    expect(row).not.toHaveProperty('metadata');
    expect(row).not.toHaveProperty('requestId');
    expect(JSON.stringify(row)).not.toContain('must-not-enter-the-list-row');
  });
});
