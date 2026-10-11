import {
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  razorpay_order_id: string;

  @IsString()
  @IsNotEmpty()
  razorpay_payment_id: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, {
    message: 'Invalid Razorpay payment signature format',
  })
  razorpay_signature: string;
}