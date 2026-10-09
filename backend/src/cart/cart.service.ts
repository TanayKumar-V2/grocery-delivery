import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async addItem(userId: string, dto: AddCartItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: {
          id: dto.productId,
        },
        include: {
          inventory: true,
        },
      });

      if (!product || !product.isActive) {
        throw new NotFoundException('Product not found');
      }

      const availableQuantity =
        (product.inventory?.quantity ?? 0) -
        (product.inventory?.reservedQuantity ?? 0);

      if (availableQuantity <= 0) {
        throw new BadRequestException('This product is currently out of stock');
      }

      const cart = await tx.cart.upsert({
        where: {
          userId,
        },
        update: {},
        create: {
          userId,
        },
      });

      const existingItem = await tx.cartItem.findUnique({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId: product.id,
          },
        },
      });

      const nextQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

      if (nextQuantity > 99) {
        throw new BadRequestException(
          'You can add at most 99 units of one product',
        );
      }

      if (nextQuantity > availableQuantity) {
        throw new BadRequestException(
          `Only ${availableQuantity} units are currently available`,
        );
      }

      const cartItem = await tx.cartItem.upsert({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId: product.id,
          },
        },

        update: {
          quantity: nextQuantity,
        },

        create: {
          cartId: cart.id,
          productId: product.id,
          quantity: dto.quantity,
        },
      });

      return {
        message: 'Product added to cart successfully',
        item: {
          id: cartItem.id,
          productId: product.id,
          name: product.name,
          slug: product.slug,
          quantity: cartItem.quantity,
          unit: product.unit,
          priceInPaise: product.priceInPaise,
          discountPriceInPaise: product.discountPriceInPaise,
          availableQuantity,
        },
      };
    });
  }
  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        userId,
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
                inventory: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    // Return an empty cart if the customer has not added anything
    if (!cart) {
      return {
        items: [],
        summary: {
          itemCount: 0,
          totalQuantity: 0,
          subtotalInPaise: 0,
        },
      };
    }

    const items = cart.items.map((item) => {
      const product = item.product;

      const unitPriceInPaise =
        product.discountPriceInPaise !== null &&
        product.discountPriceInPaise < product.priceInPaise
          ? product.discountPriceInPaise
          : product.priceInPaise;

      const availableQuantity =
        (product.inventory?.quantity ?? 0) -
        (product.inventory?.reservedQuantity ?? 0);

      const lineTotalInPaise = unitPriceInPaise * item.quantity;

      return {
        id: item.id,
        quantity: item.quantity,

        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          unit: product.unit,
          priceInPaise: product.priceInPaise,
          discountPriceInPaise: product.discountPriceInPaise,
          category: product.category.name,
        },

        unitPriceInPaise,
        lineTotalInPaise,
        availableQuantity,

        inStock: product.isActive && availableQuantity > 0,
        hasEnoughStock: product.isActive && availableQuantity >= item.quantity,
      };
    });

    const subtotalInPaise = items.reduce(
      (total, item) => total + item.lineTotalInPaise,
      0,
    );

    const totalQuantity = items.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    return {
      items,
      summary: {
        itemCount: items.length,
        totalQuantity,
        subtotalInPaise,
      },
    };
  }
  async updateItem(userId: string, itemId: string, quantity: number) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.cartItem.findUnique({
        where: {
          id: itemId,
        },
        include: {
          cart: true,
          product: {
            include: {
              inventory: true,
            },
          },
        },
      });

      if (!item || item.cart.userId !== userId) {
        throw new NotFoundException('Cart item not found');
      }

      if (!item.product.isActive) {
        throw new BadRequestException('This product is currently unavailable');
      }

      const availableQuantity =
        (item.product.inventory?.quantity ?? 0) -
        (item.product.inventory?.reservedQuantity ?? 0);

      if (quantity > availableQuantity) {
        throw new BadRequestException(
          `Only ${availableQuantity} units are currently available`,
        );
      }

      const updatedItem = await tx.cartItem.update({
        where: {
          id: itemId,
        },
        data: {
          quantity,
        },
      });

      return {
        message: 'Cart quantity updated successfully',
        item: {
          id: updatedItem.id,
          productId: item.product.id,
          name: item.product.name,
          quantity: updatedItem.quantity,
          availableQuantity,
        },
      };
    });
  }
  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: {
        id: itemId,
      },
      include: {
        cart: true,
      },
    });

    if (!item || item.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({
      where: {
        id: itemId,
      },
    });

    return {
      message: 'Product removed from cart successfully',
    };
  }
}
