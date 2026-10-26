import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('health')
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(@Res() res: Response) {
    try {
      // Fast query to check database connectivity
      const userCount = await this.prisma.user.count();

      return res.status(HttpStatus.OK).json({
        status: 'ok',
        service: 'grocery-delivery-api',
        database: 'connected',
        users: userCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'error',
        service: 'grocery-delivery-api',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Database connection failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
