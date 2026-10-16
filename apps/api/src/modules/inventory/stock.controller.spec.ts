import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { ROLES_METADATA_KEY } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { StockController } from './stock.controller.js';

describe('StockController ledger contract', () => {
  it('protects receiving choices with staff authentication and a read-only route', () => {
    const handler = Object.getOwnPropertyDescriptor(StockController.prototype, 'listVariants')
      ?.value as (...args: unknown[]) => unknown;
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, StockController)).toEqual(['EMPLOYEE', 'ADMIN']);
    expect(Reflect.getMetadata(GUARDS_METADATA, StockController)).toEqual(
      expect.arrayContaining([SessionGuard, RolesGuard]),
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('stock-variants');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('exposes stock movements as an employee-safe read-only collection route', () => {
    const controllerRoles = Reflect.getMetadata(ROLES_METADATA_KEY, StockController) as unknown;
    const routes = Object.getOwnPropertyNames(StockController.prototype).flatMap((name) => {
      const handler = Object.getOwnPropertyDescriptor(StockController.prototype, name)?.value as
        ((...args: unknown[]) => unknown) | undefined;
      if (handler === undefined) return [];
      const path = Reflect.getMetadata(PATH_METADATA, handler) as unknown;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as unknown;
      return typeof path === 'string' && typeof method === 'number' ? [{ method, path }] : [];
    });

    expect(controllerRoles).toEqual(['EMPLOYEE', 'ADMIN']);
    expect(routes.filter((route) => route.path === 'stock-movements')).toEqual([
      { method: RequestMethod.GET, path: 'stock-movements' },
    ]);
  });
});
