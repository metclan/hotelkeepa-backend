import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const checkoutId = z.string().startsWith("chk_").max(191);
const createdCheckout = z.object({ checkout_id: checkoutId, checkout_url: z.string().url() });
const retrievedCheckout = z.object({
  checkout_id: checkoutId,
  status: z.string(),
  payment_status: z.string().nullable(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string(),
  reference: z.string().nullable(),
});

export function bachsConfigured() {
  return /^(sk_sandbox_|sk_live_).+/.test(process.env.BACHS_API_KEY ?? "")
    && Boolean(process.env.BACHS_WEBHOOK_SECRET && process.env.FRONTEND_URL);
}

async function bachsRequest<T>(path: string, schema: z.ZodType<T>, options?: RequestInit) {
  const key = process.env.BACHS_API_KEY;
  if (!key || !bachsConfigured()) throw new Error("Bachs configuration missing");
  const origin = key.startsWith("sk_live_") ? "https://api.bachs.io" : "https://sandbox-api.bachs.io";
  const response = await fetch(`${origin}/v1/checkout-sessions${path}`, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) throw new Error(`Bachs checkout API returned ${response.status}`);
  const result = await response.json();
  return schema.parse(result.data ?? result);
}

export async function createBachsCheckout(order: {
  id: string; amount: number; currency: string; email: string;
}) {
  const returnUrl = new URL("/settings/subscription", process.env.FRONTEND_URL);
  const cancelUrl = new URL(returnUrl);
  returnUrl.searchParams.set("payment", "returned");
  cancelUrl.searchParams.set("payment", "cancelled");
  const checkout = await bachsRequest("", createdCheckout, {
    method: "POST",
    headers: { "Idempotency-Key": order.id },
    body: JSON.stringify({
      reference: order.id,
      pricing: { currency: order.currency, amount: order.amount.toFixed(2) },
      customer: { email: order.email },
      billing_currency: order.currency,
      payment_method_types: order.currency === "USD" ? ["USD_CARD"] : ["NGN_CARD", "NGN_BANK_TRANSFER"],
      success_url: returnUrl.href,
      cancel_url: cancelUrl.href,
    }),
  });
  const url = new URL(checkout.checkout_url);
  if (url.protocol !== "https:" || !["checkout.bachs.io", "sandbox-checkout.bachs.io"].includes(url.hostname)) {
    throw new Error("Unexpected Bachs checkout host");
  }
  return checkout;
}

export function getBachsCheckout(id: string) {
  return bachsRequest(`/${encodeURIComponent(checkoutId.parse(id))}`, retrievedCheckout);
}

export function verifyBachsSignature(raw: Buffer, header: string, secret: string, now = Date.now()) {
  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => /^t=\d+$/.test(part))?.slice(2);
  if (!timestamp || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest();
  return parts.some((part) => /^v1=[a-f0-9]{64}$/i.test(part)
    && timingSafeEqual(expected, Buffer.from(part.slice(3), "hex")));
}
