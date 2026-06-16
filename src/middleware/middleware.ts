import { Request, Response, NextFunction } from "express";
import { auth } from "../auth.js";
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient();

declare global {
  namespace Express {
    interface Request {
      user?: typeof auth.$Infer.Session.user;
      session?: typeof auth.$Infer.Session.session;
      permissions?: string[];
    }
  }
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
    });
    if (!session) {
      res.status(401).json({ message: "Unauthorized, please sign in" });
      return;
    }
    req.user = session.user;
    req.session = session.session;
    next();
  } catch (err) {
    res.status(401).json({ message: "Unathorized" });
  }
};
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
  if (req.user?.isOwner) {
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
    if (req.user?.isOwner) return next();
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
