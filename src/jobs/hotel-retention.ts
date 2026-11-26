import { pathToFileURL } from "node:url";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { getBachsCheckout } from "../lib/bachs.js";
import { escapeHtml, sendEmail } from "../lib/email.service.js";

const day = 86_400_000;
const noticeDays = 30;
const inactiveDays = 180;
const db = new PrismaClient();

async function removeLocation(tx: Prisma.TransactionClient, locationId: string, businessId: string) {
  const inventory = { locationId };
  const memos = await tx.stockAdjustmentMemo.findMany({
    where: { lines: { some: { inventory } } }, select: { id: true },
  });

  await tx.posOrder.deleteMany({ where: { register: { locationId } } });
  await tx.posRegister.deleteMany({ where: { locationId } });
  await tx.payment.deleteMany({ where: { locationId } });
  await tx.stockMovement.deleteMany({ where: { batch: { inventory } } });
  await tx.stockBatch.deleteMany({ where: { inventory } });
  await tx.productStockAdjustment.deleteMany({ where: { inventory } });
  await tx.stockAdjustmentMemo.deleteMany({
    where: { id: { in: memos.map(({ id }) => id) }, lines: { none: {} } },
  });
  await tx.productInventory.deleteMany({ where: inventory });
  await tx.productImage.deleteMany({ where: { product: { locationId } } });
  await tx.product.deleteMany({ where: { locationId } });
  await tx.productCategory.deleteMany({ where: { locationId } });
  await tx.productUnit.deleteMany({ where: { locationId } });
  await tx.diningTable.deleteMany({ where: { locationId } });
  await tx.userDepartment.deleteMany({ where: { locationId } });
  await tx.userLocation.deleteMany({ where: { locationId } });
  await tx.department.deleteMany({ where: { locationId } });
  await tx.rolePermission.deleteMany({ where: { role: { locationId } } });
  await tx.subscriptionPayment.deleteMany({ where: { locationId, businessId } });
  await tx.subscription.deleteMany({ where: { locationId, businessId } });
  await tx.location.delete({ where: { id: locationId, businessId } });

  // Business accounts may operate other hotels or be referenced by their history.
  if (await tx.location.count({ where: { businessId } })) return;
  const users = await tx.user.findMany({ where: { businessId }, select: { id: true, email: true } });
  const ids = users.map(({ id }) => id);
  await tx.verification.deleteMany({ where: {
    OR: [{ identifier: { in: users.map(({ email }) => email) } },
      { identifier: { startsWith: "reset-password:" }, value: { in: ids } }],
  } });
  await tx.user.deleteMany({ where: { id: { in: ids }, businessId } });
  await tx.business.delete({ where: { id: businessId } });
}

async function clearStaleCheckout(db: PrismaClient, locationId: string, now: Date) {
  const pending = await db.subscriptionCheckout.findMany({
    where: { locationId, closedAt: null },
    select: { id: true, checkoutId: true, createdAt: true },
  });
  for (const order of pending) {
    if (order.checkoutId) {
      const session = await getBachsCheckout(order.checkoutId);
      if (session.payment_status === "processing" || session.payment_status === "succeeded"
        || !["expired", "cancelled"].includes(session.status)) continue;
    } else if (now.getTime() - order.createdAt.getTime() < 7 * day) {
      continue;
    }
    await db.subscriptionCheckout.updateMany({
      where: { id: order.id, closedAt: null, checkoutId: order.checkoutId },
      data: { closedAt: now },
    });
  }
}

