import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let paymentsServiceMock: any;

  beforeEach(async () => {
    paymentsServiceMock = {
      createGatewayOrder: vi.fn(),
      verifyPayment: vi.fn(),
      handleWebhook: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: paymentsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('createGatewayOrder calls service with authenticated userId and orderId', async () => {
    const req = { user: { userId: 'user-123', email: 'test@example.com', role: 'CUSTOMER' } } as any;
    paymentsServiceMock.createGatewayOrder.mockResolvedValue({ paymentId: 'p-1' });

    const result = await controller.createGatewayOrder(req, 'order-123');

    expect(paymentsServiceMock.createGatewayOrder).toHaveBeenCalledWith('user-123', 'order-123');
    expect(result).toEqual({ paymentId: 'p-1' });
  });

  it('verifyPayment calls service with authenticated userId and dto', async () => {
    const req = { user: { userId: 'user-123', email: 'test@example.com', role: 'CUSTOMER' } } as any;
    const dto = {
      razorpay_order_id: 'order_123',
      razorpay_payment_id: 'pay_123',
      razorpay_signature: 'sig_123',
    };
    paymentsServiceMock.verifyPayment.mockResolvedValue({ verified: true });

    const result = await controller.verifyPayment(req, dto);

    expect(paymentsServiceMock.verifyPayment).toHaveBeenCalledWith('user-123', dto);
    expect(result).toEqual({ verified: true });
  });

  it('handleWebhook throws BadRequestException if rawBody is not available', async () => {
    const req = { rawBody: undefined } as any;

    await expect(
      controller.handleWebhook(req, 'sig-123', 'evt-123'),
    ).rejects.toThrow(BadRequestException);
  });

  it('handleWebhook forwards rawBody, signature, and eventId to paymentsService', async () => {
    const rawBody = Buffer.from('{"event":"payment.captured"}');
    const req = { rawBody } as any;
    paymentsServiceMock.handleWebhook.mockResolvedValue({ received: true });

    const result = await controller.handleWebhook(req, 'sig-123', 'evt-123');

    expect(paymentsServiceMock.handleWebhook).toHaveBeenCalledWith(rawBody, 'sig-123', 'evt-123');
    expect(result).toEqual({ received: true });
  });
});
