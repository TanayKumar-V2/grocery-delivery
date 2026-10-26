import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrdersExpirySchedulerService } from './orders-expiry-scheduler.service.js';
import { OrdersService } from '../orders.service.js';

describe('OrdersExpirySchedulerService', () => {
  let service: OrdersExpirySchedulerService;
  let ordersServiceMock: { expirePendingOrders: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ordersServiceMock = {
      expirePendingOrders: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersExpirySchedulerService,
        {
          provide: OrdersService,
          useValue: ordersServiceMock,
        },
      ],
    }).compile();

    service = module.get<OrdersExpirySchedulerService>(
      OrdersExpirySchedulerService,
    );
  });

  it('runs expirePendingOrders and processes results', async () => {
    ordersServiceMock.expirePendingOrders.mockResolvedValue({ expiredCount: 3 });

    await service.handleExpiredOrders();

    expect(ordersServiceMock.expirePendingOrders).toHaveBeenCalled();
  });

  it('handles service errors gracefully without unhandled rejections', async () => {
    ordersServiceMock.expirePendingOrders.mockRejectedValue(new Error('DB failure'));

    await expect(service.handleExpiredOrders()).resolves.not.toThrow();
  });
});
