import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoriesService } from './categories.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      category: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('createCategory', () => {
    it('throws ConflictException if category name already exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Dairy' });

      await expect(
        service.createCategory({ name: 'Dairy' }),
      ).rejects.toThrow('A category with this name already exists');
    });

    it('throws ConflictException if category slug already exists', async () => {
      mockPrisma.category.findUnique
        .mockResolvedValueOnce(null) // by name
        .mockResolvedValueOnce({ id: 'cat-1', slug: 'dairy-products' }); // by slug

      await expect(
        service.createCategory({ name: 'Dairy Products' }),
      ).rejects.toThrow('A category with this slug already exists');
    });

    it('creates category successfully with trimmed name and slug', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue({
        id: 'cat-new',
        name: 'Fresh Vegetables',
        slug: 'fresh-vegetables',
      });

      const result = await service.createCategory({
        name: '  Fresh Vegetables  ',
        description: 'Organic and local vegetables',
      });

      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: {
          name: 'Fresh Vegetables',
          slug: 'fresh-vegetables',
          description: 'Organic and local vegetables',
        },
      });
      expect(result.id).toBe('cat-new');
    });
  });
});
