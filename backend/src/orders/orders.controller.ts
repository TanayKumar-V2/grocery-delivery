import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  Get,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { GetOrdersDto } from './dto/get-orders.dto.js';

import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(req.user.userId, dto);
  }

  @Patch(':id/cancel')
  async cancelOrder(
    @Req() req: AuthenticatedRequest,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.cancelPendingOrder(req.user.userId, orderId);
  }

  @Get()
  async getMyOrders(
    @Req() req: AuthenticatedRequest,
    @Query() dto: GetOrdersDto,
  ) {
    return this.ordersService.getMyOrders(req.user.userId, dto);
  }
}
