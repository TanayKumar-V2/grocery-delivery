import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'object' ? res : { message: res };
    } else if (
      exception &&
      typeof exception === 'object' &&
      'code' in exception
    ) {
      // Handle known Prisma errors gracefully
      const prismaCode = (exception as { code: string }).code;
      if (prismaCode === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = {
          statusCode: HttpStatus.CONFLICT,
          message: 'A unique constraint violation occurred on the record.',
          error: 'Conflict',
        };
      } else if (prismaCode === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'The requested resource was not found.',
          error: 'Not Found',
        };
      } else if (prismaCode === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        message = {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'A foreign key constraint failed.',
          error: 'Bad Request',
        };
      } else {
        this.logger.error(
          `Unhandled database error [${prismaCode}] on ${request.method} ${request.url}`,
          exception instanceof Error ? exception.stack : undefined,
        );
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const errorResponse =
      typeof message === 'object' && message !== null
        ? {
            ...message,
            timestamp: new Date().toISOString(),
            path: request.url,
          }
        : {
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
            path: request.url,
          };

    response.status(status).json(errorResponse);
  }
}
