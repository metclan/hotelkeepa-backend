import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";

const prisma = new PrismaClient();

export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        onboardingStage: true,
        isOwner: true,
        role: {
          select: {
            id: true,
            name: true,
            isAdmin: true,
          },
        },
        businessLocation: {
          select: {
            timezone: true,
            logo: true,
            defaultCheckoutTime: true,
            defaultCheckinTime: true,
          },
        },
        business: {
          select: {
            country: { select: { name: true } },
            currency: {
              select: {
                name: true,
                code: true,
                symbol: true,
              },
            },
          },
        },
      },
    });
    const [businessLocation, role] = await Promise.all([
      prisma.location.findUnique({ where: { id: req.user!.locationId ?? "" }, select: {
        id: true, name: true, address: true, city: true, state: true, timezone: true, logo: true,
        defaultCheckoutTime: true, defaultCheckinTime: true,
      } }),
      req.user!.roleId ? prisma.role.findFirst({ where: { id: req.user!.roleId, locationId: req.user!.locationId }, select: { id: true, name: true, isAdmin: true } }) : null,
    ]);
    res.json({ ...user, locationId: businessLocation?.id ?? null, businessLocation, role,
      allDepartments: req.allDepartments ?? false, permissions: req.permissions ?? [] });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: "/api/v1/auth/me",
        method: "GET",
        requestQuery: req.query,
      },
    );
    res.status(500).json({
      message: "Failed to fetch customers",
    });
  }
};
