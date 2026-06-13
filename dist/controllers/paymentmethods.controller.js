import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";
import z from "zod";
const prisma = new PrismaClient();
const paginationSchema = z.object({
    limit: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 10)),
    status: z.string().optional(),
    page: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 1)),
});
const updatePaymentMethodSchema = z
    .object({
    label: z
        .string()
        .trim()
        .min(1, "Payment method label is required")
        .max(255, "Payment method label must be less than 256 characters")
        .optional(),
    isActive: z.boolean().optional(),
})
    .refine((data) => data.label !== undefined || data.isActive !== undefined, "At least one field (label or isActive) is required");
export const fetchPaymentMethods = async (req, res) => {
    try {
        const result = paginationSchema.safeParse(req.query);
        if (!result.success) {
            res.status(400).json({
                errors: result.error.issues.map((err) => ({
                    field: err.path.join("."),
                    message: err.message,
                })),
                message: "Invalid pagination parameters",
            });
            return;
        }
        const { limit, page, status = "active" } = result.data;
        const skip = (page - 1) * limit;
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        const where = {
            locationId: user.locationId,
            type: "payment",
            ...(status === "all"
                ? {}
                : status === "inactive"
                    ? { isActive: false }
                    : { isActive: true }),
        };
        const [paymentMethods, total] = await Promise.all([
            prisma.customLabels.findMany({
                orderBy: {
                    label: "asc",
                },
                select: {
                    id: true,
                    isActive: true,
                    label: true,
                },
                skip,
                take: limit,
                where,
            }),
            prisma.customLabels.count({
                where,
            }),
        ]);
        res.status(200).json({
            data: paymentMethods,
            pagination: {
                currentPage: page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Internal server error",
        });
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/payment-methods",
            method: "GET",
        });
    }
};
export const fetchPaymentMethodById = async (req, res) => {
    try {
        const paymentMethodId = req.params.id.toString();
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        const paymentMethod = await prisma.customLabels.findFirst({
            select: {
                id: true,
                isActive: true,
                label: true,
            },
            where: {
                locationId: user.locationId,
                id: paymentMethodId,
                type: "payment",
            },
        });
        if (!paymentMethod) {
            res.status(404).json({
                message: "Payment method not found",
            });
            return;
        }
        res.status(200).json({
            data: paymentMethod,
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Internal server error",
        });
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/payment-methods/:id",
            method: "GET",
            params: req.params,
        });
    }
};
export const updatePaymentMethod = async (req, res) => {
    try {
        const paymentMethodId = req.params.id.toString();
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        const result = updatePaymentMethodSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                errors: result.error.issues.map((err) => ({
                    field: err.path.join("."),
                    message: err.message,
                })),
                message: "Validation failed",
            });
            return;
        }
        const existingPaymentMethod = await prisma.customLabels.findFirst({
            where: {
                locationId: user.locationId,
                id: paymentMethodId,
                type: "payment",
            },
        });
        if (!existingPaymentMethod) {
            res.status(404).json({
                message: "Payment method not found",
            });
            return;
        }
        const { isActive, label } = result.data;
        if (label && label !== existingPaymentMethod.label) {
            const duplicatePaymentMethod = await prisma.customLabels.findFirst({
                where: {
                    locationId: user.locationId,
                    id: {
                        not: paymentMethodId,
                    },
                    label,
                    type: "payment",
                },
            });
            if (duplicatePaymentMethod) {
                res.status(400).json({
                    message: "A payment method with this label already exists",
                });
                return;
            }
        }
        const updatedPaymentMethod = await prisma.customLabels.update({
            data: {
                ...(label !== undefined ? { label } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
            },
            select: {
                createdAt: true,
                id: true,
                isActive: true,
                label: true,
                updatedAt: true,
            },
            where: {
                id: paymentMethodId,
            },
        });
        res.status(200).json({
            data: updatedPaymentMethod,
            message: "Payment method updated successfully",
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Internal server error",
        });
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/payment-methods/:id",
            method: "PUT",
            params: req.params,
            requestBody: req.body,
        });
    }
};
