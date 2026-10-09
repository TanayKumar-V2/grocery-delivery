import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { Request } from 'express';

import { CartService } from './cart.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getCart(@Req() req: AuthenticatedRequest) {
    return this.cartService.getCart(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('items')
  async addItem(@Req() req: AuthenticatedRequest, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('items/:id')
  async updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(req.user.userId, itemId, dto.quantity);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('items/:id')
  async removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') itemId: string,
  ) {
    return this.cartService.removeItem(req.user.userId, itemId);
  }
}
