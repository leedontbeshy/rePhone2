import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { AuditNoStoreMiddleware } from './audit-no-store.middleware.js';

describe('AuditNoStoreMiddleware', () => {
  it('sets no-store before the controller or an error response runs', () => {
    const setHeader = vi.fn();
    const next = vi.fn();

    new AuditNoStoreMiddleware().use(
      {} as Request,
      { setHeader } as unknown as Response,
      next as NextFunction,
    );

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(next).toHaveBeenCalledOnce();
  });
});
