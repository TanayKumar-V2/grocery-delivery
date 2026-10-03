import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'grocery-delivery-api',
      timestamp: new Date().toISOString(),
    };
  }
}