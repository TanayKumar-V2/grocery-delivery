import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateAddressDto {
  @IsOptional()
  @IsIn(['HOME', 'WORK', 'OTHER'])
  label?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Enter a valid 10-digit Indian mobile number',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  landmark?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Postal code must contain 6 digits',
  })
  postalCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}