import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { RolesGuard } from './roles.guards.js';
import { Role } from '../../generated/prisma/enums.js';

describe('RolesGuard', () => {
  const reflectorMock = {
    getAllAndOverride: vi.fn(),
  };

  const guard = new RolesGuard(reflectorMock as unknown as Reflector);

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access if no roles are required on route', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);

    const context = createMockContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access if roles are required but user is not authenticated', () => {
    reflectorMock.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    const context = createMockContext(undefined);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies access if user does not have the required role', () => {
    reflectorMock.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    const context = createMockContext({ userId: 'u-1', role: Role.CUSTOMER });
    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows access if user has one of the required roles', () => {
    reflectorMock.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.DELIVERY_PARTNER]);

    const context = createMockContext({ userId: 'u-1', role: Role.ADMIN });
    expect(guard.canActivate(context)).toBe(true);
  });
});

