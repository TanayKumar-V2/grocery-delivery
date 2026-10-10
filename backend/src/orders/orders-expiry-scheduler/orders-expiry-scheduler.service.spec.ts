import { Test, TestingModule } from '@nestjs/testing';
import { OrdersExpirySchedulerService } from './orders-expiry-scheduler.service.js';

describe('OrdersExpirySchedulerService', () => {
  let service: OrdersExpirySchedulerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersExpirySchedulerService],
    }).compile();

    service = module.get<OrdersExpirySchedulerService>(OrdersExpirySchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
