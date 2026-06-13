import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";
import { z } from "zod";
const prisma = new PrismaClient();
// Validation schema for pagination
const reservationPaginationSchema = z.object({
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
export const fetchReservationsReport = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        const { search, limit = 20, page, } = reservationPaginationSchema.parse(req.query);
        const skip = (page - 1) * limit;
        // Fetch the room
        const where = {
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
        const [reservations, total] = await Promise.all([
            prisma.reservation.findMany({
                orderBy: { reservationDate: "desc" },
                select: {
                    id: true,
                    bookingNumber: true,
                    paymentStatus: true,
                    totalAmount: true,
                    reservationDate: true,
                    user: {
                        select: {
                            name: true,
                        },
                    },
                    arrivalDate: true,
                    departureDate: true,
                    customer: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            phone: true,
                        },
                    },
                },
                skip,
                take: limit,
                where,
            }),
            prisma.reservation.count({ where }),
        ]);
        res.status(200).json({
            data: reservations,
            pagination: {
                limit,
                page,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (error) {
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/reports/reservations",
            method: "GET",
            requestBody: req.body,
        });
        res.status(500).json({
            message: "Failed to fetch reservation",
        });
    }
};
