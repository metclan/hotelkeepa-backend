import { Request, Response, NextFunction } from "express";
import { auth } from "../auth.js";
import { PrismaClient } from "../generated/prisma/client.js";

import { canAccessLocation } from "../lib/workspace-policy.js";

const prisma = new PrismaClient();

declare global {
  namespace Express {
    interface Request {
      user?: typeof auth.$Infer.Session.user;
      session?: typeof auth.$Infer.Session.session;
      permissions?: string[];
      locationAdmin?: boolean;
      allDepartments?: boolean;
    }
  }
}

export function createRequireAuth(db: PrismaClient, getSession: (headers: Request["headers"]) => Promise<typeof auth.$Infer.Session | null>) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const session = await getSession(req.headers);
      if (!session) {
        res.status(401).json({ message: "Unauthorized, please sign in" });
        return;
      }
      // Session user fields can be cached. Resolve access from persisted records on every request.
      const [user, storedSession] = await Promise.all([
        db.user.findUnique({ where: { id: session.user.id } }),
        db.session.findUnique({ where: { id: session.session.id } }),
      ]);
      if (!user?.isActive || !storedSession) {
        res.status(401).json({ message: "Account or session is no longer active" });
        return;
      }
      let locationId = storedSession.activeLocationId ?? user.locationId;
      let location = locationId ? await db.location.findUnique({ where: { id: locationId } }) : null;
      let membership = locationId ? await db.userLocation.findUnique({ where: { userId_locationId: { userId: user.id, locationId } } }) : null;
      if (!canAccessLocation(user, location, membership)) {
        // Revoked/disabled hotels must never remain the scope of later requests.
        const fallback = await db.location.findFirst({
          where: { businessId: user.businessId ?? "", isActive: true, isDeleted: false,
            ...(user.isOwner ? {} : { userAccess: { some: { userId: user.id, isActive: true } } }) },
          orderBy: { createdAt: "asc" },
        });
        location = fallback;
        locationId = fallback?.id ?? "";
        membership = locationId ? await db.userLocation.findUnique({ where: { userId_locationId: { userId: user.id, locationId } } }) : null;
        await db.session.update({ where: { id: storedSession.id }, data: { activeLocationId: fallback?.id ?? null } });
      }
      const roleId = membership?.roleId ?? (locationId === user.locationId ? user.roleId : null);
      const role = roleId ? await db.role.findFirst({ where: { id: roleId, locationId: locationId ?? "" } }) : null;
      req.user = { ...session.user, businessId: user.businessId ?? "", locationId: locationId ?? "",
        roleId: role?.id ?? "", isOwner: user.isOwner, onboardingStage: user.onboardingStage };
      req.locationAdmin = role?.isAdmin ?? false;
      req.allDepartments = user.isOwner || req.locationAdmin || !!membership?.allDepartments;
      req.session = session.session;
      // Mutations from stale management screens must not affect a different hotel.
      const expectedLocation = req.get("X-Location-Id");
      if (expectedLocation && expectedLocation !== locationId && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        res.status(409).json({ message: "Your selected hotel changed. Reload before saving." });
        return;
      }
      const now = new Date();
      if (location && location.lastActivityAt?.getTime() <= now.getTime() - 3_600_000) {
        const activity = await db.location.updateMany({
          where: { id: location.id, isDeleted: false, isActive: true, lastActivityAt: { lte: new Date(now.getTime() - 3_600_000) } },
          data: { lastActivityAt: now, deletionNoticeAt: null },
        });
        if (!activity.count && !await db.location.findFirst({
          where: { id: location.id, isDeleted: false, isActive: true }, select: { id: true },
        })) {
          res.status(409).json({ message: "This hotel is no longer available" });
          return;
        }
      }
      next();
    } catch (err) {
      console.error("Could not resolve authenticated hotel access");
      res.status(503).json({ message: "Could not load hotel access. Please try again." });
    }
  };
}
export const requireAuth = createRequireAuth(prisma, (headers) => auth.api.getSession({ headers: headers as unknown as Headers }));

export const requireOnboarding = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.user?.isOwner && req.user.onboardingStage < 2) {
    res.status(403).json({
      message: "Please complete your account setup first",
      redirect: "/onboarding",
    });
    return;
  }
  next();
};

export const requireOwner = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user?.isOwner) {
    res.status(403).json({ message: "Forbidden, owner access only" });
    return;
  }
  next();
};

const permissionCache = new Map<
  string,
  { permissions: string[]; cachedAt: number }
>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const getUserPermissions = async (roleId: string): Promise<string[]> => {
  const cached = permissionCache.get(roleId);
  // return from cache if still valid
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.permissions;
  }
  // fetch from DB
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId },
    select: {
      permission: {
        select: { code: true },
      },
    },
  });
  const permissions = rolePermissions.map((rp) => rp.permission.code);
  permissionCache.set(roleId, { permissions, cachedAt: Date.now() });
  return permissions;
};

// clear cache when role permissions change
export const clearPermissionCache = (roleId: string) => {
  permissionCache.delete(roleId);
};
export const loadPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.user?.isOwner || req.locationAdmin) {
    return next();
  }
  if (!req.user?.roleId) {
    req.permissions = [];
    return next();
  }
  req.permissions = await getUserPermissions(req.user.roleId);
  next();
};

export const requirePermission = (...codes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.isOwner || req.locationAdmin) return next();
    const hasPermission = codes.every((code) =>
      req.permissions?.includes(code),
    );
    if (!hasPermission) {
      res.status(403).json({
        message: "You don't have permission to perform this action",
      });
      return;
    }
    next();
  };
};
