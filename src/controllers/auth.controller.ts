import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";

const prisma = new PrismaClient();

export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
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
            defaultCheckoutTime: true,
            defaultCheckinTime: true,
          },
        },
        business: {
          select: {
            currency: {
              select: {
                code: true,
                symbol: true,
              },
            },
          },
        },
      },
    });
    res.json({
      ...user,
      permissions: req.permissions ?? [],
    });
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