export async function runRetention(db: PrismaClient, { dryRun = false, locationId }: { dryRun?: boolean; locationId?: string } = {}) {
  const now = new Date();
  const warningCutoff = new Date(now.getTime() - (inactiveDays - noticeDays) * day);
  const deletionCutoff = new Date(now.getTime() - inactiveDays * day);
  const noticeCutoff = new Date(now.getTime() - noticeDays * day);
  const billingUrl = new URL("/settings/subscription", process.env.FRONTEND_URL);


  const eligibility = {
    lastActivityAt: { lte: warningCutoff },
    AND: [
      { OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }] },
      { subscriptions: { none: { OR: [{ endDate: null }, { endDate: { gt: now } }] } } },
    ],
  } satisfies Prisma.LocationWhereInput;

  const candidates = await db.location.findMany({
    where: { ...eligibility, ...(locationId ? { id: locationId } : {}) },
    select: {
      id: true, name: true, timezone: true, businessId: true, lastActivityAt: true, deletionNoticeAt: true,
      business: { select: {
        users: { where: { isOwner: true }, select: { email: true, emailVerified: true }, orderBy: { createdAt: "asc" } },
      } },
    },
  });
  let warned = 0;
  let deleted = 0;
  for (const hotel of candidates) {
    const anchor = hotel.lastActivityAt.getTime();
    try {
      if (dryRun) continue;
      await clearStaleCheckout(db, hotel.id, now);
      const eligible = { ...eligibility, id: hotel.id, businessId: hotel.businessId,
        subscriptionCheckouts: { none: { closedAt: null } } } satisfies Prisma.LocationWhereInput;

      if (hotel.deletionNoticeAt) {
        if (anchor > deletionCutoff.getTime() || hotel.deletionNoticeAt > noticeCutoff) continue;
        const purged = await db.$transaction(async (tx) => {
          // Coordinate with location creation and activity before rechecking eligibility.
          await tx.$queryRaw`SELECT id FROM Business WHERE id = ${hotel.businessId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM Location WHERE id = ${hotel.id} FOR UPDATE`;
          const stillEligible = await tx.location.findFirst({
            where: {
              ...eligible, lastActivityAt: { lte: deletionCutoff }, deletionNoticeAt: { lte: noticeCutoff },
            },
            select: { id: true },
          });
          if (!stillEligible) return false;
          await removeLocation(tx, hotel.id, hotel.businessId);
          return true;
        }, { isolationLevel: "ReadCommitted", timeout: 60_000 });
        if (purged) deleted++;
        continue;
      }

      if (!hotel.business.users.length || !await db.location.findFirst({
        where: { ...eligible, deletionNoticeAt: null }, select: { id: true },
      })) continue;
      const deletionDate = new Date(Math.max(anchor + inactiveDays * day, now.getTime() + noticeDays * day));
      const dateLabel = new Intl.DateTimeFormat("en-NG", { dateStyle: "long", timeZone: hotel.timezone }).format(deletionDate);
      const verified = hotel.business.users.filter(({ emailVerified }) => emailVerified);
      for (const owner of verified.length ? verified : hotel.business.users.slice(0, 1)) {
        await sendEmail({
          to: owner.email,
          subject: "Your inactive Hotelkeepa hotel is scheduled for deletion",
          html: `<p>${escapeHtml(hotel.name || "Your hotel")} has been inactive and has no active subscription. Its data will be permanently deleted on or after ${escapeHtml(dateLabel)}.</p><p>Sign in and open that hotel to keep it. <a href="${escapeHtml(billingUrl.href)}">Sign in to Hotelkeepa</a></p>`,
        });
      }
      const recorded = await db.location.updateMany({
        where: { ...eligible, deletionNoticeAt: null }, data: { deletionNoticeAt: now },
      });
      warned += recorded.count;
    } catch (error) {
      process.exitCode = 1;
      console.error("Hotel retention failed for location", hotel.id, error instanceof Error ? error.name : "Unknown error");
    }
  }
  console.log(`Hotel retention: ${candidates.length} candidates, ${warned} warned, ${deleted} deleted${dryRun ? " (dry run)" : ""}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runRetention(db, { dryRun: process.argv.includes("--dry-run") })
    .catch((error: unknown) => {
      console.error("Could not run Hotelkeepa retention", error instanceof Error ? error.name : "Unknown error");
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
