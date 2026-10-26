import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersServiceMock: any;

  beforeEach(async () => {
    ordersServiceMock = {
      createOrder: vi.fn(),
      cancelPendingOrder: vi.fn(),
      getMyOrders: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: ordersServiceMock,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  const mockUserRequest = {
    user: { userId: 'user-123', email: 'user@example.com', role: 'CUSTOMER' },
  } as any;

  it('createOrder delegates to ordersService with authenticated userId', async () => {
    ordersServiceMock.createOrder.mockResolvedValue({ id: 'ord-1' });

    const result = await controller.createOrder(mockUserRequest, { addressId: 'addr-1' });

    expect(ordersServiceMock.createOrder).toHaveBeenCalledWith('user-123', { addressId: 'addr-1' });
    expect(result).toEqual({ id: 'ord-1' });
  });

  it('cancelOrder delegates to ordersService with authenticated userId and orderId', async () => {
    ordersServiceMock.cancelPendingOrder.mockResolvedValue({ status: 'CANCELLED' });

    const result = await controller.cancelOrder(mockUserRequest, 'ord-1');

    expect(ordersServiceMock.cancelPendingOrder).toHaveBeenCalledWith('user-123', 'ord-1');
    expect(result).toEqual({ status: 'CANCELLED' });
  });

  it('getMyOrders delegates to ordersService with pagination dto', async () => {
    ordersServiceMock.getMyOrders.mockResolvedValue({ orders: [], meta: {} });

    const dto = { page: 1, limit: 10 };
    const result = await controller.getMyOrders(mockUserRequest, dto);

    expect(ordersServiceMock.getMyOrders).toHaveBeenCalledWith('user-123', dto);
    expect(result).toEqual({ orders: [], meta: {} });
  });
});
