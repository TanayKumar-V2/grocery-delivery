import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator.js';

interface ClientHistory {
  timestamps: number[];
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, ClientHistory>();

  constructor(private readonly reflector: Reflector) {
    // Periodically clean up old buckets
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, history] of this.hits.entries()) {
        history.timestamps = history.timestamps.filter((ts) => now - ts < 300_000);
        if (history.timestamps.length === 0) {
          this.hits.delete(key);
        }
      }
    }, 60_000);

    if (timer.unref) {
      timer.unref();
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';

    const route = req.route?.path || req.path;
    const clientKey = `${ip}:${route}`;
    const now = Date.now();
    const windowStart = now - options.ttlSeconds * 1000;

    let history = this.hits.get(clientKey);
    if (!history) {
      history = { timestamps: [] };
      this.hits.set(clientKey, history);
    }

    // Keep only timestamps within window
    history.timestamps = history.timestamps.filter((ts) => ts > windowStart);

    if (history.timestamps.length >= options.limit) {
      const oldestHit = history.timestamps[0];
      const retryAfterSeconds = Math.ceil(
        (oldestHit + options.ttlSeconds * 1000 - now) / 1000,
      );

      if (res.setHeader) {
        res.setHeader('Retry-After', Math.max(1, retryAfterSeconds));
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please slow down and try again later.',
          retryAfterSeconds: Math.max(1, retryAfterSeconds),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    history.timestamps.push(now);
    return true;
  }
}

