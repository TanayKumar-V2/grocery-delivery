
"use client";

import { useState } from "react";
import {
  useRazorpay,
  type RazorpayOrderOptions,
} from "react-razorpay";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface RazorpayCheckoutProps {
  orderId: string;
  accessToken: string;
}

interface GatewayOrderResponse {
  razorpayKeyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  orderNumber: string;
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null);

  return typeof data?.message === "string"
    ? data.message
    : `Request failed (${response.status})`;
}

export default function RazorpayCheckout({
  orderId,
  accessToken,
}: RazorpayCheckoutProps) {
  const { Razorpay, isLoading, error } = useRazorpay();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handlePayment() {
    if (!API_URL || !accessToken || !orderId) {
      setMessage("Missing API configuration or order information.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const orderResponse = await fetch(
        `${API_URL}/payments/orders/${encodeURIComponent(orderId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!orderResponse.ok) {
        throw new Error(await readError(orderResponse));
      }

      const gatewayOrder =
        (await orderResponse.json()) as GatewayOrderResponse;

      const options: RazorpayOrderOptions = {
        key: gatewayOrder.razorpayKeyId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency as RazorpayOrderOptions["currency"],
        name: "Grocery Delivery",
        description: `Order ${gatewayOrder.orderNumber}`,
        order_id: gatewayOrder.razorpayOrderId,

        handler: async (paymentResponse) => {
          setBusy(true);
          setMessage("Verifying payment details...");

          try {
            const verifyResponse = await fetch(
              `${API_URL}/payments/verify`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  razorpay_payment_id:
                    paymentResponse.razorpay_payment_id,
                  razorpay_order_id:
                    paymentResponse.razorpay_order_id,
                  razorpay_signature:
                    paymentResponse.razorpay_signature,
                }),
              },
            );

            if (!verifyResponse.ok) {
              throw new Error(await readError(verifyResponse));
            }

            setMessage(
              "Payment details received. Waiting for server-side payment confirmation.",
            );
          } catch (verificationError) {
            setMessage(
              verificationError instanceof Error
                ? verificationError.message
                : "Could not verify payment details.",
            );
          } finally {
            setBusy(false);
          }
        },
      };

      const razorpayInstance = new Razorpay(options);
      razorpayInstance.open();
    } catch (paymentError) {
      setMessage(
        paymentError instanceof Error
          ? paymentError.message
          : "Could not start checkout.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handlePayment}
        disabled={busy || isLoading || Boolean(error)}
        className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Processing..." : "Pay with Razorpay"}
      </button>

      {error && (
        <p className="text-sm text-red-600">
          Razorpay Checkout could not load. Please refresh the page.
        </p>
      )}

      {message && (
        <p role="status" className="text-sm text-gray-700">
          {message}
        </p>
      )}
    </div>
  );
}
