import {
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Cron,
  CronExpression,
} from '@nestjs/schedule';

import { OrdersService } from '../orders.service.js';

@Injectable()
export class OrdersExpirySchedulerService {
  private readonly logger = new Logger(
    OrdersExpirySchedulerService.name,
  );

  constructor(
    private readonly ordersService: OrdersService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredOrders() {
    try {
      const result =
        await this.ordersService.expirePendingOrders();

      if (result.expiredCount > 0) {
        this.logger.log(
          `Expired ${result.expiredCount} unpaid order(s) and released reserved stock.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to process expired orders',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}