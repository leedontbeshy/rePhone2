import { describe, expect, it, vi } from 'vitest';
import type { AuditLogListItem } from '@/lib/system-admin-api';
import {
  DEFAULT_AUDIT_QUERY,
  auditActionLabel,
  auditDraftFromQuery,
  focusAuditDetailHeading,
  auditListQueryKey,
  auditQueryFromDraft,
  auditWorkspaceHref,
  humanizeAuditPayload,
  parseAuditQuery,
  projectAuditListItem,
} from './audit-presenter';

describe('audit query presentation', () => {
  it('focuses a loaded detail without moving the current list position', () => {
    const focus = vi.fn();

    focusAuditDetailHeading({ focus });
    focusAuditDetailHeading(null);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
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
    expect(auditWorkspaceHref(query, 'audit/id')).toContain('/backoffice/audit-logs?');
    expect(auditWorkspaceHref(query, 'audit/id')).toContain('selected=audit%2Fid');
    expect(auditWorkspaceHref(query, 'audit/id')).toContain('action=settings.*');
  });

  it('keeps detail selection out of the list request key', () => {
    const first = auditListQueryKey(new URLSearchParams('page=2&selected=audit-1'));
    const second = auditListQueryKey(new URLSearchParams('page=2&selected=audit-2'));

    expect(first).toBe('page=2');
    expect(second).toBe(first);
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

describe('audit detail payload presentation', () => {
  it('humanizes known before and after fields while isolating unknown technical data', () => {
    const presentation = humanizeAuditPayload({
      after: { status: 'SUSPENDED', unknownAfter: 'kept-as-fallback' },
      before: { status: 'ACTIVE' },
      reason: '[REDACTED]',
    } as never);

    expect(presentation.groups).toEqual([
      {
        fields: [{ key: 'reason', label: 'Lý do', value: '[REDACTED]' }],
        key: 'summary',
      },
      {
        fields: [{ key: 'status', label: 'Trạng thái', value: 'Đang hoạt động' }],
        key: 'before',
        title: 'Trước thay đổi',
      },
      {
        fields: [{ key: 'status', label: 'Trạng thái', value: 'Tạm khóa' }],
        key: 'after',
        title: 'Sau thay đổi',
      },
    ]);
    expect(presentation.fallbackJson).toContain('unknownAfter');
    expect(presentation.fallbackJson).not.toContain('[REDACTED]');
  });

  it('describes shaped text metadata without exposing an object dump', () => {
    const presentation = humanizeAuditPayload({
      issue: { length: 42, present: true },
    } as never);

    expect(presentation.groups[0]?.fields[0]?.value).toBe('Có nội dung (42 ký tự)');
    expect(presentation.fallbackJson).toBeUndefined();
  });

  it('keeps date-only values date-only and translates common statuses', () => {
    const presentation = humanizeAuditPayload({
      hiredAt: '2026-08-25',
      status: 'PENDING_VERIFICATION',
    } as never);

    expect(presentation.groups[0]?.fields).toEqual([
      { key: 'hiredAt', label: 'Ngày nhận việc', value: '25/08/2026' },
      { key: 'status', label: 'Trạng thái', value: 'Chờ xác minh' },
    ]);
  });

  it('keeps unknown enum values and non-object payloads inside the technical fallback', () => {
    const unknownEnum = humanizeAuditPayload({ status: 'FUTURE_STATUS' } as never);
    const arrayPayload = humanizeAuditPayload(['one', 'two'] as never);

    expect(unknownEnum.groups).toHaveLength(0);
    expect(unknownEnum.fallbackJson).toContain('FUTURE_STATUS');
    expect(arrayPayload.groups).toHaveLength(0);
    expect(arrayPayload.fallbackJson).toContain('one');
  });
});
