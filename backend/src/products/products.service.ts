import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { GetProductsDto } from './dto/get-products.dto.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(dto: CreateProductDto) {
    const category = await this.prisma.category.findUnique({
      where: {
        id: dto.categoryId,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const existingSku = await this.prisma.product.findUnique({
      where: {
        sku: dto.sku,
      },
    });

    if (existingSku) {
      throw new ConflictException('A product with this SKU already exists');
    }

    const slug = `${dto.name}-${dto.sku}`
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (
      dto.discountPriceInPaise !== undefined &&
      dto.discountPriceInPaise >= dto.priceInPaise
    ) {
      throw new ConflictException(
        'Discount price must be lower than the original price',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          slug,
          description: dto.description,
          sku: dto.sku,
          brand: dto.brand,
          priceInPaise: dto.priceInPaise,
          discountPriceInPaise: dto.discountPriceInPaise,
          unit: dto.unit,
          weightGrams: dto.weightGrams,

          inventory: {
            create: {
              quantity: dto.quantity,
              lowStockThreshold: dto.lowStockThreshold ?? 5,
            },
          },
        },
        include: {
          inventory: true,
          category: true,
        },
      });

      return product;
    });
  }

  async getProducts(dto: GetProductsDto) {
    const { page, limit, categoryId } = dto;

    const skip = (page - 1) * limit;

    const where = {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          category: true,
          inventory: true,
        },
      }),

      this.prisma.product.count({
        where,
      }),
    ]);

    return {
      data: products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        sku: product.sku,
        brand: product.brand,
        priceInPaise: product.priceInPaise,
        discountPriceInPaise: product.discountPriceInPaise,
        unit: product.unit,
        weightGrams: product.weightGrams,

        category: {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        },

        inStock:
          (product.inventory?.quantity ?? 0) -
            (product.inventory?.reservedQuantity ?? 0) >
          0,

        availableQuantity:
          (product.inventory?.quantity ?? 0) -
          (product.inventory?.reservedQuantity ?? 0),
      })),

      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        slug,
      },
      include: {
        category: true,
        inventory: true,
      },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }

    const availableQuantity =
      (product.inventory?.quantity ?? 0) -
      (product.inventory?.reservedQuantity ?? 0);

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      sku: product.sku,
      brand: product.brand,
      priceInPaise: product.priceInPaise,
      discountPriceInPaise: product.discountPriceInPaise,
      unit: product.unit,
      weightGrams: product.weightGrams,

      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
      },

      inStock: availableQuantity > 0,
      availableQuantity,
    };
  }
}
