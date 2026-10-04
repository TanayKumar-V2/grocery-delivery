import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsInt()
  @Min(1)
  priceInPaise: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  discountPriceInPaise?: number;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  weightGrams?: number;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}