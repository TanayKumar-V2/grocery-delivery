import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsServiceMock: any;

  beforeEach(async () => {
    productsServiceMock = {
      getProducts: vi.fn(),
      getProductBySlug: vi.fn(),
      createProduct: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: productsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('getProducts delegates to service with query dto', async () => {
    const dto = { page: 1, limit: 10 };
    productsServiceMock.getProducts.mockResolvedValue({ data: [], meta: {} });

    const result = await controller.getProducts(dto);

    expect(productsServiceMock.getProducts).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ data: [], meta: {} });
  });

  it('getProductBySlug delegates to service with slug', async () => {
    productsServiceMock.getProductBySlug.mockResolvedValue({ id: 'p-1', slug: 'apples' });

    const result = await controller.getProductBySlug('apples');

    expect(productsServiceMock.getProductBySlug).toHaveBeenCalledWith('apples');
    expect(result).toEqual({ id: 'p-1', slug: 'apples' });
  });

  it('createProduct delegates to service with createProductDto', async () => {
    const dto = { name: 'Apples' } as any;
    productsServiceMock.createProduct.mockResolvedValue({ id: 'p-1' });

    const result = await controller.createProduct(dto);

    expect(productsServiceMock.createProduct).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'p-1' });
  });
});
