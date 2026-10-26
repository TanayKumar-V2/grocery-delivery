import Razorpay from 'razorpay';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { VerifyPaymentDto } from './dto/verify-payment.dto.js';

type RazorpayWebhookPayload = {
  id?: unknown;
  event_id?: unknown;
  event?: unknown;
  payload?: {
    payment?: {
      entity?: {
        id?: unknown;
        order_id?: unknown;
        amount?: unknown;
        currency?: unknown;
      };
    };
  };
};

@Injectable()
export class PaymentsService {
  private readonly razorpay: Razorpay;
  private readonly keyId: string;

  constructor(private readonly prisma: PrismaService) {
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const keyId = process.env.RAZORPAY_KEY_ID || (isTest ? 'rzp_test_dummy' : '');
    const keySecret = process.env.RAZORPAY_KEY_SECRET || (isTest ? 'dummy_test_secret' : '');

    if (!keyId || !keySecret) {
      throw new Error('Razorpay API credentials are not configured');
    }

    this.keyId = keyId;

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  async createGatewayOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        payments: {
          where: {
            status: 'CREATED',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.status !== 'PENDING_PAYMENT' ||
      order.paymentStatus !== 'PENDING'
    ) {
      throw new ConflictException('This order is not awaiting payment');
    }

    if (!order.expiresAt || order.expiresAt <= new Date()) {
      throw new ConflictException(
        'The payment window has expired. Please create a new order.',
      );
    }

    if (order.totalInPaise <= 0) {
      throw new ConflictException('The order total must be greater than zero');
    }

    const existingPayment = order.payments[0];

    if (existingPayment?.providerOrderId) {
      return {
        paymentId: existingPayment.id,
        razorpayKeyId: this.keyId,
        razorpayOrderId: existingPayment.providerOrderId,
        amount: existingPayment.amountInPaise,
        currency: existingPayment.currency,
        orderNumber: order.orderNumber,
      };
    }

    const gatewayOrder = await this.razorpay.orders.create({
      amount: order.totalInPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        internal_order_id: order.id,
        order_number: order.orderNumber,
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'RAZORPAY',
        providerOrderId: gatewayOrder.id,
        amountInPaise: order.totalInPaise,
        currency: 'INR',
        status: 'CREATED',
      },
    });

    return {
      paymentId: payment.id,
      razorpayKeyId: this.keyId,
      razorpayOrderId: gatewayOrder.id,
      amount: payment.amountInPaise,
      currency: payment.currency,
      orderNumber: order.orderNumber,
    };
  }

  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        provider: 'RAZORPAY',
        providerOrderId: dto.razorpay_order_id,
        order: {
          is: {
            userId,
          },
        },
      },
      include: {
        order: true,
      },
    });

    if (!payment || !payment.providerOrderId) {
      throw new NotFoundException('Payment order not found');
    }

    if (
      payment.providerPaymentId &&
      payment.providerPaymentId !== dto.razorpay_payment_id
    ) {
      throw new ConflictException(
        'A different payment is already associated with this order',
      );
    }

    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const secret = process.env.RAZORPAY_KEY_SECRET || (isTest ? 'dummy_test_secret' : '');

    if (!secret) {
      throw new Error('Razorpay secret is not configured');
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${payment.providerOrderId}|${dto.razorpay_payment_id}`)
      .digest();

    const receivedSignature = Buffer.from(dto.razorpay_signature, 'hex');

    const signaturesMatch =
      expectedSignature.length === receivedSignature.length &&
      timingSafeEqual(expectedSignature, receivedSignature);

    if (!signaturesMatch) {
      throw new UnauthorizedException('Payment signature verification failed');
    }

    await this.prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        providerPaymentId: dto.razorpay_payment_id,
        signatureVerified: true,
      },
    });

    return {
      verified: true,
      paymentId: payment.id,
      orderNumber: payment.order.orderNumber,
      message:
        'Payment signature verified. Gateway payment status must still be confirmed.',
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string, eventId?: string) {
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET || (isTest ? 'dummy_webhook_secret' : '');

    if (!webhookSecret) {
      throw new Error('Razorpay webhook secret is not configured');
    }

    if (!rawBody || rawBody.length === 0 || !signature || !signature.trim()) {
      throw new BadRequestException('Missing webhook body or required headers');
    }

    // Razorpay signature header must be a 64-character hex string (32 bytes HMAC-SHA256)
    if (!/^[a-f0-9]{64}$/i.test(signature.trim())) {
      throw new UnauthorizedException('Invalid Razorpay webhook signature format');
    }

    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest();

    const receivedSignature = Buffer.from(signature.trim(), 'hex');

    const signatureIsValid =
      receivedSignature.length === expectedSignature.length &&
      timingSafeEqual(expectedSignature, receivedSignature);

    if (!signatureIsValid) {
      throw new UnauthorizedException('Invalid Razorpay webhook signature');
    }

    let payload: RazorpayWebhookPayload;

    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    if (typeof payload.event !== 'string' || !payload.event.trim()) {
      throw new BadRequestException('Missing webhook event type');
    }

    // Resolve eventId: header or payload.id or payload.event_id or deterministic hash
    const resolvedEventId =
      (eventId && eventId.trim()) ||
      (typeof payload.id === 'string' && payload.id.trim()) ||
      (typeof payload.event_id === 'string' && payload.event_id.trim()) ||
      `evt_${createHash('sha256').update(rawBody).digest('hex').slice(0, 32)}`;

    await this.prisma.paymentWebhookEvent.createMany({
      data: [
        {
          eventId: resolvedEventId,
          eventType: payload.event,
          payload: payload as any,
          signatureVerified: true,
        },
      ],
      skipDuplicates: true,
    });

    return this.processVerifiedWebhookEvent(resolvedEventId, payload.event, payload);
  }

  private async processVerifiedWebhookEvent(
    eventId: string,
    eventType: string,
    payload: RazorpayWebhookPayload,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const eventRows = await tx.$queryRaw<
        Array<{ id: string; processed: boolean }>
      >`
      SELECT "id", "processed"
      FROM "PaymentWebhookEvent"
      WHERE "eventId" = ${eventId}
      FOR UPDATE
    `;

      if (eventRows.length === 0) {
        throw new NotFoundException('Webhook event not found');
      }

      if (eventRows[0].processed) {
        return {
          received: true,
          duplicate: true,
          message: 'Webhook event was already processed',
        };
      }

      let linkedPaymentId: string | null = null;
      let message = 'Webhook event recorded; no payment change required';

      if (eventType === 'payment.captured' || eventType === 'payment.failed') {
        const entity = payload.payload?.payment?.entity;

        if (
          !entity ||
          typeof entity.id !== 'string' ||
          typeof entity.amount !== 'number' ||
          typeof entity.currency !== 'string'
        ) {
          throw new BadRequestException('Invalid Razorpay payment entity');
        }

        const gatewayOrderId =
          typeof entity.order_id === 'string' ? entity.order_id : null;

        if (!gatewayOrderId) {
          message = 'Payment event has no gateway order ID';
        } else {
          const payment = await tx.payment.findUnique({
            where: {
              providerOrderId: gatewayOrderId,
            },
            include: {
              order: {
                include: {
                  items: true,
                },
              },
            },
          });

          if (!payment) {
            message = 'No matching local payment was found';
          } else {
            linkedPaymentId = payment.id;

            if (
              entity.amount !== payment.amountInPaise ||
              entity.currency !== payment.currency
            ) {
              message =
                'Amount/currency mismatch; event recorded for reconciliation';
            } else if (
              payment.providerPaymentId &&
              payment.providerPaymentId !== entity.id
            ) {
              message =
                'Different payment ID already exists; manual reconciliation required';
            } else if (eventType === 'payment.failed') {
              if (
                payment.status !== 'CAPTURED' &&
                payment.status !== 'REFUNDED' &&
                payment.status !== 'PARTIALLY_REFUNDED'
              ) {
                await tx.payment.update({
                  where: {
                    id: payment.id,
                  },
                  data: {
                    status: 'FAILED',
                  },
                });

                message =
                  'Failed payment recorded; order remains available for retry';
              } else {
                message =
                  'Failure event ignored for an already captured or refunded payment';
              }
            } else if (
              payment.status === 'REFUNDED' ||
              payment.status === 'PARTIALLY_REFUNDED'
            ) {
              message =
                'Captured event received for a refunded payment; reconciliation required';
            } else if (payment.status === 'CAPTURED') {
              message = 'Payment was already captured; no stock changes made';
            } else {
              await tx.payment.update({
                where: {
                  id: payment.id,
                },
                data: {
                  status: 'CAPTURED',
                  providerPaymentId: entity.id,
                  capturedAt: new Date(),
                },
              });

              const order = payment.order;
              const now = new Date();

              const canFulfil =
                order.status === 'PENDING_PAYMENT' &&
                order.paymentStatus === 'PENDING' &&
                order.expiresAt !== null &&
                order.expiresAt > now &&
                order.items.every((item) => item.productId !== null);

              if (canFulfil) {
                const claimed = await tx.order.updateMany({
                  where: {
                    id: order.id,
                    status: 'PENDING_PAYMENT',
                    paymentStatus: 'PENDING',
                    expiresAt: {
                      gt: now,
                    },
                  },
                  data: {
                    status: 'CONFIRMED',
                    paymentStatus: 'PAID',
                  },
                });

                if (claimed.count === 1) {
                  const sortedItems = [...order.items].sort((a, b) =>
                    (a.productId ?? '').localeCompare(b.productId ?? ''),
                  );

                  for (const item of sortedItems) {
                    if (!item.productId) {
                      throw new ConflictException(
                        `Missing product reference for ${item.productName}`,
                      );
                    }

                    const changedRows = await tx.$executeRaw`
                    UPDATE "Inventory"
                    SET
                      "quantity" = "quantity" - ${item.quantity},
                      "reservedQuantity" =
                        "reservedQuantity" - ${item.quantity},
                      "updatedAt" = NOW()
                    WHERE
                      "productId" = ${item.productId}
                      AND "quantity" >= ${item.quantity}
                      AND "reservedQuantity" >= ${item.quantity}
                  `;

                    if (changedRows !== 1) {
                      throw new ConflictException(
                        `Could not finalize inventory for ${item.productName}`,
                      );
                    }
                  }

                  message =
                    'Payment captured, order confirmed and inventory finalized';
                } else {
                  await tx.order.updateMany({
                    where: {
                      id: order.id,
                      paymentStatus: {
                        not: 'REFUNDED',
                      },
                    },
                    data: {
                      paymentStatus: 'PAID',
                    },
                  });

                  message =
                    'Payment captured after order state changed; refund reconciliation required';
                }
              } else {
                if (order.status === 'PENDING_PAYMENT') {
                  const cancelled = await tx.order.updateMany({
                    where: {
                      id: order.id,
                      status: 'PENDING_PAYMENT',
                      paymentStatus: 'PENDING',
                    },
                    data: {
                      status: 'CANCELLED',
                      paymentStatus: 'PAID',
                    },
                  });

                  if (cancelled.count === 1) {
                    const sortedItems = [...order.items].sort((a, b) =>
                      (a.productId ?? '').localeCompare(b.productId ?? ''),
                    );

                    for (const item of sortedItems) {
                      if (!item.productId) {
                        continue;
                      }

                      const releasedRows = await tx.$executeRaw`
                      UPDATE "Inventory"
                      SET
                        "reservedQuantity" =
                          "reservedQuantity" - ${item.quantity},
                        "updatedAt" = NOW()
                      WHERE
                        "productId" = ${item.productId}
                        AND "reservedQuantity" >= ${item.quantity}
                    `;

                      if (releasedRows !== 1) {
                        throw new ConflictException(
                          `Could not release reservation for ${item.productName}`,
                        );
                      }
                    }
                  }
                } else {
                  await tx.order.updateMany({
                    where: {
                      id: order.id,
                      paymentStatus: {
                        not: 'REFUNDED',
                      },
                    },
                    data: {
                      paymentStatus: 'PAID',
                    },
                  });
                }

                message =
                  'Payment captured, but order could not be fulfilled; refund reconciliation required';
              }
            }
          }
        }
      }

      await tx.paymentWebhookEvent.update({
        where: {
          eventId,
        },
        data: {
          paymentId: linkedPaymentId,
          processed: true,
          processedAt: new Date(),
        },
      });

      return {
        received: true,
        duplicate: false,
        message,
      };
    });
  }
}
