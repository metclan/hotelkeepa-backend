import { Response, Request } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";

const prisma = new PrismaClient();

export const fetchPermission = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const permissions = await prisma.permissionGroup.findMany({
      where: search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                },
              },
              {
                permissions: {
                  some: {
                    name: {
                      contains: search,
                    },
                  },
                },
              },
            ],
          }
        : undefined,
      select: {
        code: true,
        name: true,
        description: true,
        permissions: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
    res.status(200).json({ permissions });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: "/api/v1/permissions",
        method: "GET",
      },
    );
    res.status(500).json({
      message: "Failed to fetch permissions",
    });
  }
};
