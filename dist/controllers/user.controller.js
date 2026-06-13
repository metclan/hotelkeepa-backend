import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";
import { sendInviteEmail } from "../lib/email.service.js";
import { auth } from "../auth.js";
import crypto from "crypto";
// Validation schema for pagination
const usersPaginationSchema = z.object({
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
const inviationPaginationSchema = z.object({
    limit: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val) : 10)),
    status: z.string().optional(),
    page: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val) : 1)),
    search: z.string().optional(),
});
const modifyUserRoleSchema = z.object({
    roleId: z.string().optional(),
});
const prisma = new PrismaClient();
export const fetchUsers = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        const { search, limit = 5, page } = usersPaginationSchema.parse(req.query);
        const skip = (page - 1) * limit;
        // Fetch the user
        const where = {
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
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                orderBy: { name: "asc" },
                select: {
                    name: true,
                    isOwner: true,
                    email: true,
                    id: true,
                    role: {
                        select: {
                            name: true,
                        },
                    },
                },
                skip,
                take: limit,
                where,
            }),
            prisma.user.count({ where }),
        ]);
        res.status(200).json({
            data: users,
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
            endpoint: "/api/v1/users",
            method: "GET",
            requestQuery: req.query,
        });
        res.status(500).json({
            message: "Failed to fetch users",
        });
    }
};
export const sendInvitation = async (req, res) => {
    const { email, name, roleId, locationId } = req.body;
    // Ensure that this user isn't already on the database
    const existingUser = await prisma.user.findUnique({
        where: {
            email,
        },
    });
    if (existingUser) {
        res.status(409).json({ message: "Email already exists" });
        return;
    }
    // check if already invited or already a user
    const existing = await prisma.invitation.findFirst({
        where: { email, status: "pending" },
    });
    if (existing) {
        res
            .status(409)
            .json({ message: "An invite has already been sent to this email" });
        return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.invitation.create({
        data: {
            email,
            name,
            token,
            roleId,
            locationId,
            businessId: req.user.businessId,
            invitedById: req.user.id,
            expiresAt,
        },
    });
    await sendInviteEmail({
        to: email,
        name,
        inviteUrl: `${process.env.FRONTEND_URL}/invite?token=${token}`,
        invitedBy: req.user.name,
        expiresAt,
    });
    res.status(201).json({ message: "Invitation sent successfully" });
};
export const validateInvitation = async (req, res) => {
    const { token } = req.query;
    if (!token) {
        res.status(400).json({ message: "Token not found" });
        return;
    }
    const invitation = await prisma.invitation.findUnique({
        where: { token: token },
        include: { role: true, location: true },
    });
    if (!invitation) {
        res.status(404).json({ message: "Invalid invite link" });
        return;
    }
    if (invitation.status !== "pending") {
        res.status(400).json({ message: "This invite has already been used" });
        return;
    }
    if (invitation.expiresAt < new Date()) {
        await prisma.invitation.update({
            where: { id: invitation.id },
            data: { status: "expired" },
        });
        res.status(400).json({ message: "This invite link has expired " });
        return;
    }
    res.json({
        email: invitation.email,
        name: invitation.name,
        role: invitation.role.name,
        location: invitation.location.name,
    });
};
export const acceptInvitation = async (req, res) => {
    const { token, password } = req.body;
    const invitation = await prisma.invitation.findUnique({
        where: { token },
    });
    if (!invitation ||
        invitation.status !== "pending" ||
        invitation.expiresAt < new Date()) {
        res.status(400).json({ message: "Invalid or expired invite" });
        return;
    }
    const newUser = await auth.api.signUpEmail({
        body: {
            email: invitation.email,
            name: invitation.name,
            password,
        },
    });
    await prisma.user.update({
        where: { id: newUser.user.id },
        data: {
            roleId: invitation.roleId,
            locationId: invitation.locationId,
            businessId: invitation.businessId,
            isOwner: false,
            onboardingStage: 2,
        },
    });
    await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "accepted", acceptedAt: new Date() },
    });
    res.json({ message: "Account created successfully, please sign in" });
};
export const fetchInvitations = async (req, res) => {
    try {
        const { search, limit = 5, status, page, } = inviationPaginationSchema.parse(req.query);
        const skip = (page - 1) * limit;
        const where = {
            businessId: req.user.businessId,
        };
        if (status) {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { email: { contains: search } },
                { name: { contains: search } },
            ];
        }
        await prisma.invitation.updateMany({
            where: {
                businessId: req.user.businessId,
                status: "pending",
                expiresAt: { lt: new Date() },
            },
            data: { status: "expired" },
        });
        const [invitations, total] = await Promise.all([
            prisma.invitation.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    status: true,
                    expiresAt: true,
                },
            }),
            prisma.invitation.count({ where }),
        ]);
        res.status(200).json({
            data: invitations,
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
            endpoint: "/api/v1/users/invitations",
            method: "GET",
            requestBody: req.body,
        });
        res.status(500).json({
            message: "Failed to fetch invitations",
        });
    }
};
export const revokeInvitation = async (req, res) => {
    try {
        const { id } = req.params;
        const invitation = await prisma.invitation.findFirst({
            where: {
                id: id.toString(),
            },
        });
        if (!invitation) {
            res.status(404).json({ message: "Invitation not found" });
            return;
        }
        if (invitation.businessId !== req.user.businessId) {
            res.status(403).json({ meessage: "Forbidden" });
            return;
        }
        if (invitation.status === "accepted") {
            res
                .status(400)
                .json({ message: "cannot revoke an already accepted invitation" });
            return;
        }
        if (invitation.status === "revoked") {
            res.status(400).json({ message: "Invitation is already revoked" });
            return;
        }
        await prisma.invitation.update({
            where: { id: id.toString() },
            data: { status: "revoked" },
        });
        res.json({ message: "Invitation revoked successfully" });
    }
    catch (error) {
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/users/invitations/:id/revoke",
            method: "PATCH",
            requestBody: req.params,
        });
        res.status(500).json({
            message: "Failed to revoke invitation",
        });
    }
};
export const resendInvitation = async (req, res) => {
    try {
        const { id } = req.params;
        const invitation = await prisma.invitation.findFirst({
            where: {
                id: id.toString(),
            },
            include: {
                invitedBy: { select: { name: true } },
                role: { select: { name: true } },
                location: { select: { name: true } },
            },
        });
        if (!invitation) {
            res.status(404).json({ message: "Invitation not found" });
            return;
        }
        if (invitation.businessId !== req.user.businessId) {
            res.status(403).json({ meessage: "Forbidden" });
            return;
        }
        if (invitation.status === "accepted") {
            res
                .status(400)
                .json({ message: "cannot revoke an already accepted invitation" });
            return;
        }
        if (invitation.status === "revoked") {
            res.status(400).json({
                message: "Cannot resend a revoked invitation, create new one instead",
            });
            return;
        }
        // generate a fresh token and reset expiry
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await prisma.invitation.update({
            where: { id: id.toString() },
            data: { status: "pending", token, expiresAt },
        });
        await sendInviteEmail({
            to: invitation.email,
            name: invitation.name,
            inviteUrl: `${process.env.FRONTEND_URL}/invite?token=${token}`,
            invitedBy: req.user.name,
            expiresAt,
        });
        res.json({ message: "Invitation revoked successfully" });
    }
    catch (error) {
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/users/invitations/:id/resend",
            method: "POST",
            requestBody: req.params,
        });
        res.status(500).json({
            message: "Failed to resend invitation",
        });
    }
};
export const modifyUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        if (!user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const result = modifyUserRoleSchema.safeParse(req.body);
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
        const { roleId } = result.data;
        // Ensure this user exists
        const alreadyExists = await prisma.user.findFirst({
            where: { id: id.toString() },
        });
        if (!alreadyExists) {
            res.status(403).json({ message: "User not found " });
            return;
        }
        await prisma.user.update({
            where: { id: id.toString() },
            data: { roleId: roleId },
        });
        res.status(200).json({ message: "Updated user role successfully" });
    }
    catch (error) {
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/users/:id/modify-role",
            method: "PATCH",
            requestBody: req.body,
        });
        res.status(500).json({
            message: "Failed to update role",
        });
    }
};
