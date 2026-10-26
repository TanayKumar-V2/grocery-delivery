import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { CartService } from './cart.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('CartService', () => {
  let service: CartService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(async () => {
    mockTx = {
      product: {
        findUnique: vi.fn(),
      },
      cart: {
        upsert: vi.fn(),
      },
      cartItem: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
    };

    mockPrisma = {
      cart: {
        findUnique: vi.fn(),
      },
      cartItem: {
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  describe('addItem', () => {
    it('throws NotFoundException if product is not found or inactive', async () => {
      mockTx.product.findUnique.mockResolvedValue(null);

      await expect(
        service.addItem('user-1', { productId: 'p-1', quantity: 1 }),
      ).rejects.toThrow(NotFoundException);

      mockTx.product.findUnique.mockResolvedValue({ id: 'p-1', isActive: false });

      await expect(
        service.addItem('user-1', { productId: 'p-1', quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if product is out of stock', async () => {
      mockTx.product.findUnique.mockResolvedValue({
        id: 'p-1',
        isActive: true,
        inventory: { quantity: 5, reservedQuantity: 5 }, // 0 available
      });

      await expect(
        service.addItem('user-1', { productId: 'p-1', quantity: 1 }),
      ).rejects.toThrow('This product is currently out of stock');
    });

    it('throws BadRequestException if total cart quantity would exceed 99', async () => {
      mockTx.product.findUnique.mockResolvedValue({
        id: 'p-1',
        isActive: true,
        inventory: { quantity: 200, reservedQuantity: 0 },
      });
      mockTx.cart.upsert.mockResolvedValue({ id: 'cart-1', userId: 'user-1' });
      mockTx.cartItem.findUnique.mockResolvedValue({ quantity: 95 });

      await expect(
        service.addItem('user-1', { productId: 'p-1', quantity: 5 }), // 95 + 5 = 100 > 99
      ).rejects.toThrow('You can add at most 99 units of one product');
    });

    it('throws BadRequestException if requested quantity exceeds available stock', async () => {
      mockTx.product.findUnique.mockResolvedValue({
        id: 'p-1',
        isActive: true,
        inventory: { quantity: 10, reservedQuantity: 6 }, // 4 available
      });
      mockTx.cart.upsert.mockResolvedValue({ id: 'cart-1', userId: 'user-1' });
      mockTx.cartItem.findUnique.mockResolvedValue(null);

      await expect(
        service.addItem('user-1', { productId: 'p-1', quantity: 5 }), // 5 > 4
      ).rejects.toThrow('Only 4 units are currently available');
    });

    it('adds product to cart successfully', async () => {
      mockTx.product.findUnique.mockResolvedValue({
        id: 'p-1',
        name: 'Organic Milk',
        slug: 'organic-milk',
        unit: 'L',
        priceInPaise: 6000,
        discountPriceInPaise: 5500,
        isActive: true,
        inventory: { quantity: 20, reservedQuantity: 2 },
      });
      mockTx.cart.upsert.mockResolvedValue({ id: 'cart-1', userId: 'user-1' });
      mockTx.cartItem.findUnique.mockResolvedValue(null);
      mockTx.cartItem.upsert.mockResolvedValue({ id: 'item-1', quantity: 2 });

      const result = await service.addItem('user-1', { productId: 'p-1', quantity: 2 });

      expect(result.message).toBe('Product added to cart successfully');
      expect(result.item).toMatchObject({
        id: 'item-1',
        productId: 'p-1',
        name: 'Organic Milk',
        quantity: 2,
        priceInPaise: 6000,
        discountPriceInPaise: 5500,
      });
    });
  });

  describe('getCart', () => {
    it('returns empty cart summary if user has no cart', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      const result = await service.getCart('user-1');

      expect(result).toEqual({
        items: [],
        summary: {
          itemCount: 0,
          totalQuantity: 0,
          subtotalInPaise: 0,
        },
      });
    });

    it('calculates correct pricing, discounts, and inventory availability', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
        items: [
          {
            id: 'item-1',
            quantity: 2,
            product: {
              id: 'p-1',
              name: 'Bread',
              slug: 'bread',
              brand: 'Bakery',
              unit: 'pack',
              priceInPaise: 5000,
              discountPriceInPaise: 4000,
              isActive: true,
              category: { name: 'Bakery' },
              inventory: { quantity: 10, reservedQuantity: 2 }, // 8 available
            },
          },
        ],
      });

      const result = await service.getCart('user-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        unitPriceInPaise: 4000, // discount price used
        lineTotalInPaise: 8000,
        availableQuantity: 8,
        inStock: true,
        hasEnoughStock: true,
      });

      expect(result.summary).toEqual({
        itemCount: 1,
        totalQuantity: 2,
        subtotalInPaise: 8000,
      });
    });
  });

  describe('updateItem', () => {
    it('throws NotFoundException if item does not exist or belongs to another user', async () => {
      mockTx.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        cart: { userId: 'different-user' },
        product: { isActive: true },
      });

      await expect(
        service.updateItem('user-1', 'item-1', 3),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if product is inactive', async () => {
      mockTx.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        cart: { userId: 'user-1' },
        product: { isActive: false },
      });

      await expect(
        service.updateItem('user-1', 'item-1', 3),
      ).rejects.toThrow('This product is currently unavailable');
    });

    it('throws BadRequestException if new quantity exceeds available stock', async () => {
      mockTx.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        cart: { userId: 'user-1' },
        product: {
          id: 'p-1',
          isActive: true,
          inventory: { quantity: 5, reservedQuantity: 2 }, // 3 available
        },
      });

      await expect(
        service.updateItem('user-1', 'item-1', 4),
      ).rejects.toThrow('Only 3 units are currently available');
    });

    it('updates quantity successfully', async () => {
      mockTx.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        cart: { userId: 'user-1' },
        product: {
          id: 'p-1',
          name: 'Apples',
          isActive: true,
          inventory: { quantity: 10, reservedQuantity: 0 },
        },
      });

      mockTx.cartItem.update.mockResolvedValue({
        id: 'item-1',
        quantity: 5,
      });

      const result = await service.updateItem('user-1', 'item-1', 5);

      expect(result.message).toBe('Cart quantity updated successfully');
      expect(result.item.quantity).toBe(5);
    });
  });

  describe('removeItem', () => {
    it('throws NotFoundException if item does not belong to user', async () => {
      mockPrisma.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        cart: { userId: 'different-user' },
      });

      await expect(
        service.removeItem('user-1', 'item-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('removes item successfully', async () => {
      mockPrisma.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        cart: { userId: 'user-1' },
      });
      mockPrisma.cartItem.delete.mockResolvedValue({ id: 'item-1' });

      const result = await service.removeItem('user-1', 'item-1');

      expect(result.message).toBe('Product removed from cart successfully');
      expect(mockPrisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
    });
  });
});
