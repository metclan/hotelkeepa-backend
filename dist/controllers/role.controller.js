import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client.js";
import { sendTelegramError } from "../utils/telegram.js";
// Validation schema for pagination
const rolesPaginationSchema = z.object({
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
const roleSchema = z.object({
    name: z.string().trim().min(1, "Role name is required"),
    permissions: z.array(z.string()).min(1, "Select at least one permission"),
});
const prisma = new PrismaClient();
export const createRole = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        const result = roleSchema.safeParse(req.body);
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
        const { name, permissions } = result.data;
        // Ensure no other role has same name
        const alreadyExists = await prisma.role.findFirst({
            where: { name, locationId: user.locationId },
        });
        if (alreadyExists) {
            res.status(409).json({ message: "Role already exists " });
            return;
        }
        await prisma.$transaction(async (tx) => {
            const newRole = await tx.role.create({
                data: {
                    locationId: user.locationId,
                    name,
                },
            });
            await tx.rolePermission.createMany({
                data: permissions.map((permissionId) => ({
                    permissionId,
                    roleId: newRole.id,
                })),
            });
        });
        res.status(200).json({ message: "Created role successfully" });
    }
    catch (error) {
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/roles",
            method: "POST",
            requestBody: req.body,
        });
        res.status(500).json({
            message: "Failed to create role",
        });
    }
};
export const fetchRoles = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        const { search, limit = 5, page } = rolesPaginationSchema.parse(req.query);
        const skip = (page - 1) * limit;
        // Fetch the room
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
        const [roles, total] = await Promise.all([
            prisma.role.findMany({
                orderBy: { name: "asc" },
                select: {
                    name: true,
                    isAdmin: true,
                    id: true,
                },
                skip,
                take: limit,
                where,
            }),
            prisma.role.count({ where }),
        ]);
        res.status(200).json({
            data: roles,
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
            endpoint: "/api/v1/roles",
            method: "GET",
            requestQuery: req.query,
        });
        res.status(500).json({
            message: "Failed to fetch roles",
        });
    }
};
export const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        const result = roleSchema.safeParse(req.body);
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
        const { name, permissions } = result.data;
        // Ensure this role exists
        const alreadyExists = await prisma.role.findFirst({
            where: { id: id.toString(), locationId: user.locationId },
        });
        if (!alreadyExists) {
            res.status(403).json({ message: "Role not found " });
            return;
        }
        await prisma.$transaction(async (tx) => {
            const newRole = await tx.role.update({
                where: { id: id.toString(), locationId: user.locationId },
                data: {
                    name,
                },
            });
            await tx.rolePermission.deleteMany({ where: { roleId: id.toString() } });
            await tx.rolePermission.createMany({
                data: permissions.map((permissionId) => ({
                    permissionId,
                    roleId: newRole.id,
                })),
            });
        });
        res.status(200).json({ message: "Updated role successfully" });
    }
    catch (error) {
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/roles/:id",
            method: "PUT",
            requestBody: req.body,
        });
        res.status(500).json({
            message: "Failed to update role",
        });
    }
};
export const fetchRoleById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        // Ensure this role exists
        const role = await prisma.role.findFirst({
            where: { id: id.toString(), locationId: user.locationId },
            select: {
                name: true,
                rolePermissions: {
                    select: {
                        permissionId: true,
                    },
                },
            },
        });
        if (!role) {
            res.status(403).json({ message: "Role not found " });
            return;
        }
        res.status(200).json({ role });
    }
    catch (error) {
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/roles/:id",
            method: "GET",
            requestBody: req.params,
        });
        res.status(500).json({
            message: "Failed to fetch role by id",
        });
    }
};
export const deleteRole = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        if (!user) {
            res.status(401).json({ messgae: "Unauthorized" });
            return;
        }
        // Ensure this role exists
        const alreadyExists = await prisma.role.findFirst({
            where: { id: id.toString(), locationId: user.locationId },
        });
        if (!alreadyExists) {
            res.status(403).json({ message: "Role not found " });
            return;
        }
        await prisma.$transaction(async (tx) => {
            await tx.rolePermission.deleteMany({ where: { roleId: id.toString() } });
            await tx.role.delete({
                where: { id: id.toString(), locationId: user.locationId },
            });
        });
        res.status(200).json({ message: "Deleted role successfully" });
    }
    catch (error) {
        sendTelegramError(error instanceof Error ? error : new Error(String(error)), {
            endpoint: "/api/v1/roles/:id",
            method: "DELETE",
            requestBody: req.params,
        });
        res.status(500).json({
            message: "Failed to update role",
        });
    }
};
