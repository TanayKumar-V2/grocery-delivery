import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('health')
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    const userCount = await this.prisma.user.count();

    return {
      status: 'ok',
      service: 'grocery-delivery-api',
      database: 'connected',
      users: userCount,
      timestamp: new Date().toISOString(),
    };
  }
}