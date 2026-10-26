import { Logger } from '@nestjs/common';

export interface AppEnvConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  PORT: number;
  CORS_ORIGIN: string;
}

export function validateEnvironment(): AppEnvConfig {
  const logger = new Logger('EnvironmentConfig');
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  const requiredVariables = [
    'DATABASE_URL',
    'JWT_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
  ];

  const missing = requiredVariables.filter((name) => !process.env[name]);

  if (missing.length > 0 && !isTest) {
    logger.error(
      `CRITICAL CONFIGURATION ERROR: Missing required environment variables:\n` +
        missing.map((v) => `  - ${v}`).join('\n') +
        `\nPlease configure these variables in your environment or .env file before starting the application.`,
    );
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL || '',
    JWT_SECRET: process.env.JWT_SECRET || (isTest ? 'test_jwt_secret_must_be_long_enough' : ''),
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || (isTest ? 'rzp_test_dummy' : ''),
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || (isTest ? 'dummy_secret' : ''),
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || (isTest ? 'dummy_webhook_secret' : ''),
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  };
}

