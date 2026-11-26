import type { Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client.js";
import { bachsConfigured, createBachsCheckout, getBachsCheckout, verifyBachsSignature } from "../lib/bachs.js";
import { escapeHtml, sendEmail } from "../lib/email.service.js";
import { subscriptionInvoice } from "../lib/subscription-invoice.js";
import { subscriptionPlans } from "../lib/subscription-plans.js";

const db = new PrismaClient();
const checkoutInput = z.object({ currency: z.enum(["NGN", "USD"]), planId: z.string().optional() });
const successEvent = z.object({
  data: z.object({
    reference: z.uuid(),
    checkout_id: z.string(),
    status: z.literal("SUCCEEDED"),
  }),
});

export async function startSubscriptionCheckout(req: Request, res: Response) {
  if (!req.user?.businessId || !req.user.locationId || !(req.user.isOwner || req.locationAdmin)) {
    res.status(403).json({ message: "Only hotel admins can pay for subscriptions" });
    return;
  }
  const input = checkoutInput.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ message: "Choose NGN or USD" });
    return;
  }
  if (!bachsConfigured()) {
    res.status(503).json({ message: "Bachs payments are unavailable" });
    return;
  }
  const { businessId, locationId, email } = req.user;
  try {
    const order = await db.$transaction(async (tx) => {
      // Lock the hotel before choosing or creating a checkout.
      const locked = await tx.location.updateMany({
        where: { id: locationId, businessId, isActive: true, isDeleted: false },
        data: { updatedAt: new Date() },
      });
      if (!locked.count) return { message: "The selected hotel is unavailable" };
      const now = new Date();
      const active = await tx.subscription.findFirst({
        where: { locationId, businessId, OR: [{ endDate: null }, { endDate: { gt: now } }] },
        orderBy: { startDate: "desc" },
        select: { startDate: true, endDate: true },
      });
      if (active && (!active.endDate || active.startDate > now || active.endDate.getTime() - now.getTime() > 30 * 86_400_000)) {
        return { message: "Annual renewal opens 30 days before the current term ends" };
      }
      const pending = await tx.subscriptionCheckout.findFirst({ where: { locationId, closedAt: null } });
      if (pending) return pending;
      const rooms = await tx.room.count({ where: { locationId } });
      const plan = subscriptionPlans.find((candidate) =>
        rooms <= candidate.maxRooms && (!input.data.planId || candidate.id === input.data.planId));
      if (!plan) return { message: "No listed plan covers this hotel's room count" };
      const { currency } = input.data;
      return tx.subscriptionCheckout.create({
        data: { locationId, planKey: plan.id, currency, email, amount: currency === "NGN" ? plan.ngn : plan.usd },
      });
    });
    if ("message" in order) {
      res.status(409).json({ message: order.message });
      return;
    }
    if (order.checkoutId && order.checkoutUrl) {
      const session = await getBachsCheckout(order.checkoutId);
      if (session.status === "expired" || session.status === "cancelled") {
        await db.subscriptionCheckout.updateMany({
          where: { id: order.id, closedAt: null }, data: { closedAt: new Date() },
        });
        res.status(409).json({ message: "The previous checkout has ended. Select a currency to start a new checkout." });
        return;
      }
      if (session.status !== "open" || session.payment_status === "processing") {
        res.status(409).json({ message: "Bachs is confirming this hotel's payment. Refresh to check the subscription." });
        return;
      }
      if (order.currency !== input.data.currency) {
        res.status(409).json({ message: `This hotel has an open checkout in ${order.currency}. Resume it from the subscription page.` });
        return;
      }
      res.json({ url: order.checkoutUrl });
      return;
    }
    if (order.currency !== input.data.currency) {
      res.status(409).json({ message: `This hotel has a pending checkout in ${order.currency}. Resume it from the subscription page.` });
      return;
    }
    const checkout = await createBachsCheckout(order);
    await db.subscriptionCheckout.updateMany({
      where: { id: order.id, closedAt: null },
      data: { checkoutId: checkout.checkout_id, checkoutUrl: checkout.checkout_url },
    });
    res.json({ url: checkout.checkout_url });
  } catch (error) {
    console.error("Bachs checkout failed", error instanceof Error ? error.name : "Unknown error");
    res.status(502).json({ message: "Could not open Bachs checkout. Please try again." });
  }
}

export async function bachsWebhook(req: Request, res: Response) {
  const raw: unknown = req.body;
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(raw) || !verifyBachsSignature(raw, req.get("X-Bachs-Signature-V2") ?? "", secret)) {
    res.sendStatus(401);
    return;
  }
  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    res.sendStatus(400);
    return;
  }
  const payment = successEvent.safeParse(event);
  if (event?.type !== "collection.succeeded" || !payment.success) {
    res.sendStatus(204);
    return;
  }
  try {
    const { reference, checkout_id } = payment.data.data;
    const order = await findCheckoutOrder(reference);
    if (!order || order.closedAt || (order.checkoutId && order.checkoutId !== checkout_id)) {
      res.sendStatus(204);
      return;
    }
    const result = await reconcileCheckout(order, checkout_id);
    res.sendStatus(result === "confirmed" ? 204 : result === "mismatch" ? 400 : 503);
  } catch (error) {
    console.error("Bachs payment reconciliation failed", error instanceof Error ? error.name : "Unknown error");
    res.sendStatus(503);
  }
}

type CheckoutOrder = NonNullable<Awaited<ReturnType<typeof findCheckoutOrder>>>;

