import { Response, Request } from "express";
import { z } from "zod";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
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
  roomTypeId: z.string().optional(),
  status: z.string().optional(),
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
    if (!await prisma.roomType.findFirst({ where: { id: roomTypeId, locationId: user.locationId } })) {
      res.status(400).json({ message: "Room type must belong to the selected hotel" });
      return;
    }
    // Ensure no other room has same name
    const alreadyExists = await prisma.room.findFirst({
      where: { roomNumber, locationId: user.locationId },
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
    const { search, limit = 10, page, roomTypeId, status } = roomPaginationSchema.parse(req.query);
    const arrivalDate = typeof req.query.arrivalDate === "string" ? new Date(req.query.arrivalDate) : null;
    const departureDate = typeof req.query.departureDate === "string" ? new Date(req.query.departureDate) : null;
    const hasDateRange = arrivalDate && departureDate;
    if (
      (arrivalDate && !departureDate) ||
      (!arrivalDate && departureDate) ||
      (hasDateRange && (
        Number.isNaN(arrivalDate.getTime()) ||
        Number.isNaN(departureDate.getTime()) ||
        departureDate <= arrivalDate
      ))
    ) {
      res.status(400).json({ message: "Enter a valid arrival and departure date range" });
      return;
    }
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
        { floor: { contains: search } },
      ];
    }
    if (roomTypeId) where.roomTypeId = { in: roomTypeId.split(",").filter(Boolean) };
    if (status) where.status = { in: status.split(",").filter(Boolean) };

    const conflictingReservationWhere: Prisma.ReservationLineWhereInput = hasDateRange
      ? {
          status: { notIn: ["cancelled", "checked_out", "no_show"] },
          reservation: {
            arrivalDate: { lt: departureDate },
            departureDate: { gt: arrivalDate },
          },
        }
      : { id: "__no_date_range__" };
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
          reservationLines: {
            where: conflictingReservationWhere,
            select: { status: true },
          },
        },
        skip,
        take: limit,
        where,
      }),
      prisma.room.count({ where }),
    ]);
    res.status(200).json({
      data: rooms.map(({ reservationLines, ...room }) => {
        const hasCheckedInConflict = reservationLines.some((line) => line.status === "checked_in");
        const availabilityStatus = room.status === "maintenance"
          ? "maintenance"
          : hasCheckedInConflict
            ? "checked_in"
            : reservationLines.length > 0
              ? "reserved"
              : "available";

        return { ...room, availabilityStatus };
      }),
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
export const fetchRoomFilterOptions = async (req: Request, res: Response) => {
  const locationId = req.user?.locationId;
  if (!locationId) {
    res.status(403).json({ message: "Select a hotel to view room filters." });
    return;
  }
  try {
    const roomTypes = await prisma.roomType.findMany({
      where: { locationId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    });
    res.json({ roomTypes });
  } catch (error) {
    sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
      endpoint: "/api/v1/rooms/filter-options",
      method: "GET",
    });
    res.status(500).json({ message: "Failed to load room filter options." });
  }
};

export const fetchRoomById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!id) {
      res.status(400).json({ message: "Room ID not found" });
      return;
    }
    const room = await prisma.room.findUnique({
      where: {
        id: id.toString(),
        locationId: user.locationId,
      },
      select: {
        id: true,
        roomNumber: true,
        roomTypeId: true,
        floor: true,
        status: true,
        roomType: {
          select: { id: true, name: true, pricePerNight: true, maxAdults: true, maxChildren: true, maxOccupancy: true },
        },
      },
    });
    if (!room) {
      res.status(400).json({ message: "Room not found" });
      return;
    }
    res.status(200).json(room);
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
export const updateRoomStatus = async (req: Request, res: Response) => {
  const locationId = req.user?.locationId;
  const status = z.enum(["available", "maintenance"]).safeParse(req.body?.status);
  if (!locationId || !status.success) {
    res.status(400).json({ message: "Choose Available or Maintenance for a room at the selected hotel." });
    return;
  }
  try {
    const result = await prisma.room.updateMany({
      where: {
        id: String(req.params.id),
        locationId,
        status: { in: ["available", "maintenance"] },
        reservationLines: { none: { status: "checked_in" } },
      },
      data: { status: status.data },
    });
    if (!result.count) {
      res.status(409).json({ message: "Only available rooms or rooms under maintenance can be updated here." });
      return;
    }
    res.json({ status: status.data });
  } catch (error) {
    sendTelegramError(error instanceof Error ? error : new Error(String(error)), { endpoint: "/api/v1/rooms/:id/status", method: "PATCH" });
    res.status(500).json({ message: "Failed to update room status." });
  }
};

export const editRoom = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ messgae: "Unauthorized" });
      return;
    }
    if (!id) {
      res.status(400).json({ message: "Room ID not found" });
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
    if (!await prisma.roomType.findFirst({ where: { id: roomTypeId, locationId: user.locationId } })) {
      res.status(400).json({ message: "Room type must belong to the selected hotel" });
      return;
    }
    const room = await prisma.room.findUnique({
      where: {
        id: id.toString(),
        locationId: user.locationId,
      },
      select: {
        roomNumber: true,
        roomTypeId: true,
        floor: true,
        status: true,
      },
    });
    if (!room) {
      res.status(400).json({ message: "Room not found" });
      return;
    }
    await prisma.room.update({
      where: {
        id: id.toString(),
        locationId: user.locationId,
      },
      data: {
        roomNumber: roomNumber,
        roomTypeId,
        floor,
        status,
      },
    });
    res.status(200).json({ message: "Room updated successfully" });
  } catch (error) {
    sendTelegramError(
      error instanceof Error ? error : new Error(String(error)),
      {
        endpoint: `/api/v1/rooms/${id}`,
        method: "PATCH",
        requestQuery: req.query,
      },
    );
    res.status(500).json({
      message: "Failed to fetch room",
    });
  }
};
