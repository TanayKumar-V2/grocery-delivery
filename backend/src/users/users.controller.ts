import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('count')
  async getUserCount() {
    const count = await this.usersService.getUserCount();

    return {
      count,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: Request) {
    return req.user;
  }
}