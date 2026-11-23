import type { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import { bulkRoomNumbers, bulkRoomSchema } from "../lib/bulk-room-schema.js";

class BulkRoomError extends Error {
  constructor(public status: number, message: string, public conflicts?: string[]) { super(message); }
}
export function bulkRoomHandler(db: PrismaClient) {
  return async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) { res.status(401).json({ message: "Please sign in" }); return; }
    if (!user.locationId) { res.status(403).json({ message: "Select a hotel before creating rooms" }); return; }
    const result = bulkRoomSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ message: result.error.issues[0]?.message ?? "Invalid room range", errors: result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
      return;
    }
    const { startNumber, endNumber, roomTypeId, floor, status } = result.data;
    const roomNumbers = bulkRoomNumbers(startNumber, endNumber);
    try {
      const data = await db.$transaction(async (tx) => {
        const roomType = await tx.roomType.findFirst({ where: { id: roomTypeId, locationId: user.locationId } });
        if (!roomType) throw new BulkRoomError(400, "Room type must belong to the selected hotel");
        const existing = await tx.room.findMany({ where: { locationId: user.locationId, roomNumber: { in: roomNumbers } }, select: { roomNumber: true } });
        if (existing.length) {
          const conflicts = existing.map((room) => room.roomNumber);
          const summary = conflicts.slice(0, 10).join(", ") + (conflicts.length > 10 ? ` and ${conflicts.length - 10} more` : "");
          throw new BulkRoomError(409, `Rooms already exist: ${summary}. No rooms were created.`, conflicts);
        }
        // Keep the batch atomic, including concurrent unique-key conflicts.
        const created = await tx.room.createMany({ data: roomNumbers.map((roomNumber) => ({ locationId: user.locationId!, roomNumber, roomTypeId, floor: floor || undefined, status })) });
        return { count: created.count, roomNumbers };
      });
      res.status(201).json({ data, message: `${data.count} rooms created successfully` });
    } catch (error) {
      if (error instanceof BulkRoomError) { res.status(error.status).json({ message: error.message, conflicts: error.conflicts }); return; }
      if ((error as { code?: string })?.code === "P2002") {
        res.status(409).json({ message: "One or more room numbers already exist. No rooms were created. Refresh the room list and try again." });
        return;
      }
      console.error("Bulk room creation failed", error instanceof Error ? error.name : "Unknown error");
      res.status(500).json({ message: "Could not create rooms. Please try again." });
    }
  };
}
export const createBulkRooms = bulkRoomHandler(new PrismaClient());
