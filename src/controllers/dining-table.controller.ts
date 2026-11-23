import type { Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient();
const name = z.string().trim().min(1, "Table name is required").max(191);
const createSchema = z.object({ name, departmentId: z.string().min(1, "Select a department") }).strict();
const bulkSchema = z.object({
  departmentId: z.string().min(1, "Select a department"),
  prefix: z.string().trim().min(1).max(100).default("Table"),
  start: z.coerce.number().int().min(0),
  end: z.coerce.number().int().min(0),
}).strict().refine(({ start, end }) => end >= start, { message: "End number must be greater than or equal to start number", path: ["end"] })
  .refine(({ start, end }) => end - start + 1 <= 500, { message: "Create no more than 500 tables at once", path: ["end"] });
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(191).optional(),
  departmentId: z.string().optional(),
  status: z.enum(["all", "active", "disabled"]).default("all"),
});
const updateSchema = z.object({ name: name.optional(), departmentId: z.string().min(1).optional(), isActive: z.boolean().optional() }).strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change");

const sendError = (res: Response, error: unknown) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: error.issues[0]?.message || "Invalid table details" });
    return;
  }
  if ((error as { code?: string })?.code === "P2002") {
    res.status(409).json({ message: "That table name already exists in this department" });
    return;
  }
  console.error("Dining table request failed", error instanceof Error ? error.message : "Unknown error");
  res.status(500).json({ message: "Could not save tables. Please try again." });
};

const departmentScope = (req: Request) => req.allDepartments
  ? {}
  : { users: { some: { userId: req.user!.id, isActive: true } } };

export const listDiningTables = async (req: Request, res: Response) => {
  try {
    const locationId = req.user?.locationId;
    if (!locationId) { res.status(403).json({ message: "No hotel is selected" }); return; }
    const { page, limit, search, departmentId, status } = listSchema.parse(req.query);
    const departmentWhere = { locationId, isActive: true, managesTables: true, ...departmentScope(req) };
    const where = {
      locationId,
      department: departmentWhere,
      ...(departmentId ? { departmentId } : {}),
      ...(search ? { name: { contains: search } } : {}),
      ...(status === "all" ? {} : { isActive: status === "active" }),
    };
    const [data, total, departments] = await Promise.all([
      prisma.diningTable.findMany({
        where,
        orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: { department: { select: { id: true, name: true } } },
      }),
      prisma.diningTable.count({ where }),
      prisma.department.findMany({ where: departmentWhere, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    res.json({ data, departments, pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }, canManage: !!req.user?.isOwner || !!req.locationAdmin || !!req.permissions?.includes("tables:manage") });
  } catch (error) { sendError(res, error); }
};

export const createDiningTablesBulk = async (req: Request, res: Response) => {
  try {
    const locationId = req.user?.locationId;
    if (!locationId) { res.status(403).json({ message: "No hotel is selected" }); return; }
    const input = bulkSchema.parse(req.body);
    const department = await prisma.department.findFirst({ where: { id: input.departmentId, locationId, isActive: true, managesTables: true, ...departmentScope(req) } });
    if (!department) { res.status(400).json({ message: "Select an active department with table management enabled" }); return; }
    const names = Array.from({ length: input.end - input.start + 1 }, (_, index) => `${input.prefix} ${input.start + index}`);
    const conflicts = await prisma.diningTable.findMany({ where: { departmentId: input.departmentId, name: { in: names } }, select: { name: true } });
    if (conflicts.length) { res.status(409).json({ message: `Already exists in ${department.name}: ${conflicts.map((table) => table.name).join(", ")}` }); return; }
    await prisma.diningTable.createMany({ data: names.map((tableName) => ({ name: tableName, departmentId: input.departmentId, locationId })) });
    res.status(201).json({ count: names.length, message: `${names.length} tables created` });
  } catch (error) { sendError(res, error); }
};

export const createDiningTable = async (req: Request, res: Response) => {
  try {
    const locationId = req.user?.locationId;
    if (!locationId) { res.status(403).json({ message: "No hotel is selected" }); return; }
    const input = createSchema.parse(req.body);
    const department = await prisma.department.findFirst({ where: { id: input.departmentId, locationId, isActive: true, managesTables: true, ...departmentScope(req) } });
    if (!department) { res.status(400).json({ message: "Select an active department with table management enabled" }); return; }
    const data = await prisma.diningTable.create({ data: { ...input, locationId }, include: { department: { select: { id: true, name: true } } } });
    res.status(201).json({ data, message: "Table created" });
  } catch (error) { sendError(res, error); }
};

export const updateDiningTable = async (req: Request, res: Response) => {
  try {
    const locationId = req.user?.locationId;
    if (!locationId) { res.status(403).json({ message: "No hotel is selected" }); return; }
    const input = updateSchema.parse(req.body);
    const existing = await prisma.diningTable.findFirst({ where: { id: String(req.params.id), locationId, department: departmentScope(req) } });
    if (!existing) { res.status(404).json({ message: "Table not found" }); return; }
    if (input.departmentId) {
      const department = await prisma.department.findFirst({ where: { id: input.departmentId, locationId, isActive: true, managesTables: true, ...departmentScope(req) } });
      if (!department) { res.status(400).json({ message: "Select an active department with table management enabled" }); return; }
    }
    const data = await prisma.diningTable.update({ where: { id: existing.id }, data: input, include: { department: { select: { id: true, name: true } } } });
    res.json({ data, message: "Table updated" });
  } catch (error) { sendError(res, error); }
};

export const deleteDiningTable = async (req: Request, res: Response) => {
  try {
    const locationId = req.user?.locationId;
    if (!locationId) { res.status(403).json({ message: "No hotel is selected" }); return; }
    const existing = await prisma.diningTable.findFirst({ where: { id: String(req.params.id), locationId, department: departmentScope(req) } });
    if (!existing) { res.status(404).json({ message: "Table not found" }); return; }
    await prisma.diningTable.delete({ where: { id: existing.id } });
    res.json({ message: "Table deleted" });
  } catch (error) { sendError(res, error); }
};
