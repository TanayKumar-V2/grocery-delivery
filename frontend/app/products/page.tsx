
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";

const PAGE_SIZE = 20;

interface Product {
  id: string;
  name: string;
  slug: string;
  brand?: string | null;
  unit: string;
  priceInPaise: number;
  discountPriceInPaise: number | null;
  isActive?: boolean;
  category?: string | { name?: string };
  inventory?: {
    quantity: number;
    reservedQuantity: number;
  } | null;
  availableQuantity?: number;
}

interface ProductPageData {
  products: Product[];
  totalPages?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getProductPage(payload: unknown): ProductPageData {
  if (Array.isArray(payload)) {
    return { products: payload as Product[] };
  }

  if (!isRecord(payload)) {
    return { products: [] };
  }

  const nested = isRecord(payload.data) ? payload.data : undefined;
  const meta = isRecord(payload.meta) ? payload.meta : undefined;
  const pagination = isRecord(payload.pagination)
    ? payload.pagination
    : undefined;
  const nestedMeta =
    nested && isRecord(nested.meta) ? nested.meta : undefined;
  const nestedPagination =
    nested && isRecord(nested.pagination) ? nested.pagination : undefined;

  const candidates = [
    payload.data,
    payload.products,
    payload.items,
    nested?.products,
    nested?.items,
  ];

  const list = candidates.find(Array.isArray);
  const products = (list ?? []) as Product[];

  const rawPages =
    payload.totalPages ??
    meta?.totalPages ??
    pagination?.totalPages ??
    nested?.totalPages ??
    nestedMeta?.totalPages ??
    nestedPagination?.totalPages;

  const totalPages =
    typeof rawPages === "number" && Number.isFinite(rawPages)
      ? rawPages
      : undefined;

  return { products, totalPages };
}

function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function getCategoryName(category: Product["category"]): string {
  if (typeof category === "string") return category;
  return category?.name ?? "Fresh groceries";
}

function getAvailableQuantity(product: Product): number | undefined {
  if (typeof product.availableQuantity === "number") {
    return product.availableQuantity;
  }

  if (product.inventory) {
    return Math.max(
      0,
      product.inventory.quantity - product.inventory.reservedQuantity,
    );
  }

  return undefined;
}

export default function ProductsPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | undefined>();
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      setError("");
      setNotice("");

      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sortBy: "name",
        sortOrder: "asc",
      });

      if (activeSearch.trim()) {
        params.set("search", activeSearch.trim());
      }

      try {
        const response = await apiFetch<unknown>(
          `products?${params.toString()}`,
        );

        if (cancelled) return;

        const result = getProductPage(response);
        setProducts(result.products);
        setTotalPages(result.totalPages);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the product catalogue.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [page, activeSearch]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setActiveSearch(searchInput.trim());
  }

  async function addToCart(product: Product) {
    const token = localStorage.getItem("grocery_access_token");

    if (!token) {
      router.push("/login");
      return;
    }

    if (busyProductId) return;

    setBusyProductId(product.id);
    setError("");
    setNotice("");

    try {
      await apiFetch<{ message: string }>(
        "cart/items",
        {
          method: "POST",
          body: JSON.stringify({
            productId: product.id,
            quantity: 1,
          }),
        },
        token,
      );

      setNotice(`${product.name} added to your cart.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add this product.",
      );
    } finally {
      setBusyProductId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Link href="/" className="text-xl font-bold tracking-tight text-emerald-700">
            FreshBasket
          </Link>

          <Link
            href="/cart"
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:border-emerald-600 hover:text-emerald-700"
          >
            🛒 View cart
          </Link>
        </div>
      </header>

      <section className="bg-emerald-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Freshness at your doorstep
          </p>

          <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Everyday groceries, made easier.
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-emerald-100 sm:text-base">
            Browse your essentials, choose what you need, and build your basket
            in just a few clicks.
          </p>

          <form
            onSubmit={handleSearch}
            className="mt-8 flex max-w-xl gap-2 rounded-2xl bg-white p-2 shadow-lg"
          >
            <input
              aria-label="Search groceries"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search fruits, vegetables, milk..."
              className="min-w-0 flex-1 rounded-xl px-3 py-3 text-sm text-gray-900 outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              {activeSearch ? `Results for "${activeSearch}"` : "Shop groceries"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Prices and available stock come from your backend.
            </p>
          </div>

          <Link
            href="/cart"
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          >
            Go to cart →
          </Link>
        </div>

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
            {notice}{" "}
            <Link href="/cart" className="font-semibold underline">
              View cart
            </Link>
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-white"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
            <div className="text-4xl">🥦</div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              No products found
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Try another search, or check back later.
            </p>
            {activeSearch && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setActiveSearch("");
                  setPage(1);
                }}
                className="mt-5 font-semibold text-emerald-700 hover:text-emerald-900"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product) => {
                const discounted =
                  product.discountPriceInPaise !== null &&
                  product.discountPriceInPaise < product.priceInPaise;

                const price = discounted
                  ? product.discountPriceInPaise!
                  : product.priceInPaise;

                const available = getAvailableQuantity(product);
                const outOfStock =
                  product.isActive === false || available === 0;

                return (
                  <article
                    key={product.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-emerald-50 to-lime-50">
                      <span className="text-6xl" aria-hidden="true">
                        🥬
                      </span>

                      {discounted && (
                        <span className="absolute left-3 top-3 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                          OFFER
                        </span>
                      )}

                      {outOfStock && (
                        <span className="absolute bottom-3 rounded-full bg-gray-900/85 px-3 py-1 text-xs font-semibold text-white">
                          Out of stock
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        {getCategoryName(product.category)}
                      </p>

                      <h3 className="mt-2 text-lg font-semibold text-gray-900">
                        {product.name}
                      </h3>

                      {product.brand && (
                        <p className="mt-1 text-sm text-gray-500">
                          {product.brand}
                        </p>
                      )}

                      <p className="mt-1 text-sm text-gray-500">
                        {product.unit}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold text-gray-900">
                          {formatINR(price)}
                        </span>
                        {discounted && (
                          <span className="text-sm text-gray-400 line-through">
                            {formatINR(product.priceInPaise)}
                          </span>
                        )}
                      </div>

                      {available !== undefined && available > 0 && (
                        <p className="mt-2 text-xs text-gray-500">
                          {available} available
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={outOfStock || busyProductId !== null}
                        onClick={() => void addToCart(product)}
                        className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                      >
                        {busyProductId === product.id
                          ? "Adding..."
                          : outOfStock
                            ? "Unavailable"
                            : "＋ Add to cart"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 disabled:opacity-40"
              >
                ← Previous
              </button>

              <span className="text-sm text-gray-600">
                Page {page}
                {totalPages !== undefined ? ` of ${totalPages}` : ""}
              </span>

              <button
                type="button"
                disabled={
                  totalPages !== undefined
                    ? page >= totalPages
                    : products.length < PAGE_SIZE
                }
                onClick={() => setPage((current) => current + 1)}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
