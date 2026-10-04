import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(dto: CreateCategoryDto) {
    const name = dto.name.trim();

    const existingCategory = await this.prisma.category.findUnique({
      where: {
        name,
      },
    });

    if (existingCategory) {
      throw new ConflictException(
        'A category with this name already exists',
      );
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const existingSlug = await this.prisma.category.findUnique({
      where: {
        slug,
      },
    });

    if (existingSlug) {
      throw new ConflictException(
        'A category with this slug already exists',
      );
    }

    return this.prisma.category.create({
      data: {
        name,
        slug,
        description: dto.description?.trim(),
      },
    });
  }
}