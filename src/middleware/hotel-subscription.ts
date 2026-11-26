import type { RequestHandler } from "express";
import { PrismaClient } from "../generated/prisma/client.js";

export function createHotelSubscriptionGate(db: PrismaClient): RequestHandler {
  return async (req, res, next) => {
    const scope = req.user;
    if (!scope?.businessId || !scope.locationId) {
      res.status(403).json({ message: "Select a hotel first" });
      return;
    }

    const now = new Date();
    const entitled = await db.location.findFirst({
      where: {
        id: scope.locationId, businessId: scope.businessId, isActive: true, isDeleted: false,
        OR: [
          { trialEndsAt: { gt: now } },
          { subscriptions: { some: {
            businessId: scope.businessId, startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gt: now } }],
          } } },
        ],
      },
      select: { id: true },
    });
    if (!entitled) {
      res.status(402).json({ code: "SUBSCRIPTION_REQUIRED", message: "This hotel needs an active subscription. Go to Settings → Subscription to choose a plan." });
      return;
    }
    next();
  };
}

export const requireHotelSubscription = createHotelSubscriptionGate(new PrismaClient());
