import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { ProductsService } from './products.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(async () => {
    mockTx = {
      product: {
        create: vi.fn(),
      },
    };

    mockPrisma = {
      category: {
        findUnique: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('createProduct', () => {
    it('throws NotFoundException if category is not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.createProduct({
          name: 'Apple',
          sku: 'APL-001',
          categoryId: 'cat-not-found',
          priceInPaise: 10000,
          description: 'Fresh apples',
          unit: 'kg',
          quantity: 50,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if SKU already exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'existing-p' });

      await expect(
        service.createProduct({
          name: 'Apple',
          sku: 'APL-001',
          categoryId: 'cat-1',
          priceInPaise: 10000,
          description: 'Fresh apples',
          unit: 'kg',
          quantity: 50,
        }),
      ).rejects.toThrow('A product with this SKU already exists');
    });

    it('throws ConflictException if discount price is >= regular price', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.createProduct({
          name: 'Apple',
          sku: 'APL-001',
          categoryId: 'cat-1',
          priceInPaise: 10000,
          discountPriceInPaise: 10000, // equal
          description: 'Fresh apples',
          unit: 'kg',
          quantity: 50,
        }),
      ).rejects.toThrow('Discount price must be lower than the original price');
    });

    it('creates product and inventory with slug', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.product.findUnique.mockResolvedValue(null);

      mockTx.product.create.mockResolvedValue({
        id: 'prod-1',
        name: 'Red Apple',
        slug: 'red-apple-apl-001',
        sku: 'APL-001',
      });

      const result = await service.createProduct({
        name: 'Red Apple',
        sku: 'APL-001',
        categoryId: 'cat-1',
        priceInPaise: 10000,
        discountPriceInPaise: 8000,
        description: 'Fresh red apples',
        unit: 'kg',
        quantity: 50,
      });

      expect(mockTx.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'red-apple-apl-001',
            priceInPaise: 10000,
            discountPriceInPaise: 8000,
            inventory: {
              create: {
                quantity: 50,
                lowStockThreshold: 5,
              },
            },
          }),
        }),
      );
      expect(result.id).toBe('prod-1');
    });
  });

  describe('getProducts', () => {
    it('throws BadRequestException if minPrice > maxPrice', async () => {
      await expect(
        service.getProducts({ page: 1, limit: 10, minPrice: 500, maxPrice: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('queries active products with filters, sorting, and calculates pagination and stock', async () => {
      const mockProductList = [
        {
          id: 'p-1',
          name: 'Banana',
          slug: 'banana',
          description: 'Fresh bananas',
          sku: 'BAN-001',
          brand: 'FruitCo',
          priceInPaise: 4000,
          discountPriceInPaise: null,
          unit: 'dozen',
          weightGrams: 1000,
          category: { id: 'cat-1', name: 'Fruits', slug: 'fruits' },
          inventory: { quantity: 15, reservedQuantity: 5 },
        },
      ];

      mockPrisma.product.findMany.mockResolvedValue(mockProductList);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.getProducts({
        page: 1,
        limit: 10,
        search: 'Banana',
        sortBy: 'price',
        sortOrder: 'asc',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'p-1',
        availableQuantity: 10,
        inStock: true,
      });
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('getProductBySlug', () => {
    it('throws NotFoundException if product is not found or inactive', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.getProductBySlug('nonexistent')).rejects.toThrow(NotFoundException);

      mockPrisma.product.findUnique.mockResolvedValue({ id: 'p-1', isActive: false });

      await expect(service.getProductBySlug('inactive-product')).rejects.toThrow(NotFoundException);
    });

    it('returns product details with availableQuantity and inStock boolean', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'p-1',
        name: 'Orange',
        slug: 'orange',
        priceInPaise: 6000,
        discountPriceInPaise: 5000,
        isActive: true,
        category: { id: 'c-1', name: 'Citrus', slug: 'citrus' },
        inventory: { quantity: 8, reservedQuantity: 3 },
      });

      const result = await service.getProductBySlug('orange');

      expect(result).toMatchObject({
        id: 'p-1',
        name: 'Orange',
        availableQuantity: 5,
        inStock: true,
      });
    });
  });
});
