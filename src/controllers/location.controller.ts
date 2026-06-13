import { Response, Request } from "express";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";

// Validation schema for pagination
const locationPaginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 10)),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 1)),
  search: z.string().optional(),
});

const prisma = new PrismaClient();

export const fetchLocations = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const {
      search,
      limit = 5,
      page,
    } = locationPaginationSchema.parse(req.query);
    const skip = (page - 1) * limit;
    // Fetch locations
    const where: any = {
      businessId: user.businessId,
    };
    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
          },
        },
      ];
    }
    const [locations, total] = await Promise.all([
      prisma.location.findMany({
        orderBy: { name: "asc" },
        select: {
          name: true,
          id: true,
          address: true,
          isActive: true,
        },
        skip,
        take: limit,
        where,
      }),
      prisma.location.count({ where }),
    ]);
    res.status(200).json({
      data: locations,
      pagination: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: "/api/v1/locations",
        method: "GET",
        requestQuery: req.query,
      },
    );
    res.status(500).json({
      message: "Failed to fetch locations",
    });
  }
};
