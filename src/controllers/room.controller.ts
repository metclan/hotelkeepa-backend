import { Response, Request } from "express";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";

export const ROOM_STATUSES = [
  "available",
  "occupied",
  "maintenance",
  "reserved",
] as const;
export const roomSchema = z.object({
  roomNumber: z.string().trim().min(1, "Room number is required"),
  roomTypeId: z.string().trim().min(1, "Room type is required"),
  floor: z.string().trim().optional(),
  status: z.enum(ROOM_STATUSES),
});

// Validation schema for pagination
const roomPaginationSchema = z.object({
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

export const createRoom = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const result = roomSchema.safeParse(req.body);
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
    const { roomNumber, roomTypeId, floor, status } = result.data;
    // Ensure no other room has same name
    const alreadyExists = await prisma.room.findFirst({
      where: { roomNumber },
    });
    if (alreadyExists) {
      res.status(409).json({ message: "Room already exists " });
      return;
    }
    await prisma.room.create({
      data: {
        locationId: user.locationId,
        roomNumber,
        roomTypeId,
        floor,
        status,
      },
    });
    res.status(200).json({ message: "Created room successfully" });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: "/api/v1/rooms",
        method: "POST",
        requestBody: req.body,
      },
    );
    res.status(500).json({
      message: "Failed to create room",
    });
  }
};

export const fetchRooms = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    const { search, limit = 10, page } = roomPaginationSchema.parse(req.query);
    const skip = (page - 1) * limit;
    // Fetch the room
    const where: any = {
      locationId: user.locationId,
    };
    if (search) {
      where.OR = [
        {
          roomNumber: {
            contains: search,
          },
        },
      ];
    }
    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        orderBy: { roomNumber: "asc" },
        select: {
          id: true,
          status: true,
          floor: true,
          roomNumber: true,
          roomType: {
            select: {
              id: true,
              name: true,
              pricePerNight: true,
              maxAdults: true,
              maxChildren: true,
              maxOccupancy: true,
            },
          },
        },
        skip,
        take: limit,
        where,
      }),
      prisma.room.count({ where }),
    ]);
    res.status(200).json({
      data: rooms,
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
        endpoint: "/api/v1/rooms",
        method: "GET",
        requestQuery: req.query,
      },
    );
    res.status(500).json({
      message: "Failed to fetch room",
    });
  }
};
