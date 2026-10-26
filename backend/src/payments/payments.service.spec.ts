import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PaymentsService } from './payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockKeyId = 'rzp_test_dummy';
  const mockKeySecret = 'dummy_test_secret_for_sha256';
  const mockWebhookSecret = 'dummy_webhook_secret_for_sha256';

  let mockPrisma: any;
  let mockTx: any;

  beforeEach(async () => {
    vi.stubEnv('RAZORPAY_KEY_ID', mockKeyId);
    vi.stubEnv('RAZORPAY_KEY_SECRET', mockKeySecret);
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', mockWebhookSecret);

    mockTx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      payment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      order: {
        updateMany: vi.fn(),
      },
      paymentWebhookEvent: {
        update: vi.fn(),
      },
    };

    mockPrisma = {
      order: {
        findFirst: vi.fn(),
      },
      payment: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      paymentWebhookEvent: {
        createMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('createGatewayOrder', () => {
    it('throws NotFoundException if order does not exist or does not belong to user', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createGatewayOrder('user-1', 'order-not-found'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if order is not pending payment', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      });

      await expect(
        service.createGatewayOrder('user-1', 'order-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if order payment window has expired', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        expiresAt: new Date(Date.now() - 1000), // in the past
      });

      await expect(
        service.createGatewayOrder('user-1', 'order-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('returns existing payment details if a created gateway order already exists (idempotency)', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'GRO-001',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        totalInPaise: 50000,
        expiresAt: new Date(Date.now() + 60000),
        payments: [
          {
            id: 'pay-existing-1',
            providerOrderId: 'order_rzp_existing_123',
            amountInPaise: 50000,
            currency: 'INR',
            status: 'CREATED',
          },
        ],
      });

      const result = await service.createGatewayOrder('user-1', 'order-1');

      expect(result).toEqual({
        paymentId: 'pay-existing-1',
        razorpayKeyId: mockKeyId,
        razorpayOrderId: 'order_rzp_existing_123',
        amount: 50000,
        currency: 'INR',
        orderNumber: 'GRO-001',
      });
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('creates a new razorpay order and payment record when none exists', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'GRO-001',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        totalInPaise: 25000,
        expiresAt: new Date(Date.now() + 60000),
        payments: [],
      });

      // Mock razorpay.orders.create
      const razorpayOrdersMock = vi.fn().mockResolvedValue({
        id: 'order_rzp_new_999',
        amount: 25000,
        currency: 'INR',
      });
      (service as any).razorpay.orders.create = razorpayOrdersMock;

      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-new-1',
        orderId: 'order-1',
        providerOrderId: 'order_rzp_new_999',
        amountInPaise: 25000,
        currency: 'INR',
      });

      const result = await service.createGatewayOrder('user-1', 'order-1');

      expect(razorpayOrdersMock).toHaveBeenCalledWith({
        amount: 25000,
        currency: 'INR',
        receipt: 'GRO-001',
        notes: {
          internal_order_id: 'order-1',
          order_number: 'GRO-001',
        },
      });

      expect(result).toEqual({
        paymentId: 'pay-new-1',
        razorpayKeyId: mockKeyId,
        razorpayOrderId: 'order_rzp_new_999',
        amount: 25000,
        currency: 'INR',
        orderNumber: 'GRO-001',
      });
    });
  });

  describe('verifyPayment', () => {
    it('throws NotFoundException if payment is not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyPayment('user-1', {
          razorpay_order_id: 'order_rzp_unknown',
          razorpay_payment_id: 'pay_rzp_123',
          razorpay_signature: 'a'.repeat(64),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if payment is already associated with another providerPaymentId', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        providerOrderId: 'order_rzp_123',
        providerPaymentId: 'pay_different_previous',
        order: { userId: 'user-1' },
      });

      await expect(
        service.verifyPayment('user-1', {
          razorpay_order_id: 'order_rzp_123',
          razorpay_payment_id: 'pay_new_id',
          razorpay_signature: 'a'.repeat(64),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws UnauthorizedException if signature does not match', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        providerOrderId: 'order_rzp_123',
        order: { userId: 'user-1' },
      });

      const invalidSig = 'b'.repeat(64);

      await expect(
        service.verifyPayment('user-1', {
          razorpay_order_id: 'order_rzp_123',
          razorpay_payment_id: 'pay_rzp_123',
          razorpay_signature: invalidSig,
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });

    it('successfully verifies signature and updates payment without marking order confirmed', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        providerOrderId: 'order_rzp_123',
        order: { userId: 'user-1', orderNumber: 'GRO-001' },
      });

      const orderId = 'order_rzp_123';
      const paymentId = 'pay_rzp_123';
      const validSig = createHmac('sha256', mockKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockPrisma.payment.update.mockResolvedValue({ id: 'pay-1' });

      const result = await service.verifyPayment('user-1', {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig,
      });

      expect(result.verified).toBe(true);
      expect(result.orderNumber).toBe('GRO-001');
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: {
          providerPaymentId: paymentId,
          signatureVerified: true,
        },
      });
      // Verification alone must NOT mark order confirmed or change order table
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    const createWebhookSignature = (body: Buffer | string) =>
      createHmac('sha256', mockWebhookSecret).update(body).digest('hex');

    it('throws BadRequestException if body or signature is missing', async () => {
      await expect(
        service.handleWebhook(Buffer.from(''), ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException if signature format is invalid', async () => {
      await expect(
        service.handleWebhook(Buffer.from('{}'), 'not-a-valid-hex-64-signature'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if signature HMAC does not match body', async () => {
      const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
      const wrongSig = 'c'.repeat(64);

      await expect(
        service.handleWebhook(body, wrongSig),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException if body is not valid JSON', async () => {
      const invalidJsonBody = Buffer.from('this is not json');
      const sig = createWebhookSignature(invalidJsonBody);

      await expect(
        service.handleWebhook(invalidJsonBody, sig),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if event type is missing', async () => {
      const body = Buffer.from(JSON.stringify({}));
      const sig = createWebhookSignature(body);

      await expect(
        service.handleWebhook(body, sig),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles duplicate webhook event idempotently', async () => {
      const payload = {
        id: 'evt_dup_123',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              order_id: 'order_123',
              amount: 5000,
              currency: 'INR',
            },
          },
        },
      };
      const body = Buffer.from(JSON.stringify(payload));
      const sig = createWebhookSignature(body);

      mockTx.$queryRaw.mockResolvedValue([{ id: 'ev-row-1', processed: true }]);

      const result = await service.handleWebhook(body, sig, 'evt_dup_123');

      expect(result).toEqual({
        received: true,
        duplicate: true,
        message: 'Webhook event was already processed',
      });
      // Should not touch payment or order
      expect(mockTx.payment.update).not.toHaveBeenCalled();
      expect(mockTx.order.updateMany).not.toHaveBeenCalled();
    });

    it('processes payment.captured: confirms order and decrements inventory when order is eligible', async () => {
      const payload = {
        id: 'evt_cap_001',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_999',
              order_id: 'order_rzp_gateway_1',
              amount: 5000,
              currency: 'INR',
            },
          },
        },
      };
      const body = Buffer.from(JSON.stringify(payload));
      const sig = createWebhookSignature(body);

      // Webhook event is not yet processed
      mockTx.$queryRaw.mockResolvedValue([{ id: 'ev-row-1', processed: false }]);

      mockTx.payment.findUnique.mockResolvedValue({
        id: 'pay-local-1',
        amountInPaise: 5000,
        currency: 'INR',
        status: 'CREATED',
        order: {
          id: 'ord-local-1',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          expiresAt: new Date(Date.now() + 100000),
          items: [
            {
              productId: 'prod-1',
              productName: 'Tomatoes',
              quantity: 2,
            },
          ],
        },
      });

      mockTx.order.updateMany.mockResolvedValue({ count: 1 });
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.handleWebhook(body, sig, 'evt_cap_001');

      expect(result.duplicate).toBe(false);
      expect(result.message).toContain('Payment captured, order confirmed and inventory finalized');

      // Payment updated to CAPTURED
      expect(mockTx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-local-1' },
        data: expect.objectContaining({
          status: 'CAPTURED',
          providerPaymentId: 'pay_rzp_999',
        }),
      });

      // Order claimed and confirmed
      expect(mockTx.order.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'ord-local-1',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
        }),
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
      });

      // Inventory quantity and reservedQuantity decremented
      expect(mockTx.$executeRaw).toHaveBeenCalled();

      // Webhook event marked processed
      expect(mockTx.paymentWebhookEvent.update).toHaveBeenCalledWith({
        where: { eventId: 'evt_cap_001' },
        data: expect.objectContaining({
          paymentId: 'pay-local-1',
          processed: true,
        }),
      });
    });

    it('processes late payment.captured after order cancellation or expiry: routes to refund reconciliation and does NOT confirm order', async () => {
      const payload = {
        id: 'evt_cap_late',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_late',
              order_id: 'order_rzp_gateway_2',
              amount: 5000,
              currency: 'INR',
            },
          },
        },
      };
      const body = Buffer.from(JSON.stringify(payload));
      const sig = createWebhookSignature(body);

      mockTx.$queryRaw.mockResolvedValue([{ id: 'ev-row-1', processed: false }]);

      // Order is already CANCELLED
      mockTx.payment.findUnique.mockResolvedValue({
        id: 'pay-local-2',
        amountInPaise: 5000,
        currency: 'INR',
        status: 'CREATED',
        order: {
          id: 'ord-local-2',
          status: 'CANCELLED',
          paymentStatus: 'EXPIRED',
          expiresAt: new Date(Date.now() - 50000), // expired
          items: [{ productId: 'prod-1', productName: 'Tomatoes', quantity: 2 }],
        },
      });

      mockTx.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.handleWebhook(body, sig, 'evt_cap_late');

      expect(result.message).toContain('refund reconciliation required');
      // Must NOT decrement stock on inventory
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
      // Payment marked CAPTURED so record exists
      expect(mockTx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-local-2' },
          data: expect.objectContaining({ status: 'CAPTURED' }),
        }),
      );
      // Order status NOT set to CONFIRMED
      expect(mockTx.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'ord-local-2', paymentStatus: { not: 'REFUNDED' } },
        data: { paymentStatus: 'PAID' },
      });
    });

    it('processes payment.failed: records FAILED status without touching inventory', async () => {
      const payload = {
        id: 'evt_fail_1',
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_failed_1',
              order_id: 'order_rzp_fail',
              amount: 5000,
              currency: 'INR',
            },
          },
        },
      };
      const body = Buffer.from(JSON.stringify(payload));
      const sig = createWebhookSignature(body);

      mockTx.$queryRaw.mockResolvedValue([{ id: 'ev-row-1', processed: false }]);

      mockTx.payment.findUnique.mockResolvedValue({
        id: 'pay-local-3',
        amountInPaise: 5000,
        currency: 'INR',
        status: 'CREATED',
        order: {
          id: 'ord-local-3',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          items: [],
        },
      });

      const result = await service.handleWebhook(body, sig, 'evt_fail_1');

      expect(result.message).toContain('Failed payment recorded');
      expect(mockTx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-local-3' },
        data: { status: 'FAILED' },
      });
      // Order remains available for retry; inventory untouched
      expect(mockTx.order.updateMany).not.toHaveBeenCalled();
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects event with amount or currency mismatch without modifying payment', async () => {
      const payload = {
        id: 'evt_mismatch',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_mismatch',
              order_id: 'order_rzp_mismatch',
              amount: 99999, // mismatch!
              currency: 'INR',
            },
          },
        },
      };
      const body = Buffer.from(JSON.stringify(payload));
      const sig = createWebhookSignature(body);

      mockTx.$queryRaw.mockResolvedValue([{ id: 'ev-row-1', processed: false }]);

      mockTx.payment.findUnique.mockResolvedValue({
        id: 'pay-local-4',
        amountInPaise: 5000, // expected 5000
        currency: 'INR',
        status: 'CREATED',
        order: { id: 'ord-local-4', status: 'PENDING_PAYMENT', items: [] },
      });

      const result = await service.handleWebhook(body, sig, 'evt_mismatch');

      expect(result.message).toContain('Amount/currency mismatch');
      expect(mockTx.payment.update).not.toHaveBeenCalled();
      expect(mockTx.order.updateMany).not.toHaveBeenCalled();
    });
  });
});
