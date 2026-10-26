import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  const createMockHost = () => {
    const statusSpy = vi.fn();
    const jsonSpy = vi.fn();
    const res = {
      status: statusSpy.mockReturnThis(),
      json: jsonSpy.mockReturnThis(),
    };
    const req = {
      method: 'POST',
      url: '/api/test',
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => req,
      }),
    } as unknown as ArgumentsHost;

    return { host, statusSpy, jsonSpy };
  };

  it('handles standard HttpException properly', () => {
    const { host, statusSpy, jsonSpy } = createMockHost();
    const exception = new HttpException('Bad input provided', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Bad input provided',
        path: '/api/test',
      }),
    );
  });

  it('translates Prisma unique constraint error (P2002) to 409 Conflict', () => {
    const { host, statusSpy, jsonSpy } = createMockHost();
    const prismaError = { code: 'P2002' };

    filter.catch(prismaError, host);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
      }),
    );
  });

  it('translates Prisma not found error (P2025) to 404 Not Found', () => {
    const { host, statusSpy, jsonSpy } = createMockHost();
    const prismaError = { code: 'P2025' };

    filter.catch(prismaError, host);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
      }),
    );
  });

  it('translates unknown error to 500 without leaking stack traces', () => {
    const { host, statusSpy, jsonSpy } = createMockHost();
    const unknownError = new Error('Secret database password leaked');

    filter.catch(unknownError, host);

    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        path: '/api/test',
      }),
    );
  });
});

