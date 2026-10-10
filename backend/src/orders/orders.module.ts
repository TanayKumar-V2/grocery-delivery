import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersExpirySchedulerService } from './orders-expiry-scheduler/orders-expiry-scheduler.service.js';

@Module({
  providers: [OrdersService, OrdersExpirySchedulerService],
  controllers: [OrdersController]
})
export class OrdersModule {}
