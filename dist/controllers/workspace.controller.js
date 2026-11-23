import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client.js";
import { canAccessLocation, canManageDepartments } from "../lib/workspace-policy.js";
import { locationSchema, departmentSchema, updateDepartmentSchema, departmentMembersSchema, locationMemberSchema } from "../lib/workspace-schema.js";
import { DEFAULT_ROLES } from "../lib/defaultRoles.js";
export class WorkspaceError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function assert(condition, status, message) {
    if (!condition)
        throw new WorkspaceError(status, message);
}
const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), search: z.string().max(191).optional() });
// Dependency injection lets access-boundary tests run without a live database.
export function workspaceHandlers(db) {
    const scoped = (req) => {
        assert(req.user?.businessId && req.user.locationId, 403, "No accessible hotel is selected");
        return { businessId: req.user.businessId, locationId: req.user.locationId, userId: req.user.id };
    };
    const manage = (req) => {
        assert(canManageDepartments(!!req.user?.isOwner, !!req.locationAdmin, req.permissions ?? []), 403, "You do not have permission to manage departments");
    };
    const owner = (req) => assert(req.user?.isOwner, 403, "Only the business owner can manage hotel access");
    const wrap = (action) => async (req, res) => {
        try {
            await action(req, res);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ message: error.issues[0]?.message ?? "Invalid input", errors: error.issues });
                return;
            }
            if (error instanceof WorkspaceError) {
                res.status(error.status).json({ message: error.message });
                return;
            }
            const code = error?.code;
            if (code === "P2002") {
                res.status(409).json({ message: "That name is already used in this hotel or business" });
                return;
            }
            if (code === "P2003") {
                res.status(409).json({ message: "This record is in use. Disable it instead of deleting it." });
                return;
            }
            console.error("Hotel management request failed", error instanceof Error ? error.name : "Unknown error");
            res.status(500).json({ message: "Could not save hotel settings. Please try again." });
        }
    };
    const findDepartment = async (req) => {
        const scope = scoped(req);
        const department = await db.department.findFirst({ where: { id: String(req.params.id), locationId: scope.locationId } });
        assert(department, 404, "Department not found in this hotel");
        return department;
    };
    return {
        listLocations: wrap(async (req, res) => {
            assert(req.user?.businessId, 403, "Business access is required");
            const { page, limit, search } = pageSchema.parse(req.query);
            const where = { businessId: req.user.businessId, isDeleted: false, isActive: true,
                ...(search ? { name: { contains: search } } : {}),
                ...(req.user.isOwner ? {} : { userAccess: { some: { userId: req.user.id, isActive: true } } }) };
            const [data, total] = await Promise.all([
                db.location.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit,
                    select: { id: true, name: true, address: true, city: true, state: true, timezone: true, defaultCheckoutTime: true, isActive: true, _count: { select: { departments: true } } } }),
                db.location.count({ where }),
            ]);
            res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
        }),
        createLocation: wrap(async (req, res) => {
            const { businessId, userId } = scoped(req);
            assert(req.user?.isOwner || req.locationAdmin || req.permissions?.includes("locations:create"), 403, "You do not have permission to create hotels");
            const input = locationSchema.parse(req.body);
            const data = await db.$transaction(async (tx) => {
                // Serialize creations for this business so concurrent requests cannot bypass a plan cap.
                await tx.business.update({ where: { id: businessId }, data: { updatedAt: new Date() } });
                const subscription = await tx.subscription.findFirst({
                    where: { businessId, locationId: null, startDate: { lte: new Date() }, OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
                    orderBy: { createdAt: "desc" }, include: { plan: true },
                });
                if (subscription?.plan.maxLocations != null) {
                    const count = await tx.location.count({ where: { businessId, isDeleted: false } });
                    assert(count < subscription.plan.maxLocations, 409, "Your subscription has reached its hotel location limit");
                }
                const location = await tx.location.create({ data: { ...input, businessId } });
                const permissions = await tx.permission.findMany({ select: { id: true, code: true } });
                let adminRoleId = "";
                for (const definition of DEFAULT_ROLES) {
                    const role = await tx.role.create({ data: { locationId: location.id, name: definition.name, isAdmin: definition.isAdmin,
                            rolePermissions: { create: permissions.filter((p) => definition.permissions.includes(p.code)).map((p) => ({ permissionId: p.id })) } } });
                    if (role.isAdmin)
                        adminRoleId = role.id;
                }
                await tx.userLocation.create({ data: { userId, locationId: location.id, roleId: adminRoleId, allDepartments: true } });
                await tx.customer.create({ data: { businessId, locationId: location.id, firstName: "Walking Customer", phone: "001", isWalking: true } });
                await tx.customLabels.createMany({ data: ["Cash", "Bank Transfer", "Card", "Mobile Money", "Other"].map((label, index) => ({ label, type: "payment", isActive: index < 3, locationId: location.id })) });
                const departments = input.setupPreset === "full_service" ? ["Main Store", "Bar", "Restaurant"] : input.setupPreset === "reservations_bar" ? ["Bar"] : [];
                if (departments.length)
                    await tx.department.createMany({ data: departments.map((name) => ({ name, locationId: location.id, holdsInventory: true, canSell: name !== "Main Store", managesTables: name !== "Main Store", kitchenOrders: name === "Restaurant", invoiceHeading: `${location.name} — ${name}`.slice(0, 191) })) });
                return location;
            });
            res.status(201).json({ data, message: "Hotel location created" });
        }),
        switchLocation: wrap(async (req, res) => {
            assert(req.user?.businessId && req.session?.id, 401, "Sign in to switch hotels");
            const locationId = String(req.params.id);
            const [location, membership] = await Promise.all([
                db.location.findUnique({ where: { id: locationId } }),
                db.userLocation.findUnique({ where: { userId_locationId: { userId: req.user.id, locationId } } }),
            ]);
            assert(canAccessLocation({ id: req.user.id, businessId: req.user.businessId, isOwner: req.user.isOwner }, location, membership), 403, "You do not have access to this hotel");
            await db.session.update({ where: { id: req.session.id }, data: { activeLocationId: locationId } });
            res.json({ message: "Hotel switched", locationId });
        }),
        listDepartments: wrap(async (req, res) => {
            const { locationId, userId } = scoped(req);
            const canManage = canManageDepartments(!!req.user?.isOwner, !!req.locationAdmin, req.permissions ?? []);
            const data = await db.department.findMany({
                where: { locationId, ...(!canManage ? { isActive: true, ...(!req.allDepartments ? { users: { some: { userId, isActive: true } } } : {}) } : {}) },
                orderBy: { name: "asc" }, include: { _count: { select: { users: true } } },
            });
            res.json({ data, canManage });
        }),
        createDepartment: wrap(async (req, res) => {
            manage(req);
            const { locationId } = scoped(req);
            const input = departmentSchema.strict().parse(req.body);
            const data = await db.department.create({ data: { ...input, locationId } });
            res.status(201).json({ data, message: "Department created" });
        }),
        updateDepartment: wrap(async (req, res) => {
            manage(req);
            const department = await findDepartment(req);
            const input = updateDepartmentSchema.parse(req.body);
            const data = await db.department.update({ where: { id: department.id }, data: { ...input,
                    ...(input.isActive === undefined ? {} : { disabledAt: input.isActive ? null : new Date() }) } });
            res.json({ data, message: "Department updated" });
        }),
        deleteDepartment: wrap(async (req, res) => {
            manage(req);
            const department = await findDepartment(req);
            await db.$transaction(async (tx) => {
                const [memberCount, tableCount] = await Promise.all([
                    tx.userDepartment.count({ where: { departmentId: department.id } }),
                    tx.diningTable.count({ where: { departmentId: department.id } }),
                ]);
                assert(memberCount === 0 && tableCount === 0, 409, "This department has staff or tables attached. Disable it instead.");
                // Future stock/sales tables must also RESTRICT deletion via foreign keys.
                await tx.department.delete({ where: { id: department.id } });
            });
            res.json({ message: "Unused department deleted" });
        }),
        departmentMembers: wrap(async (req, res) => {
            manage(req);
            const department = await findDepartment(req);
            const data = await db.userLocation.findMany({ where: { locationId: department.locationId, isActive: true, user: { businessId: req.user.businessId, isActive: true } },
                select: { userId: true, allDepartments: true, role: { select: { isAdmin: true } }, user: { select: { id: true, name: true, email: true, isOwner: true } },
                    departments: { where: { departmentId: department.id, isActive: true }, select: { role: true } } } });
            res.json({ data: data.map((member) => ({ ...member.user, allDepartments: member.allDepartments || member.user.isOwner || !!member.role?.isAdmin, assignment: member.departments[0]?.role ?? null })) });
        }),
        saveDepartmentMembers: wrap(async (req, res) => {
            manage(req);
            const department = await findDepartment(req);
            const { members } = departmentMembersSchema.parse(req.body);
            assert(department.isActive, 409, "Reactivate this department before assigning staff");
            await db.$transaction(async (tx) => {
                const eligible = await tx.userLocation.count({ where: { locationId: department.locationId, userId: { in: members.map((member) => member.userId) }, isActive: true, user: { businessId: req.user.businessId, isActive: true } } });
                assert(eligible === members.length, 400, "Each staff member must have active access to this hotel");
                await tx.userDepartment.updateMany({ where: { departmentId: department.id, userId: { notIn: members.map((member) => member.userId) } }, data: { isActive: false } });
                for (const member of members)
                    await tx.userDepartment.upsert({ where: { userId_departmentId: { userId: member.userId, departmentId: department.id } },
                        create: { ...member, locationId: department.locationId, departmentId: department.id }, update: { role: member.role, isActive: true } });
            });
            res.json({ message: "Department staff updated" });
        }),
        locationMembers: wrap(async (req, res) => {
            owner(req);
            const { businessId } = scoped(req);
            const locationId = String(req.params.id);
            assert(await db.location.findFirst({ where: { id: locationId, businessId, isDeleted: false } }), 404, "Hotel not found");
            const [users, roles] = await Promise.all([
                db.user.findMany({ where: { businessId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, isOwner: true, locationAccess: { where: { locationId }, select: { roleId: true, isActive: true, allDepartments: true } } } }),
                db.role.findMany({ where: { locationId }, select: { id: true, name: true, isAdmin: true } }),
            ]);
            res.json({ users, roles });
        }),
        saveLocationMember: wrap(async (req, res) => {
            owner(req);
            const { businessId } = scoped(req);
            const locationId = String(req.params.id), userId = String(req.params.userId);
            const input = locationMemberSchema.parse(req.body);
            const [location, user, role] = await Promise.all([
                db.location.findFirst({ where: { id: locationId, businessId, isActive: true, isDeleted: false } }),
                db.user.findFirst({ where: { id: userId, businessId, isActive: true } }),
                db.role.findFirst({ where: { id: input.roleId, locationId } }),
            ]);
            assert(location && user && role, 400, "Choose a user and role belonging to this business and hotel");
            assert(!user.isOwner, 400, "The business owner already has access to all hotels");
            await db.$transaction(async (tx) => {
                await tx.userLocation.upsert({ where: { userId_locationId: { userId, locationId } }, create: { ...input, userId, locationId }, update: input });
                if (user.locationId === locationId)
                    await tx.user.update({ where: { id: userId }, data: { roleId: input.roleId } });
            });
            res.json({ message: "Hotel access updated" });
        }),
    };
}
export const workspace = workspaceHandlers(new PrismaClient());
