import { Response, Request } from "express";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";

export const roomTypeSchema = z.object({
  name: z.string().trim().min(1, "Room type name is required"),
  pricePerNight: z.coerce.number().min(0, "Price cannot be negative"),
  maxAdults: z.coerce.number().int().min(0, "Max adults cannot be negative"),
  maxChildren: z
    .union([
      z.coerce.number().int().min(0, "Max children cannot be negative"),
      z.literal(""),
    ])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  maxOccupancy: z.coerce
    .number()
    .int()
    .min(0, "Max occupancy cannot be negative"),
  description: z.string().trim().optional(),
});

// Validation schema for pagination
const roomTypePaginationSchema = z.object({
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

export const createRoomType = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const result = roomTypeSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    const {
      name,
      pricePerNight,
      description,
      maxAdults,
      maxChildren,
      maxOccupancy,
    } = result.data;
    // Ensure no other room type has same name
    const alreadyExists = await prisma.roomType.findFirst({ where: { name } });
    if (alreadyExists) {
      res.status(409).json({ message: "Room type already exists " });
      return;
    }
    await prisma.roomType.create({
      data: {
        locationId: user.locationId,
        name,
        pricePerNight,
        maxAdults,
        maxChildren,
        maxOccupancy,
        description,
      },
    });
    res.status(200).json({ message: "Created room type successfully" });
  } catch (error) {
    console.log(error);
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: "/api/v1/room-types",
        method: "POST",
        requestBody: req.body,
      },
    );
    res.status(500).json({
      message: "Failed to create room type",
    });
  }
};

export const fetchRoomTypes = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const {
      search,
      limit = 10,
      page,
    } = roomTypePaginationSchema.parse(req.query);
    const skip = (page - 1) * limit;
    // Fetch the room types
    const where: any = {
      locationId: user.locationId,
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
    const [roomTypes, total] = await Promise.all([
      prisma.roomType.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          pricePerNight: true,
          maxAdults: true,
          maxChildren: true,
          maxOccupancy: true,
        },
        skip,
        take: limit,
        where,
      }),
      prisma.roomType.count({ where }),
    ]);
    res.status(200).json({
      data: roomTypes,
      pagination: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {}
};
