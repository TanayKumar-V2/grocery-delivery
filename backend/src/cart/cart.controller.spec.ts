import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';

describe('CartController', () => {
  let controller: CartController;
  let cartServiceMock: any;

  beforeEach(async () => {
    cartServiceMock = {
      getCart: vi.fn(),
      addItem: vi.fn(),
      updateItem: vi.fn(),
      removeItem: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [
        {
          provide: CartService,
          useValue: cartServiceMock,
        },
      ],
    }).compile();

    controller = module.get<CartController>(CartController);
  });

  const mockUserReq = {
    user: { userId: 'user-123', email: 'user@example.com', role: 'CUSTOMER' },
  } as any;

  it('getCart delegates to service with userId', async () => {
    cartServiceMock.getCart.mockResolvedValue({ items: [], summary: {} });

    const result = await controller.getCart(mockUserReq);

    expect(cartServiceMock.getCart).toHaveBeenCalledWith('user-123');
    expect(result).toEqual({ items: [], summary: {} });
  });

  it('addItem delegates to service with userId and dto', async () => {
    const dto = { productId: 'p-1', quantity: 2 };
    cartServiceMock.addItem.mockResolvedValue({ message: 'Added' });

    const result = await controller.addItem(mockUserReq, dto);

    expect(cartServiceMock.addItem).toHaveBeenCalledWith('user-123', dto);
    expect(result).toEqual({ message: 'Added' });
  });

  it('updateItem delegates to service with userId, itemId, and quantity', async () => {
    const dto = { quantity: 4 };
    cartServiceMock.updateItem.mockResolvedValue({ message: 'Updated' });

    const result = await controller.updateItem(mockUserReq, 'item-1', dto);

    expect(cartServiceMock.updateItem).toHaveBeenCalledWith('user-123', 'item-1', 4);
    expect(result).toEqual({ message: 'Updated' });
  });

  it('removeItem delegates to service with userId and itemId', async () => {
    cartServiceMock.removeItem.mockResolvedValue({ message: 'Removed' });

    const result = await controller.removeItem(mockUserReq, 'item-1');

    expect(cartServiceMock.removeItem).toHaveBeenCalledWith('user-123', 'item-1');
    expect(result).toEqual({ message: 'Removed' });
  });
});
