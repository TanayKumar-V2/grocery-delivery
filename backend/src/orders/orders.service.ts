import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { GetOrdersDto } from './dto/get-orders.dto.js';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: {
          id: dto.addressId,
          userId,
        },
      });

      if (!address) {
        throw new NotFoundException('Delivery address not found');
      }

      const cart = await tx.cart.findUnique({
        where: {
          userId,
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  inventory: true,
                },
              },
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Your cart is empty');
      }

      let subtotalInPaise = 0;
      let discountInPaise = 0;

      const orderItems: {
        productId: string;
        productName: string;
        sku: string;
        unit: string;
        unitPriceInPaise: number;
        quantity: number;
        lineTotalInPaise: number;
      }[] = [];

      for (const item of cart.items) {
        const product = item.product;
        const inventory = product.inventory;

        if (!product.isActive) {
          throw new BadRequestException(
            `${product.name} is no longer available`,
          );
        }

        if (!inventory) {
          throw new BadRequestException(
            `${product.name} has no inventory record`,
          );
        }

        const availableQuantity =
          inventory.quantity - inventory.reservedQuantity;

        if (availableQuantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}. ` +
              `Available: ${Math.max(0, availableQuantity)}`,
          );
        }

        const unitPriceInPaise =
          product.discountPriceInPaise !== null &&
          product.discountPriceInPaise > 0 &&
          product.discountPriceInPaise < product.priceInPaise
            ? product.discountPriceInPaise
            : product.priceInPaise;

        subtotalInPaise += product.priceInPaise * item.quantity;

        discountInPaise +=
          (product.priceInPaise - unitPriceInPaise) * item.quantity;

        orderItems.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unit: product.unit,
          unitPriceInPaise,
          quantity: item.quantity,
          lineTotalInPaise: unitPriceInPaise * item.quantity,
        });
      }

      for (const item of cart.items) {
        const updatedRows = await tx.$executeRaw`
          UPDATE "Inventory"
          SET
            "reservedQuantity" =
              "reservedQuantity" + ${item.quantity},
            "updatedAt" = NOW()
          WHERE
            "productId" = ${item.productId}
            AND (
              "quantity" - "reservedQuantity"
            ) >= ${item.quantity}
        `;

        if (updatedRows !== 1) {
          throw new BadRequestException(
            `Stock changed for ${item.product.name}. ` +
              'Please refresh your cart and try again.',
          );
        }
      }

      const deliveryFeeInPaise = 0;
      const taxInPaise = 0;

      const totalInPaise =
        subtotalInPaise - discountInPaise + deliveryFeeInPaise + taxInPaise;

      const orderNumber = `GRO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          addressId: address.id,
          expiresAt,

          subtotalInPaise,
          discountInPaise,
          deliveryFeeInPaise,
          taxInPaise,
          totalInPaise,

          recipientName: address.recipientName,
          phone: address.phone,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          latitude: address.latitude,
          longitude: address.longitude,

          items: {
            create: orderItems.map((item) => ({
              productName: item.productName,
              sku: item.sku,
              unit: item.unit,
              unitPriceInPaise: item.unitPriceInPaise,
              quantity: item.quantity,
              lineTotalInPaise: item.lineTotalInPaise,

              product: {
                connect: {
                  id: item.productId,
                },
              },
            })),
          },
        },
      });

      await tx.cartItem.deleteMany({
        where: {
          cartId: cart.id,
        },
      });

      return {
        message: 'Order created successfully',
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          subtotalInPaise: order.subtotalInPaise,
          discountInPaise: order.discountInPaise,
          deliveryFeeInPaise: order.deliveryFeeInPaise,
          taxInPaise: order.taxInPaise,
          totalInPaise: order.totalInPaise,
          items: orderItems,
        },
      };
    });
  }
  async cancelPendingOrder(userId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          userId,
        },
        include: {
          items: {
            select: {
              productId: true,
              quantity: true,
              productName: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status === 'CANCELLED') {
        return {
          message: 'Order is already cancelled',
          orderId: order.id,
        };
      }

      if (
        order.status !== 'PENDING_PAYMENT' ||
        order.paymentStatus !== 'PENDING'
      ) {
        throw new BadRequestException(
          'Only unpaid pending orders can be cancelled',
        );
      }

      const cancelled = await tx.order.updateMany({
        where: {
          id: order.id,
          userId,
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
        },
        data: {
          status: 'CANCELLED',
        },
      });

      if (cancelled.count !== 1) {
        throw new ConflictException(
          'The order status changed. Please refresh and try again.',
        );
      }

      for (const item of order.items) {
        if (!item.productId) {
          continue;
        }

        const releasedRows = await tx.$executeRaw`
        UPDATE "Inventory"
        SET
          "reservedQuantity" = "reservedQuantity" - ${item.quantity},
          "updatedAt" = NOW()
        WHERE
          "productId" = ${item.productId}
          AND "reservedQuantity" >= ${item.quantity}
      `;

        if (releasedRows !== 1) {
          throw new ConflictException(
            `Could not release reserved stock for ${item.productName}`,
          );
        }
      }

      return {
        message: 'Order cancelled and reserved stock released',
        orderId: order.id,
        status: 'CANCELLED',
      };
    });
  }
  async getMyOrders(userId: string, dto: GetOrdersDto) {
    const { page, limit } = dto;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          userId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,

          subtotalInPaise: true,
          discountInPaise: true,
          deliveryFeeInPaise: true,
          taxInPaise: true,
          totalInPaise: true,

          createdAt: true,

          items: {
            select: {
              id: true,
              productName: true,
              sku: true,
              unit: true,
              quantity: true,
              unitPriceInPaise: true,
              lineTotalInPaise: true,
            },
          },
        },
      }),

      this.prisma.order.count({
        where: {
          userId,
        },
      }),
    ]);

    return {
      orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  async expirePendingOrders() {
    const now = new Date();

    const expiredCandidates = await this.prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        expiresAt: {
          lte: now,
        },
      },
      select: {
        id: true,
      },
    });

    let expiredCount = 0;

    for (const candidate of expiredCandidates) {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.order.updateMany({
          where: {
            id: candidate.id,
            status: 'PENDING_PAYMENT',
            paymentStatus: 'PENDING',
            expiresAt: {
              lte: now,
            },
          },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'EXPIRED',
          },
        });

        if (result.count !== 1) {
          return;
        }

        const items = await tx.orderItem.findMany({
          where: {
            orderId: candidate.id,
          },
          select: {
            productId: true,
            productName: true,
            quantity: true,
          },
        });

        for (const item of items) {
          if (!item.productId) {
            continue;
          }

          const releasedRows = await tx.$executeRaw`
          UPDATE "Inventory"
          SET
            "reservedQuantity" = "reservedQuantity" - ${item.quantity},
            "updatedAt" = NOW()
          WHERE
            "productId" = ${item.productId}
            AND "reservedQuantity" >= ${item.quantity}
        `;

          if (releasedRows !== 1) {
            throw new Error(
              `Could not release reserved stock for ${item.productName}`,
            );
          }
        }

        expiredCount++;
      });
    }

    return {
      message: 'Expired pending orders processed',
      expiredCount,
    };
  }
}
