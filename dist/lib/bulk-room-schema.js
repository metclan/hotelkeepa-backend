import { z } from "zod";
export const MAX_BULK_ROOMS = 500;
const roomNumber = z.string().trim().min(1, "Enter a room number")
    .max(9, "Use a room number with at most 9 digits")
    .regex(/^\d+$/, "Use whole numbers only");
export const bulkRoomSchema = z.object({
    startNumber: roomNumber,
    endNumber: roomNumber,
    roomTypeId: z.string().trim().min(1, "Room type is required"),
    floor: z.string().trim().max(191).optional(),
    status: z.enum(["available", "occupied", "maintenance", "reserved"]),
}).strict().superRefine((value, context) => {
    const start = Number(value.startNumber), end = Number(value.endNumber);
    if (end < start)
        context.addIssue({ code: "custom", path: ["endNumber"], message: "End room number must be greater than or equal to start" });
    if (end - start + 1 > MAX_BULK_ROOMS)
        context.addIssue({ code: "custom", path: ["endNumber"], message: `Create at most ${MAX_BULK_ROOMS} rooms at a time` });
});
export function bulkRoomNumbers(startNumber, endNumber) {
    const start = Number(startNumber), end = Number(endNumber);
    const padded = /^0\d/.test(startNumber) || /^0\d/.test(endNumber);
    const width = padded ? Math.max(startNumber.length, endNumber.length) : 0;
    return Array.from({ length: end - start + 1 }, (_, index) => String(start + index).padStart(width, "0"));
}