function findCheckoutOrder(id: string) {
  return db.subscriptionCheckout.findUnique({
    where: { id },
    include: { location: { select: { businessId: true } } },
  });
}

async function reconcileCheckout(order: CheckoutOrder, checkout_id: string) {
  const checkout = await getBachsCheckout(checkout_id);
  if (checkout.checkout_id !== checkout_id || checkout.reference !== order.id || checkout.currency !== order.currency
    || Number(checkout.amount) !== order.amount) return "mismatch";
  if (checkout.status !== "completed" || checkout.payment_status !== "succeeded") return "pending";

  const plan = subscriptionPlans.find((candidate) => candidate.id === order.planKey);
  if (!plan) throw new Error("Missing subscription plan");
  const { locationId } = order;
  const { businessId } = order.location;
  const paidAt = new Date();
  const paidTerm = await db.$transaction(async (tx) => {
    await tx.location.update({ where: { id: locationId }, data: { lastActivityAt: paidAt, deletionNoticeAt: null } });
    const claimed = await tx.subscriptionCheckout.updateMany({
      where: { id: order.id, closedAt: null, OR: [{ checkoutId: null }, { checkoutId: checkout_id }] },
      data: { closedAt: paidAt, checkoutId: checkout_id },
    });
    if (!claimed.count) return;
    const planId = `hotelkeepa-annual-${plan.id}-${order.currency.toLowerCase()}`;
    await tx.plan.upsert({
      where: { id: planId }, update: {},
      create: { id: planId, name: plan.name, price: order.amount, maxUsers: plan.users },
    });
    const current = await tx.subscription.findFirst({
      where: { locationId, businessId, endDate: { gt: paidAt } },
      orderBy: { endDate: "desc" },
      select: { endDate: true },
    });
    const startDate = current?.endDate ?? paidAt;
    const endDate = new Date(startDate);
    endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
    return tx.subscription.create({
      data: {
        locationId, businessId, planId, startDate, endDate,
        subcriptionPayments: { create: {
          locationId, businessId, amount: order.amount, currency: order.currency,
          provider: "bachs", providerReference: checkout_id, status: "SUCCESS", paidAt,
        } },
      },
    });
  });

  if (paidTerm) {
    const billingUrl = new URL("/settings/subscription", process.env.FRONTEND_URL);
    await sendEmail({
      to: order.email,
      subject: "Hotelkeepa subscription payment confirmed",
      html: `<p>Your ${escapeHtml(plan.name)} annual subscription payment of ${escapeHtml(order.currency)} ${order.amount.toLocaleString("en-US")} was confirmed.</p><p><a href="${escapeHtml(billingUrl.href)}">View your invoice and term dates</a></p>`,
    }).catch(() => console.error("Hotelkeepa subscription confirmation email failed"));
  }
  return "confirmed";
}

export async function confirmSubscriptionCheckout(req: Request, res: Response) {
  const { user } = req;
  if (!user?.businessId || !user.locationId || !(user.isOwner || req.locationAdmin)) {
    res.status(403).json({ message: "Only hotel admins can check subscription payments" });
    return;
  }
  try {
    const pending = await db.subscriptionCheckout.findFirst({
      where: { locationId: user.locationId, closedAt: null, location: { businessId: user.businessId } },
      select: { id: true },
    });
    const order = pending && await findCheckoutOrder(pending.id);
    const status = order?.checkoutId && !order.closedAt
      ? await reconcileCheckout(order, order.checkoutId) : "pending";
    if (status === "mismatch") {
      res.status(409).json({ message: "Bachs returned a different amount or currency for this checkout" });
      return;
    }
    res.json({ status });
  } catch (error) {
    console.error("Bachs payment status check failed", error instanceof Error ? error.name : "Unknown error");
    res.status(502).json({ message: "Could not check Bachs payment status. Please try again." });
  }
}

export async function downloadSubscriptionInvoice(req: Request, res: Response) {
  if (!req.user?.businessId || !req.user.locationId || !(req.user.isOwner || req.locationAdmin)) {
    res.status(403).json({ message: "Only hotel admins can download subscription invoices" });
    return;
  }
  const payment = await db.subscriptionPayment.findFirst({
    where: {
      id: String(req.params.id), businessId: req.user.businessId,
      locationId: req.user.locationId, status: "SUCCESS", currency: { in: ["NGN", "USD"] },
    },
    include: { location: true, subscription: { include: { plan: true } } },
  });
  if (!payment) {
    res.status(404).json({ message: "Invoice not found for this hotel" });
    return;
  }
  const dates = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium", timeZone: payment.location?.timezone ?? "UTC",
  });
  const reference = `HK-${payment.id}`;
  const invoice = subscriptionInvoice([
    "Paid subscription invoice",
    `Invoice number: ${reference}`,
    `Hotel: ${payment.location?.name || "Hotel location"}`,
    `Plan: ${payment.subscription.plan.name} (annual)`,
    `Term starts: ${dates.format(payment.subscription.startDate)}`,
    ...(payment.subscription.endDate ? [`Term ends: ${dates.format(payment.subscription.endDate)}`] : []),
    `Paid on: ${dates.format(payment.paidAt)}`,
    `Amount paid: ${payment.currency} ${payment.amount.toLocaleString("en-US")}`,
  ]);
  res.type("application/pdf").attachment(`${reference}.pdf`).set("Cache-Control", "private, no-store").send(invoice);
}
