import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsIn(['HOME', 'WORK', 'OTHER'])
  label?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  recipientName: string;

  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Enter a valid 10-digit Indian mobile number',
  })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  landmark?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Postal code must contain 6 digits',
  })
  postalCode: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}