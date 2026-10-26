import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { RateLimitGuard } from './rate-limit.guard.js';

describe('RateLimitGuard', () => {
  const reflectorMock = {
    getAllAndOverride: vi.fn(),
  };

  const guard = new RateLimitGuard(reflectorMock as unknown as Reflector);

  const createMockContext = (ip = '127.0.0.1', path = '/test'): ExecutionContext => {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          socket: { remoteAddress: ip },
          route: { path },
          path,
        }),
        getResponse: () => ({
          setHeader: vi.fn(),
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access if no rate limit is configured on the handler', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);

    const context = createMockContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows requests within the configured limit and blocks when exceeded', () => {
    reflectorMock.getAllAndOverride.mockReturnValue({ limit: 2, ttlSeconds: 60 });

    const context = createMockContext('192.168.1.100', '/sensitive-route');

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);

    // 3rd hit should throw 429 Too Many Requests
    expect(() => guard.canActivate(context)).toThrow(HttpException);

    try {
      guard.canActivate(context);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });
});

