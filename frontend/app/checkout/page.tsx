
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import RazorpayCheckout from "../components/razorpay-checkout";

interface Address {
  id: string;
  label: "HOME" | "WORK" | "OTHER";
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

interface CartItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    unit: string;
  };
  lineTotalInPaise: number;
  inStock: boolean;
  hasEnoughStock: boolean;
}

interface CartResponse {
  items: CartItem[];
  summary: {
    itemCount: number;
    totalQuantity: number;
    subtotalInPaise: number;
  };
}

interface AddressResponse {
  data?: Address[];
  addresses?: Address[];
}

interface CreatedOrder {
  id?: string;
  orderId?: string;
  orderNumber?: string;
  totalInPaise?: number;
  order?: {
    id?: string;
    orderId?: string;
    orderNumber?: string;
    totalInPaise?: number;
  };
  data?: {
    id?: string;
    orderId?: string;
    orderNumber?: string;
    totalInPaise?: number;
    order?: {
      id?: string;
      orderId?: string;
      orderNumber?: string;
      totalInPaise?: number;
    };
  };
}

const formatINR = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);

function parseAddresses(payload: Address[] | AddressResponse): Address[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.addresses)) return payload.addresses;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function parseCreatedOrder(response: CreatedOrder) {
  const order = response.order ?? response.data?.order ?? response.data;
  const id = order?.id ?? order?.orderId ?? response.id ?? response.orderId;

  if (!id) {
    throw new Error("The backend did not return an order ID.");
  }

  return {
    id,
    orderNumber: order?.orderNumber ?? response.orderNumber,
    totalInPaise: order?.totalInPaise ?? response.totalInPaise,
  };
}

export default function CheckoutPage() {
  const router = useRouter();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [order, setOrder] = useState<{
    id: string;
    orderNumber?: string;
    totalInPaise?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCheckout() {
      const token = localStorage.getItem("grocery_access_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      setAccessToken(token);

      try {
        const [addressResponse, cartResponse] = await Promise.all([
          apiFetch<Address[] | AddressResponse>("addresses", {}, token),
          apiFetch<CartResponse>("cart", {}, token),
        ]);

        if (cancelled) return;

        const loadedAddresses = parseAddresses(addressResponse);

        setAddresses(loadedAddresses);
        setSelectedAddressId(
          loadedAddresses.find((address) => address.isDefault)?.id ??
            loadedAddresses[0]?.id ??
            "",
        );
        setCart(cartResponse);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load checkout information.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCheckout();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleCreateOrder() {
    if (!accessToken || !selectedAddressId || creatingOrder || !cart) return;

    if (cart.items.length === 0) {
      setError("Your cart is empty. Add products before checking out.");
      return;
    }

    const invalidItem = cart.items.find(
      (item) => !item.inStock || !item.hasEnoughStock,
    );

    if (invalidItem) {
      setError(
        `${invalidItem.product.name} has insufficient stock. Please update your cart.`,
      );
      return;
    }

    setCreatingOrder(true);
    setError("");

    try {
      const response = await apiFetch<CreatedOrder>(
        "orders",
        {
          method: "POST",
          body: JSON.stringify({ addressId: selectedAddressId }),
        },
        accessToken,
      );

      setOrder(parseCreatedOrder(response));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create your order.",
      );
    } finally {
      setCreatingOrder(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Preparing your checkout...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/cart"
          className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
        >
          ← Back to cart
        </Link>

        <h1 className="mt-5 text-3xl font-bold tracking-tight text-gray-900">
          Checkout
        </h1>
        <p className="mt-2 text-gray-500">
          Choose where your groceries should be delivered.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-gray-900">
                Delivery address
              </h2>

              <Link
                href="/addresses"
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
              >
                Manage addresses
              </Link>
            </div>

            {addresses.length === 0 ? (
              <div className="mt-5 rounded-xl bg-gray-50 p-5">
                <p className="font-medium text-gray-900">
                  No saved delivery addresses
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Add an address before placing your order.
                </p>
                <Link
                  href="/addresses"
                  className="mt-4 inline-block font-semibold text-emerald-700"
                >
                  Add delivery address →
                </Link>
              </div>
            ) : order ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="font-semibold text-emerald-900">
                  Order created successfully
                </p>
                {order.orderNumber && (
                  <p className="mt-1 text-sm text-emerald-800">
                    Order number: {order.orderNumber}
                  </p>
                )}
                <p className="mt-2 text-sm text-emerald-800">
                  Continue to payment below.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
                      selectedAddressId === address.id
                        ? "border-emerald-600 bg-emerald-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="deliveryAddress"
                      value={address.id}
                      checked={selectedAddressId === address.id}
                      onChange={() => setSelectedAddressId(address.id)}
                      className="mt-1 accent-emerald-600"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                        {address.label}
                        {address.isDefault && (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                            Default
                          </span>
                        )}
                      </span>

                      <span className="mt-2 block text-sm text-gray-700">
                        {address.recipientName} · {address.phone}
                      </span>

                      <span className="mt-1 block text-sm leading-6 text-gray-500">
                        {address.addressLine1}
                        {address.addressLine2
                          ? `, ${address.addressLine2}`
                          : ""}
                        {address.landmark ? `, ${address.landmark}` : ""}
                        {`, ${address.city}, ${address.state} - ${address.postalCode}`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              Order summary
            </h2>

            {!cart || cart.items.length === 0 ? (
              <p className="mt-5 text-sm text-gray-500">
                Your cart is empty.
              </p>
            ) : (
              <>
                <div className="mt-5 space-y-4">
                  {cart.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span className="text-gray-600">
                        {item.product.name} × {item.quantity}
                      </span>
                      <span className="shrink-0 font-medium text-gray-900">
                        {formatINR(item.lineTotalInPaise)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 border-t border-gray-200 pt-4">
                  <div className="flex justify-between gap-4">
                    <span className="font-semibold text-gray-900">
                      Subtotal
                    </span>
                    <span className="text-xl font-bold text-gray-900">
                      {formatINR(cart.summary.subtotalInPaise)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    The final amount is calculated and validated by the
                    backend when the order is created.
                  </p>
                </div>
              </>
            )}

            {!order ? (
              <button
                type="button"
                onClick={() => void handleCreateOrder()}
                disabled={
                  creatingOrder ||
                  addresses.length === 0 ||
                  !selectedAddressId ||
                  !cart ||
                  cart.items.length === 0
                }
                className="mt-6 w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingOrder ? "Creating order..." : "Place order"}
              </button>
            ) : accessToken ? (
              <div className="mt-6">
                {typeof order.totalInPaise === "number" && (
                  <p className="mb-3 font-semibold text-gray-900">
                    Order total: {formatINR(order.totalInPaise)}
                  </p>
                )}

                <RazorpayCheckout
                  orderId={order.id}
                  accessToken={accessToken}
                />
              </div>
            ) : null}

            <p className="mt-4 text-center text-xs leading-5 text-gray-500">
              Online payments use Razorpay Test Mode during development.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
