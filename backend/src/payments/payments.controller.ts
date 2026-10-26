import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest, Request } from '@nestjs/common';

import { PaymentsService } from './payments.service.js';
import { VerifyPaymentDto } from './dto/verify-payment.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @RateLimit(20, 60)
  @Post('orders/:orderId')
  async createGatewayOrder(
    @Req() req: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.createGatewayOrder(
      req.user.userId,
      orderId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit(20, 60)
  @Post('verify')
  async verifyPayment(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyPayment(
      req.user.userId,
      dto,
    );
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException(
        'Raw webhook body is unavailable',
      );
    }

    return this.paymentsService.handleWebhook(
      req.rawBody,
      signature ?? '',
      eventId,
    );
  }
}
