import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { OrdersService } from './orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('OrdersService', () => {
  let service: OrdersService;

  const address = {
    id: 'address-1',
    userId: 'user-1',
    recipientName: 'Test Customer',
    phone: '9999999999',
    addressLine1: '123 Test Street',
    addressLine2: null,
    landmark: null,
    city: 'Delhi',
    state: 'Delhi',
    postalCode: '110001',
    latitude: 28.6139,
    longitude: 77.209,
  };

  const makeCart = (
    quantity = 2,
    stock = 10,
    reserved = 1,
    isActive = true,
    hasInventory = true,
  ) => ({
    id: 'cart-1',
    items: [
      {
        productId: 'product-1',
        quantity,
        product: {
          id: 'product-1',
          name: 'Apples',
          sku: 'APL-001',
          unit: 'kg',
          isActive,
          priceInPaise: 1000,
          discountPriceInPaise: 800,
          inventory: hasInventory
            ? {
                quantity: stock,
                reservedQuantity: reserved,
              }
            : null,
        },
      },
    ],
  });

  const txMock = {
    address: {
      findFirst: vi.fn(),
    },
    cart: {
      findUnique: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
    },
    cartItem: {
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };

  const prismaMock = {
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(
      async (
        callback: (tx: typeof txMock) => Promise<unknown>,
      ) => callback(txMock),
    ),
  };

  beforeEach(async () => {
    txMock.address.findFirst.mockReset();
    txMock.cart.findUnique.mockReset();
    txMock.order.findFirst.mockReset();
    txMock.order.create.mockReset();
    txMock.order.updateMany.mockReset();
    txMock.orderItem.findMany.mockReset();
    txMock.cartItem.deleteMany.mockReset();
    txMock.$executeRaw.mockReset();
    prismaMock.order.findMany.mockReset();
    prismaMock.order.count.mockReset();

    txMock.address.findFirst.mockResolvedValue(address);
    txMock.cart.findUnique.mockResolvedValue(makeCart());
    txMock.$executeRaw.mockResolvedValue(1);

    txMock.order.create.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'GRO-TEST-001',
      status: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      subtotalInPaise: 2000,
      discountInPaise: 400,
      deliveryFeeInPaise: 0,
      taxInPaise: 0,
      totalInPaise: 1600,
    });

    txMock.cartItem.deleteMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('createOrder', () => {
    it('rejects an address that does not belong to the customer', async () => {
      txMock.address.findFirst.mockResolvedValue(null);

      await expect(
        service.createOrder('user-1', {
          addressId: 'address-1',
        }),
      ).rejects.toThrow('Delivery address not found');

      expect(txMock.cart.findUnique).not.toHaveBeenCalled();
      expect(txMock.order.create).not.toHaveBeenCalled();
    });

    it('rejects an empty cart', async () => {
      txMock.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [],
      });

      await expect(
        service.createOrder('user-1', {
          addressId: 'address-1',
        }),
      ).rejects.toThrow('Your cart is empty');

      expect(txMock.order.create).not.toHaveBeenCalled();
      expect(txMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects an order when available stock is insufficient', async () => {
      txMock.cart.findUnique.mockResolvedValue(
        makeCart(2, 1, 0),
      );

      await expect(
        service.createOrder('user-1', {
          addressId: 'address-1',
        }),
      ).rejects.toThrow('Insufficient stock for Apples. Available: 1');

      expect(txMock.$executeRaw).not.toHaveBeenCalled();
      expect(txMock.order.create).not.toHaveBeenCalled();
      expect(txMock.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects an order when product is inactive', async () => {
      txMock.cart.findUnique.mockResolvedValue(
        makeCart(1, 10, 0, false),
      );

      await expect(
        service.createOrder('user-1', {
          addressId: 'address-1',
        }),
      ).rejects.toThrow('Apples is no longer available');
    });

    it('rejects an order when product has no inventory record', async () => {
      txMock.cart.findUnique.mockResolvedValue(
        makeCart(1, 10, 0, true, false),
      );

      await expect(
        service.createOrder('user-1', {
          addressId: 'address-1',
        }),
      ).rejects.toThrow('Apples has no inventory record');
    });

    it('throws BadRequestException if atomic reservation fails (updatedRows !== 1)', async () => {
      txMock.$executeRaw.mockResolvedValue(0);

      await expect(
        service.createOrder('user-1', {
          addressId: 'address-1',
        }),
      ).rejects.toThrow('Stock changed for Apples. Please refresh your cart and try again.');

      expect(txMock.order.create).not.toHaveBeenCalled();
      expect(txMock.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('creates a discounted order and reserves stock', async () => {
      const result = await service.createOrder('user-1', {
        addressId: 'address-1',
      });

      expect(txMock.order.create).toHaveBeenCalledTimes(1);

      const createArgs = txMock.order.create.mock.calls[0][0];

      expect(createArgs.data).toMatchObject({
        userId: 'user-1',
        addressId: 'address-1',
        subtotalInPaise: 2000,
        discountInPaise: 400,
        deliveryFeeInPaise: 0,
        taxInPaise: 0,
        totalInPaise: 1600,
        items: {
          create: [
            {
              productName: 'Apples',
              sku: 'APL-001',
              unit: 'kg',
              unitPriceInPaise: 800,
              quantity: 2,
              lineTotalInPaise: 1600,
              product: {
                connect: {
                  id: 'product-1',
                },
              },
            },
          ],
        },
      });

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);

      expect(txMock.cartItem.deleteMany).toHaveBeenCalledWith({
        where: {
          cartId: 'cart-1',
        },
      });

      expect(result).toMatchObject({
        message: 'Order created successfully',
        order: {
          id: 'order-1',
          subtotalInPaise: 2000,
          discountInPaise: 400,
          totalInPaise: 1600,
          items: [
            {
              productId: 'product-1',
              quantity: 2,
              unitPriceInPaise: 800,
              lineTotalInPaise: 1600,
            },
          ],
        },
      });
    });
  });

  describe('cancelPendingOrder', () => {
    it('throws NotFoundException if order does not belong to user or does not exist', async () => {
      txMock.order.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelPendingOrder('user-1', 'order-not-mine'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns already cancelled message if order status is already CANCELLED', async () => {
      txMock.order.findFirst.mockResolvedValue({
        id: 'order-1',
        status: 'CANCELLED',
        paymentStatus: 'EXPIRED',
        items: [],
      });

      const result = await service.cancelPendingOrder('user-1', 'order-1');

      expect(result).toEqual({
        message: 'Order is already cancelled',
        orderId: 'order-1',
      });
      expect(txMock.order.updateMany).not.toHaveBeenCalled();
      expect(txMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if order is paid or confirmed', async () => {
      txMock.order.findFirst.mockResolvedValue({
        id: 'order-1',
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        items: [],
      });

      await expect(
        service.cancelPendingOrder('user-1', 'order-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if order status changed concurrently during update', async () => {
      txMock.order.findFirst.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        items: [{ productId: 'product-1', quantity: 2, productName: 'Apples' }],
      });

      txMock.order.updateMany.mockResolvedValue({ count: 0 }); // race condition

      await expect(
        service.cancelPendingOrder('user-1', 'order-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('cancels pending order and releases reserved stock exactly once', async () => {
      txMock.order.findFirst.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        items: [
          { productId: 'product-1', quantity: 2, productName: 'Apples' },
        ],
      });

      txMock.order.updateMany.mockResolvedValue({ count: 1 });
      txMock.$executeRaw.mockResolvedValue(1);

      const result = await service.cancelPendingOrder('user-1', 'order-1');

      expect(result).toEqual({
        message: 'Order cancelled and reserved stock released',
        orderId: 'order-1',
        status: 'CANCELLED',
      });

      expect(txMock.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          userId: 'user-1',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
        },
        data: {
          status: 'CANCELLED',
        },
      });

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMyOrders', () => {
    it('returns orders list with pagination metadata', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'GRO-001',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          totalInPaise: 5000,
          createdAt: new Date(),
          items: [],
        },
      ];

      prismaMock.order.findMany.mockResolvedValue(mockOrders);
      prismaMock.order.count.mockResolvedValue(25);

      const result = await service.getMyOrders('user-1', { page: 2, limit: 10 });

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          skip: 10,
          take: 10,
        }),
      );

      expect(result).toEqual({
        orders: mockOrders,
        meta: {
          page: 2,
          limit: 10,
          total: 25,
          totalPages: 3,
        },
      });
    });
  });

  describe('expirePendingOrders', () => {
    it('finds expired pending orders, updates their status and releases reserved stock', async () => {
      prismaMock.order.findMany = vi.fn().mockResolvedValue([
        { id: 'expired-ord-1' },
      ]);

      txMock.order.updateMany.mockResolvedValue({ count: 1 });
      txMock.orderItem.findMany.mockResolvedValue([
        { productId: 'prod-1', productName: 'Milk', quantity: 3 },
      ]);
      txMock.$executeRaw.mockResolvedValue(1);

      const result = await service.expirePendingOrders();

      expect(result).toEqual({
        message: 'Expired pending orders processed',
        expiredCount: 1,
      });

      expect(txMock.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'expired-ord-1',
            status: 'PENDING_PAYMENT',
            paymentStatus: 'PENDING',
          }),
          data: {
            status: 'CANCELLED',
            paymentStatus: 'EXPIRED',
          },
        }),
      );

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('does nothing if no expired candidates found', async () => {
      prismaMock.order.findMany = vi.fn().mockResolvedValue([]);

      const result = await service.expirePendingOrders();

      expect(result).toEqual({
        message: 'Expired pending orders processed',
        expiredCount: 0,
      });

      expect(txMock.order.updateMany).not.toHaveBeenCalled();
      expect(txMock.$executeRaw).not.toHaveBeenCalled();
    });
  });
});

});