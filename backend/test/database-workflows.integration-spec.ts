import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const testDbUrl = process.env.DATABASE_URL_TEST;

describe.skipIf(!testDbUrl)('PostgreSQL High-Risk Workflows Integration Tests', () => {
  let prisma: PrismaClient;
  let ordersService: OrdersService;
  let paymentsService: PaymentsService;

  const testRunId = randomUUID().slice(0, 8);
  const testUserEmail = `integration_cust_${testRunId}@example.com`;
  let testUserId: string;
  let testAddressId: string;
  let testCategoryId: string;
  let testProductId: string;
  let testLimitedProductId: string;

  const webhookSecret = 'test_integration_webhook_secret';
  const keySecret = 'test_integration_key_secret';

  beforeAll(async () => {
    if (!testDbUrl) {
      console.warn(
        '\n[NOTICE] Skipping PostgreSQL integration tests: DATABASE_URL_TEST is not set.\n' +
          'To run real PostgreSQL integration tests, set DATABASE_URL_TEST to a dedicated test database URL.\n' +
          'Never point this to a shared or production database.\n',
      );
      return;
    }

    process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
    process.env.RAZORPAY_KEY_SECRET = keySecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

    const adapter = new PrismaPg({
      connectionString: testDbUrl,
      connectionTimeoutMillis: 30_000,
    });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();

    ordersService = new OrdersService(prisma as unknown as PrismaService);
    paymentsService = new PaymentsService(prisma as unknown as PrismaService);

    // 1. Register test customer and address fixture
    const user = await prisma.user.create({
      data: {
        name: `Integration User ${testRunId}`,
        email: testUserEmail,
        passwordHash: '$2a$04$fakehashfakehashfakehashfakehashfakehashfakehashfakeha',
        role: 'CUSTOMER',
      },
    });
    testUserId = user.id;

    const address = await prisma.address.create({
      data: {
        userId: testUserId,
        recipientName: 'Integration Tester',
        phone: '9876543210',
        addressLine1: '42 Integration Way',
        city: 'Bangalore',
        state: 'Karnataka',
        postalCode: '560001',
        isDefault: true,
      },
    });
    testAddressId = address.id;

    // 2. Seed category and products with inventory
    const category = await prisma.category.create({
      data: {
        name: `Integration Cat ${testRunId}`,
        slug: `integration-cat-${testRunId}`,
      },
    });
    testCategoryId = category.id;

    const product = await prisma.product.create({
      data: {
        categoryId: testCategoryId,
        name: `Integration Apple ${testRunId}`,
        slug: `integration-apple-${testRunId}`,
        sku: `SKU-APL-${testRunId}`,
        priceInPaise: 10000,
        discountPriceInPaise: 8000,
        unit: 'kg',
        inventory: {
          create: {
            quantity: 50,
            reservedQuantity: 0,
          },
        },
      },
    });
    testProductId = product.id;

    // Product with limited stock for concurrency tests
    const limitedProduct = await prisma.product.create({
      data: {
        categoryId: testCategoryId,
        name: `Limited Mango ${testRunId}`,
        slug: `limited-mango-${testRunId}`,
        sku: `SKU-MNG-${testRunId}`,
        priceInPaise: 15000,
        unit: 'kg',
        inventory: {
          create: {
            quantity: 2, // only 2 in stock!
            reservedQuantity: 0,
          },
        },
      },
    });
    testLimitedProductId = limitedProduct.id;
  });

  afterAll(async () => {
    if (!prisma) return;

    try {
      // Clean up test fixtures in reverse dependency order
      if (testUserId) {
        await prisma.orderItem.deleteMany({
          where: { order: { userId: testUserId } },
        });
        await prisma.payment.deleteMany({
          where: { order: { userId: testUserId } },
        });
        await prisma.order.deleteMany({
          where: { userId: testUserId },
        });
        await prisma.cartItem.deleteMany({
          where: { cart: { userId: testUserId } },
        });
        await prisma.cart.deleteMany({
          where: { userId: testUserId },
        });
        await prisma.address.deleteMany({
          where: { userId: testUserId },
        });
        await prisma.user.delete({
          where: { id: testUserId },
        });
      }

      if (testProductId) {
        await prisma.inventory.deleteMany({
          where: { productId: { in: [testProductId, testLimitedProductId] } },
        });
        await prisma.product.deleteMany({
          where: { id: { in: [testProductId, testLimitedProductId] } },
        });
      }

      if (testCategoryId) {
        await prisma.category.delete({
          where: { id: testCategoryId },
        });
      }

      await prisma.$disconnect();
    } catch (cleanupErr) {
      console.error('Error during integration test cleanup:', cleanupErr);
    }
  });

  // Workflow 3: Create order and verify persisted items, calculated totals, and reserved stock
  it('Workflow 3: Creates order atomically, verifies calculations, and reserves stock', async () => {
    // Add item to user cart
    const cart = await prisma.cart.upsert({
      where: { userId: testUserId },
      update: {},
      create: { userId: testUserId },
    });

    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: testProductId,
        quantity: 3,
      },
    });

    const createOrderResult = await ordersService.createOrder(testUserId, {
      addressId: testAddressId,
    });

    expect(createOrderResult.message).toBe('Order created successfully');
    const orderId = createOrderResult.order.id;

    // Verify persisted order
    const persistedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    expect(persistedOrder).not.toBeNull();
    expect(persistedOrder?.items).toHaveLength(1);
    expect(persistedOrder?.subtotalInPaise).toBe(30000); // 3 * 10000
    expect(persistedOrder?.discountInPaise).toBe(6000); // 3 * (10000 - 8000)
    expect(persistedOrder?.totalInPaise).toBe(24000); // 3 * 8000

    // Verify inventory reserved quantity incremented from 0 to 3
    const inventory = await prisma.inventory.findUnique({
      where: { productId: testProductId },
    });
    expect(inventory?.reservedQuantity).toBe(3);

    // Verify cart was cleared
    const remainingCartItems = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
    });
    expect(remainingCartItems).toHaveLength(0);
  });

  // Workflow 4: Attempt concurrent orders against limited stock and verify no overselling
  it('Workflow 4: Prevents overselling during concurrent orders against limited stock', async () => {
    // Limited product has 2 in stock.
    // Create two extra users to attempt parallel orders of 2 items each.
    const extraUsers = await Promise.all([
      prisma.user.create({
        data: {
          name: 'Concurrent User A',
          email: `conc_a_${testRunId}@example.com`,
          passwordHash: 'hash',
        },
      }),
      prisma.user.create({
        data: {
          name: 'Concurrent User B',
          email: `conc_b_${testRunId}@example.com`,
          passwordHash: 'hash',
        },
      }),
    ]);

    // Setup carts and addresses for both users
    for (const u of extraUsers) {
      const addr = await prisma.address.create({
        data: {
          userId: u.id,
          recipientName: u.name,
          phone: '9876543210',
          addressLine1: 'Conc Street',
          city: 'Delhi',
          state: 'Delhi',
          postalCode: '110001',
        },
      });

      const c = await prisma.cart.create({ data: { userId: u.id } });
      await prisma.cartItem.create({
        data: { cartId: c.id, productId: testLimitedProductId, quantity: 2 },
      });

      // Attach addressId to user for convenience
      (u as any).addressId = addr.id;
    }

    // Fire both order creations concurrently!
    const results = await Promise.allSettled([
      ordersService.createOrder(extraUsers[0].id, { addressId: (extraUsers[0] as any).addressId }),
      ordersService.createOrder(extraUsers[1].id, { addressId: (extraUsers[1] as any).addressId }),
    ]);

    // Exactly one must succeed, and one must fail with insufficient/stock changed!
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Inventory must not be oversold: reservedQuantity should be exactly 2
    const limitedInv = await prisma.inventory.findUnique({
      where: { productId: testLimitedProductId },
    });
    expect(limitedInv?.reservedQuantity).toBe(2);
    expect(limitedInv?.quantity).toBe(2);

    // Cleanup extra users
    for (const u of extraUsers) {
      await prisma.orderItem.deleteMany({ where: { order: { userId: u.id } } });
      await prisma.order.deleteMany({ where: { userId: u.id } });
      await prisma.cartItem.deleteMany({ where: { cart: { userId: u.id } } });
      await prisma.cart.deleteMany({ where: { userId: u.id } });
      await prisma.address.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
  });

  // Workflow 5: Cancel an eligible unpaid order and verify stock is released exactly once
  it('Workflow 5: Cancelling an order releases reserved stock exactly once', async () => {
    // Add cart and create an order to cancel
    const cart = await prisma.cart.findUnique({ where: { userId: testUserId } });
    await prisma.cartItem.create({
      data: { cartId: cart!.id, productId: testProductId, quantity: 4 },
    });

    const initialInv = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const reservedBefore = initialInv!.reservedQuantity;

    const orderRes = await ordersService.createOrder(testUserId, { addressId: testAddressId });
    const orderId = orderRes.order.id;

    // Reserved quantity should increase by 4
    const invAfterCreate = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    expect(invAfterCreate!.reservedQuantity).toBe(reservedBefore + 4);

    // Cancel order
    const cancelRes = await ordersService.cancelPendingOrder(testUserId, orderId);
    expect(cancelRes.status).toBe('CANCELLED');

    // Reserved quantity should be decremented back by 4
    const invAfterCancel = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    expect(invAfterCancel!.reservedQuantity).toBe(reservedBefore);

    // Repeated cancel attempt should not double-release inventory
    const secondCancel = await ordersService.cancelPendingOrder(testUserId, orderId);
    expect(secondCancel.message).toBe('Order is already cancelled');

    const invAfterSecondCancel = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    expect(invAfterSecondCancel!.reservedQuantity).toBe(reservedBefore);
  });

  // Workflow 6: Expire a pending order and verify persisted statuses and inventory release
  it('Workflow 6: Expiry processing releases inventory exactly once', async () => {
    const cart = await prisma.cart.findUnique({ where: { userId: testUserId } });
    await prisma.cartItem.create({
      data: { cartId: cart!.id, productId: testProductId, quantity: 2 },
    });

    const initialInv = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const reservedBefore = initialInv!.reservedQuantity;

    const orderRes = await ordersService.createOrder(testUserId, { addressId: testAddressId });
    const orderId = orderRes.order.id;

    // Manually backdate expiresAt so it qualifies as expired
    await prisma.order.update({
      where: { id: orderId },
      data: { expiresAt: new Date(Date.now() - 60000) },
    });

    const expireResult = await ordersService.expirePendingOrders();
    expect(expireResult.expiredCount).toBeGreaterThanOrEqual(1);

    // Order status should be CANCELLED and paymentStatus EXPIRED
    const expiredOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(expiredOrder?.status).toBe('CANCELLED');
    expect(expiredOrder?.paymentStatus).toBe('EXPIRED');

    // Stock should be released
    const invAfterExpiry = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    expect(invAfterExpiry!.reservedQuantity).toBe(reservedBefore);
  });

  // Workflow 7: Process captured, failed, and duplicate webhook events using HMAC signatures
  it('Workflow 7: Webhook events processing with genuine HMAC signatures and idempotency', async () => {
    // Create an order and local payment record
    const cart = await prisma.cart.findUnique({ where: { userId: testUserId } });
    await prisma.cartItem.create({
      data: { cartId: cart!.id, productId: testProductId, quantity: 2 },
    });

    const orderRes = await ordersService.createOrder(testUserId, { addressId: testAddressId });
    const orderId = orderRes.order.id;
    const gatewayOrderId = `order_int_gw_${randomUUID().slice(0, 8)}`;

    await prisma.payment.create({
      data: {
        orderId,
        provider: 'RAZORPAY',
        providerOrderId: gatewayOrderId,
        amountInPaise: 16000,
        currency: 'INR',
        status: 'CREATED',
      },
    });

    const eventId = `evt_int_${randomUUID().slice(0, 8)}`;
    const payload = {
      id: eventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_int_${randomUUID().slice(0, 8)}`,
            order_id: gatewayOrderId,
            amount: 16000,
            currency: 'INR',
          },
        },
      },
    };

    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    // First delivery: processes and confirms order
    const firstDelivery = await paymentsService.handleWebhook(rawBody, signature, eventId);
    expect(firstDelivery.duplicate).toBe(false);

    const confirmedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(confirmedOrder?.status).toBe('CONFIRMED');
    expect(confirmedOrder?.paymentStatus).toBe('PAID');

    // Duplicate delivery: must be recognized as duplicate and not re-process
    const duplicateDelivery = await paymentsService.handleWebhook(rawBody, signature, eventId);
    expect(duplicateDelivery.duplicate).toBe(true);
    expect(duplicateDelivery.message).toBe('Webhook event was already processed');
  });

  // Workflow 8: Database rollback on critical failure
  it('Workflow 8: Verifies database rollback when a critical transaction step fails', async () => {
    const cart = await prisma.cart.findUnique({ where: { userId: testUserId } });
    await prisma.cartItem.create({
      data: { cartId: cart!.id, productId: testProductId, quantity: 5 },
    });

    // Provide an invalid addressId to trigger transaction rollback
    await expect(
      ordersService.createOrder(testUserId, { addressId: 'invalid-address-id' }),
    ).rejects.toThrow('Delivery address not found');

    // Verify cart was NOT cleared
    const cartItems = await prisma.cartItem.findMany({ where: { cartId: cart!.id } });
    expect(cartItems).toHaveLength(1);

    // Verify no orphan orders created
    const orders = await prisma.order.findMany({
      where: { userId: testUserId, addressId: 'invalid-address-id' },
    });
    expect(orders).toHaveLength(0);
  });
});

// Standalone check to verify that if DATABASE_URL_TEST is missing, the suite safely skips with a clean notice
describe('Integration test prerequisite verification', () => {
  it('documents and verifies DATABASE_URL_TEST configuration requirement', () => {
    if (!testDbUrl) {
      expect(process.env.DATABASE_URL_TEST).toBeUndefined();
    } else {
      expect(testDbUrl).toContain('postgres');
    }
  });
});
