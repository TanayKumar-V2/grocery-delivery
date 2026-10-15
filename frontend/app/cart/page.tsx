
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";

interface CartItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    slug: string;
    brand: string | null;
    unit: string;
    priceInPaise: number;
    discountPriceInPaise: number | null;
    category: string;
  };
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  availableQuantity: number;
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

const formatINR = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);

export default function CartPage() {
  const router = useRouter();

  const [cart, setCart] = useState<CartResponse | null>(null);
  const accessToken = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCart = useCallback(
    async (token: string, showLoading = false) => {
      if (showLoading) setLoading(true);
      setError("");

      try {
        const data = await apiFetch<CartResponse>("cart", {}, token);
        setCart(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load your cart.",
        );
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const token = localStorage.getItem("grocery_access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    accessToken.current = token;
    void loadCart(token, true);
  }, [router, loadCart]);

  async function changeQuantity(item: CartItem, nextQuantity: number) {
    if (!accessToken.current || busyItemId) return;

    if (nextQuantity > item.availableQuantity || nextQuantity > 99) {
      setError(`Only ${item.availableQuantity} units are currently available.`);
      return;
    }

    setBusyItemId(item.id);
    setError("");
    setNotice("");

    try {
      if (nextQuantity <= 0) {
        await apiFetch<{ message: string }>(
          `cart/items/${encodeURIComponent(item.id)}`,
          { method: "DELETE" },
          accessToken.current,
        );
        setNotice(`${item.product.name} was removed from your cart.`);
      } else {
        await apiFetch<{ message: string }>(
          `cart/items/${encodeURIComponent(item.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ quantity: nextQuantity }),
          },
          accessToken.current,
        );
        setNotice("Cart updated successfully.");
      }

      await loadCart(accessToken.current);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update your cart.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  if (loading || !cart) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <p className="text-sm text-gray-500">
          {error || "Loading your cart..."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link
            href="/"
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            ← Back to home
          </Link>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
                Your basket
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Shopping cart
              </h1>
              <p className="mt-2 text-gray-500">
                {cart.summary.totalQuantity} items across{" "}
                {cart.summary.itemCount} products
              </p>
            </div>
          </div>
        </header>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {notice}
          </p>
        )}

        {cart.items.length === 0 ? (
          <section className="rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
            <div className="text-5xl" aria-hidden="true">
              🛒
            </div>
            <h2 className="mt-5 text-xl font-semibold text-gray-900">
              Your cart is empty
            </h2>
            <p className="mt-2 text-gray-500">
              Your selected groceries will appear here.
            </p>
            <p className="mt-5 text-sm text-gray-400">
              We’ll connect the product catalogue next.
            </p>
          </section>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
            <section className="space-y-4">
              {cart.items.map((item) => {
                const hasDiscount =
                  item.product.discountPriceInPaise !== null &&
                  item.product.discountPriceInPaise <
                    item.product.priceInPaise;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
                  >
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-3xl">
                        🥬
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                          {item.product.category}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-gray-900">
                          {item.product.name}
                        </h2>
                        {item.product.brand && (
                          <p className="mt-1 text-sm text-gray-500">
                            {item.product.brand}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-gray-500">
                          {item.product.unit}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {formatINR(item.unitPriceInPaise)}
                          </span>

                          {hasDiscount && (
                            <span className="text-sm text-gray-400 line-through">
                              {formatINR(item.product.priceInPaise)}
                            </span>
                          )}
                        </div>

                        {!item.inStock && (
                          <p className="mt-2 text-sm text-red-600">
                            Currently out of stock
                          </p>
                        )}

                        {item.inStock && !item.hasEnoughStock && (
                          <p className="mt-2 text-sm text-amber-700">
                            Only {item.availableQuantity} units available.
                            Reduce the quantity to continue.
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-5 sm:flex-col sm:items-end">
                        <div className="flex items-center rounded-lg border border-gray-200">
                          <button
                            type="button"
                            aria-label={`Decrease ${item.product.name} quantity`}
                            disabled={busyItemId !== null}
                            onClick={() =>
                              void changeQuantity(item, item.quantity - 1)
                            }
                            className="h-10 w-10 text-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                          >
                            −
                          </button>

                          <span
                            className="min-w-10 text-center text-sm font-semibold"
                            aria-live="polite"
                          >
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            aria-label={`Increase ${item.product.name} quantity`}
                            disabled={
                              busyItemId !== null ||
                              !item.inStock ||
                              item.quantity >= item.availableQuantity ||
                              item.quantity >= 99
                            }
                            onClick={() =>
                              void changeQuantity(item, item.quantity + 1)
                            }
                            className="h-10 w-10 text-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>

                        <p className="font-semibold text-gray-900">
                          {formatINR(item.lineTotalInPaise)}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-8">
              <h2 className="text-xl font-semibold text-gray-900">
                Order summary
              </h2>

              <div className="mt-6 space-y-4 text-sm">
                <div className="flex justify-between gap-4 text-gray-600">
                  <span>Products ({cart.summary.totalQuantity} units)</span>
                  <span>{formatINR(cart.summary.subtotalInPaise)}</span>
                </div>

                <div className="flex justify-between gap-4 text-gray-600">
                  <span>Delivery</span>
                  <span>Calculated at checkout</span>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-gray-900">
                      Subtotal
                    </span>
                    <span className="text-xl font-bold text-gray-900">
                      {formatINR(cart.summary.subtotalInPaise)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Final delivery charges and any applicable taxes are
                    determined during checkout.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled
                className="mt-6 w-full cursor-not-allowed rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white opacity-60"
              >
                Checkout — coming next
              </button>

              <p className="mt-3 text-center text-xs text-gray-500">
                Your order total will be confirmed by the server.
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
