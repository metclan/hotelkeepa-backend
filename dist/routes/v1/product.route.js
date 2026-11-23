import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { requirePermission } from "../../middleware/middleware.js";
import { getLogoStorage } from "../../lib/logo-storage.js";
import { validLogo } from "../../lib/onboarding-schema.js";
import { moveStock } from "../../lib/product-stock.js";
const db = new PrismaClient();
class AdjustmentConflict extends Error {
}
const router = Router();
const name = z.string().trim().min(1).max(191);
const money = z.number().min(0).max(999999999999.99).multipleOf(0.01);
const quantity = z.number().min(0).max(99999999999.999).multipleOf(0.001);
const date = z.iso.date();
const productSchema = z.object({
    name, sku: name.nullable(), categoryId: name.nullable(), unitId: name,
    costPrice: money, reorderQuantity: quantity,
    inventory: z.array(z.object({
        departmentId: name, costPrice: money, sellingPrice: money.nullable(),
        quantity, expectedQuantity: quantity.optional(), stockDate: date, expiryDate: date.nullable(),
    }).refine(row => !row.expiryDate || row.expiryDate >= row.stockDate, "Expiry cannot precede the stock date")),
}).strict().refine(input => new Set(input.inventory.map(row => row.departmentId)).size === input.inventory.length, "Duplicate department");
const departmentsFor = (req, locationId) => ({
    locationId, isActive: true, holdsInventory: true,
    ...(req.allDepartments ? {} : { users: { some: { userId: req.user.id, isActive: true } } }),
});
function handle(action) {
    return async (req, res) => {
        const locationId = req.user?.locationId;
        if (!locationId) {
            res.status(403).json({ message: "Select a hotel first" });
            return;
        }
        try {
            await action(req, res, locationId);
        }
        catch (error) {
            if (error instanceof AdjustmentConflict) {
                res.status(409).json({ message: error.message });
                return;
            }
            if (error instanceof z.ZodError) {
                res.status(400).json({ message: error.issues[0]?.message });
                return;
            }
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                res.status(409).json({ message: "Category and unit names must be unique per hotel. SKUs must be unique across the business." });
                return;
            }
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
                res.status(409).json({ message: "This item is still referenced by a catalog record, which may include a disabled product." });
                return;
            }
            console.error("Product catalog request failed", error);
            res.status(500).json({ message: "Could not complete the catalog request" });
        }
    };
}
router.get("/options", requirePermission("products:view"), handle(async (req, res, locationId) => {
    const [categories, units, departments] = await Promise.all([
        db.productCategory.findMany({ where: { locationId }, orderBy: { name: "asc" } }),
        db.productUnit.findMany({ where: { locationId }, orderBy: { name: "asc" } }),
        db.department.findMany({ where: departmentsFor(req, locationId), orderBy: { name: "asc" }, select: { id: true, name: true, canSell: true } }),
    ]);
    res.json({ categories, units, departments });
}));
for (const kind of ["categories", "units"]) {
    const categorySchema = z.object({ name }).strict();
    const unitSchema = z.object({ name, symbol: z.string().trim().min(1).max(30) }).strict();
    const canManage = requirePermission("products:manage");
    router.post(`/${kind}`, canManage, handle(async (req, res, locationId) => {
        if (!req.allDepartments) {
            res.sendStatus(403);
            return;
        }
        const item = kind === "units"
            ? await db.productUnit.create({ data: { locationId, ...unitSchema.parse(req.body) } })
            : await db.productCategory.create({ data: { locationId, ...categorySchema.parse(req.body) } });
        res.status(201).json(item);
    }));
    router.patch(`/${kind}/:id`, canManage, handle(async (req, res, locationId) => {
        if (!req.allDepartments) {
            res.sendStatus(403);
            return;
        }
        const where = { id: String(req.params.id), locationId };
        const result = kind === "units"
            ? await db.productUnit.updateMany({ where, data: unitSchema.parse(req.body) })
            : await db.productCategory.updateMany({ where, data: categorySchema.parse(req.body) });
        res.sendStatus(result.count ? 204 : 404);
    }));
    router.delete(`/${kind}/:id`, canManage, handle(async (req, res, locationId) => {
        if (!req.allDepartments) {
            res.sendStatus(403);
            return;
        }
        const where = { id: String(req.params.id), locationId };
        const result = kind === "units"
            ? await db.productUnit.deleteMany({ where })
            : await db.productCategory.deleteMany({ where });
        res.sendStatus(result.count ? 204 : 404);
    }));
}
router.get("/", requirePermission("products:view"), handle(async (req, res, locationId) => {
    const { page, limit, search, categoryId, unitId, departmentId, productId } = z.object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().trim().max(191).optional(), categoryId: name.optional(),
        unitId: name.optional(), departmentId: name.optional(), productId: name.optional(),
    }).parse(req.query);
    const department = departmentsFor(req, locationId);
    const where = {
        id: productId, locationId, categoryId, unitId, disabledAt: null,
        ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }] } : {}),
        ...(departmentId || !req.allDepartments ? { inventory: { some: { department, departmentId } } } : {}),
    };
    const [data, total] = await db.$transaction([
        db.product.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit,
            include: { category: true, unit: true, images: { select: { id: true, url: true }, orderBy: { createdAt: "asc" } }, inventory: { where: { department }, include: { department: { select: { name: true } }, batches: { where: { movements: { some: { type: "sale", quantity: { lt: 0 } } } }, take: 1, select: { id: true } } } } } }),
        db.product.count({ where }),
    ]);
    res.json({ data: data.map(product => ({ ...product, inventory: product.inventory.map(({ batches, ...row }) => ({ ...row, hasSold: batches.length > 0 })) })), total });
}));
router.get("/adjustments", requirePermission("products:view"), handle(async (req, res, locationId) => {
    const { page, userId, dateFrom, dateTo, departmentId, memoId } = z.object({
        page: z.coerce.number().int().min(1).max(100000).default(1), userId: name.optional(), dateFrom: date.optional(), dateTo: date.optional(),
        departmentId: name.optional(), memoId: name.optional(),
    }).parse(req.query);
    const department = departmentsFor(req, locationId);
    delete department.isActive;
    delete department.holdsInventory;
    const visibleLine = { inventory: { locationId, department } };
    const where = {
        id: memoId, deletedAt: null,
        lines: { some: { ...visibleLine, userId, departmentId } },
        effectiveDate: { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined },
    };
    const [data, total, actors] = await db.$transaction([
        db.stockAdjustmentMemo.findMany({ where, orderBy: [{ effectiveDate: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20,
            include: { lines: { where: visibleLine, orderBy: { id: "asc" },
                    include: { inventory: { select: { product: { select: { name: true } }, department: { select: { name: true } } } } } } } }),
        db.stockAdjustmentMemo.count({ where }),
        db.productStockAdjustment.findMany({ where: visibleLine, distinct: ["userId"], select: { userId: true } }),
    ]);
    const users = await db.user.findMany({ where: { id: { in: actors.map(actor => actor.userId) }, businessId: req.user.businessId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    res.json({ data, total, users });
}));
async function nextMemoNumber(tx, locationId, effectiveDate) {
    const sequence = await tx.documentSequence.upsert({
        where: { locationId_transactionType: { locationId, transactionType: "stock_adjustment" } },
        create: { locationId, transactionType: "stock_adjustment", currentNumber: 1 },
        update: { currentNumber: { increment: 1 } },
    });
    return `SA-${effectiveDate.getUTCFullYear()}-${String(sequence.currentNumber).padStart(4, "0")}`;
}
async function lockMemo(tx, req, locationId, id) {
    const rows = await tx.$queryRaw `SELECT id FROM StockAdjustmentMemo WHERE id = ${id} AND deletedAt IS NULL FOR UPDATE`;
    if (!rows.length)
        return null;
    const department = departmentsFor(req, locationId);
    return tx.stockAdjustmentMemo.findFirst({
        where: { id, lines: { some: { inventory: { locationId, department } }, every: { inventory: { locationId, department } } } },
        include: { lines: true },
    });
}
async function reverseMemo(tx, id, userId, type) {
    const movements = await tx.stockMovement.findMany({ where: { referenceId: id, type: "adjustment" }, include: { batch: true } });
    for (const movement of movements) {
        const delta = movement.quantity.negated();
        const batch = await tx.stockBatch.updateMany({
            where: { id: movement.stockBatchId, ...(delta.isNegative() ? { quantityLeft: { gte: delta.abs() } } : {}) },
            data: { quantityLeft: { increment: delta } },
        });
        if (!batch.count)
            throw new AdjustmentConflict("This adjustment added stock that has already been used. It cannot be reversed safely.");
        await tx.productInventory.update({
            where: { productId_departmentId: { productId: movement.batch.productId, departmentId: movement.batch.departmentId } },
            data: { quantity: { increment: delta } },
        });
        await tx.stockMovement.create({ data: {
                stockBatchId: movement.stockBatchId, quantity: delta, unitCost: movement.unitCost, type,
                referenceId: id, reason: type === "adjustment_deleted" ? "Deleted stock adjustment" : "Reversed before editing stock adjustment",
                userId, effectiveDate: new Date(),
            } });
    }
    await tx.stockAdjustmentMemo.update({ where: { id }, data: { deletedAt: new Date() } });
}
router.post("/adjustments", requirePermission("products:manage"), handle(async (req, res, locationId) => {
    const input = z.object({
        effectiveDate: date, reason: name, note: z.string().trim().max(1000).optional(), replaceId: name.optional(),
        lines: z.array(z.object({ productId: name, departmentId: name, expectedQuantity: quantity, quantity })).min(1).max(50),
    }).strict().parse(req.body);
    const keys = input.lines.map(line => JSON.stringify([line.productId, line.departmentId]));
    if (new Set(input.lines.map(line => line.departmentId)).size !== 1) {
        res.status(400).json({ message: "All products on a stock adjustment memo must belong to the same department." });
        return;
    }
    if (new Set(keys).size !== keys.length || (!input.replaceId && input.lines.some(line => line.quantity === line.expectedQuantity))) {
        res.status(400).json({ message: "Each product and department pair must appear once and have a changed quantity." });
        return;
    }
    const result = await db.$transaction(async (tx) => {
        const original = input.replaceId ? await lockMemo(tx, req, locationId, input.replaceId) : null;
        if (input.replaceId && !original)
            return null;
        // Lock products in a consistent order before checking any starting balances.
        for (const id of [...new Set([...input.lines, ...(original?.lines ?? [])].map(line => line.productId))].sort()) {
            const locked = await tx.$queryRaw `SELECT id FROM Product WHERE id = ${id} AND locationId = ${locationId} AND disabledAt IS NULL FOR UPDATE`;
            if (!locked.length)
                return null;
        }
        const department = departmentsFor(req, locationId);
        const balances = await Promise.all(input.lines.map(line => tx.productInventory.findFirst({
            where: { productId: line.productId, departmentId: line.departmentId, locationId, department },
        })));
        if (!balances.every((balance, index) => balance?.quantity.equals(input.lines[index].expectedQuantity)))
            return null;
        const effectiveDate = new Date(input.effectiveDate);
        if (original)
            await reverseMemo(tx, original.id, req.user.id, "adjustment_edited");
        const memoNumber = original?.memoNumber ?? await nextMemoNumber(tx, locationId, effectiveDate);
        const memo = await tx.stockAdjustmentMemo.create({ data: { effectiveDate, note: input.note || null, memoNumber } });
        for (const [index, line] of input.lines.entries()) {
            const balance = original ? await tx.productInventory.findUniqueOrThrow({
                where: { productId_departmentId: { productId: line.productId, departmentId: line.departmentId } },
            }) : balances[index];
            await tx.productStockAdjustment.create({ data: {
                    memoId: memo.id, productId: line.productId, departmentId: line.departmentId,
                    previousQuantity: balance.quantity, newQuantity: line.quantity, userId: req.user.id, reason: input.reason,
                } });
            await moveStock(tx, {
                productId: line.productId, departmentId: line.departmentId, delta: new Prisma.Decimal(line.quantity).minus(balance.quantity),
                costPrice: balance.costPrice, stockDate: effectiveDate, expiryDate: null,
                userId: req.user.id, type: "adjustment", reason: input.reason, referenceId: memo.id,
            });
        }
        return memo;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (!result) {
        res.status(409).json({ message: "Stock changed or a line is unavailable. Reload the stock balances and review the memo." });
        return;
    }
    res.status(201).json({ id: result.id });
}));
router.delete("/adjustments/:id", requirePermission("products:manage"), handle(async (req, res, locationId) => {
    const result = await db.$transaction(async (tx) => {
        const memo = await lockMemo(tx, req, locationId, String(req.params.id));
        if (!memo)
            return false;
        for (const id of [...new Set(memo.lines.map(line => line.productId))].sort()) {
            await tx.$queryRaw `SELECT id FROM Product WHERE id = ${id} AND locationId = ${locationId} FOR UPDATE`;
        }
        await reverseMemo(tx, memo.id, req.user.id, "adjustment_deleted");
        return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (!result) {
        res.status(404).json({ message: "Adjustment not found" });
        return;
    }
    res.sendStatus(204);
}));
router.get("/:id/history", requirePermission("products:view"), handle(async (req, res, locationId) => {
    const { page, limit, type, direction, departmentId, dateFrom, dateTo } = z.object({
        page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
        type: z.enum(["opening", "adjustment", "adjustment_edited", "adjustment_deleted", "purchase", "sale", "transfer"]).optional(),
        direction: z.enum(["in", "out"]).optional(), departmentId: name.optional(), dateFrom: date.optional(), dateTo: date.optional(),
    }).parse(req.query);
    const productId = String(req.params.id);
    const department = { locationId, ...(req.allDepartments ? {} : { users: { some: { userId: req.user.id, isActive: true } } }) };
    const product = await db.product.findFirst({
        where: { id: productId, locationId, ...(req.allDepartments ? {} : { inventory: { some: { department } } }) },
        select: { id: true },
    });
    if (!product) {
        res.status(404).json({ message: "Product not found" });
        return;
    }
    const where = {
        batch: { productId, departmentId, inventory: { locationId, department } }, type,
        quantity: direction === "in" ? { gt: 0 } : direction === "out" ? { lt: 0 } : undefined,
        effectiveDate: { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined },
    };
    const [data, total] = await db.$transaction([
        db.stockMovement.findMany({
            where, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * limit, take: limit,
            select: {
                id: true, type: true, quantity: true, unitCost: true, effectiveDate: true, referenceId: true, reason: true,
                batch: { select: { inventory: { select: { department: { select: { name: true } } } } } },
            },
        }),
        db.stockMovement.count({ where }),
    ]);
    const memos = await db.stockAdjustmentMemo.findMany({ where: { id: { in: data.filter(row => row.type.startsWith("adjustment")).map(row => row.referenceId) } }, select: { id: true, memoNumber: true } });
    const departments = await db.department.findMany({ where: { ...department, productInventory: { some: { productId } } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    res.json({ data: data.map(row => ({ ...row, reference: row.type === "sale" ? row.reason : memos.find(memo => memo.id === row.referenceId)?.memoNumber ?? row.referenceId })), total, departments });
}));
// Catalog changes affect the whole hotel. Department staff can view their assigned inventory.
function saveProduct(edit) {
    return handle(async (req, res, locationId) => {
        if (!req.allDepartments) {
            res.status(403).json({ message: "Hotel-wide department access is required to manage the catalog" });
            return;
        }
        const { inventory, ...product } = productSchema.parse(req.body);
        const id = String(req.params.id);
        const result = await db.$transaction(async (tx) => {
            if (edit) {
                const locked = await tx.$queryRaw `SELECT id FROM Product WHERE id = ${id} AND locationId = ${locationId} AND disabledAt IS NULL FOR UPDATE`;
                if (!locked.length)
                    return 404;
                for (const row of inventory.filter(row => row.expectedQuantity !== undefined)) {
                    const where = { productId: id, departmentId: row.departmentId };
                    const current = await tx.productInventory.findUnique({ where: { productId_departmentId: where } });
                    if (!(current?.quantity ?? new Prisma.Decimal(0)).equals(row.expectedQuantity))
                        return 409;
                    if (await tx.stockMovement.findFirst({ where: { type: "sale", quantity: { lt: 0 }, batch: where }, select: { id: true } }))
                        return 422;
                }
            }
            const [unit, category, departments, existing] = await Promise.all([
                tx.productUnit.findFirst({ where: { id: product.unitId, locationId } }),
                product.categoryId ? tx.productCategory.findFirst({ where: { id: product.categoryId, locationId } }) : null,
                tx.department.findMany({ where: departmentsFor(req, locationId), select: { id: true, canSell: true } }),
                edit ? tx.product.findFirst({ where: { id, locationId, disabledAt: null } }) : null,
            ]);
            if (edit && !existing)
                return 404;
            if (!unit || (product.categoryId && !category) || inventory.length !== departments.length ||
                inventory.some(row => !departments.some(department => department.id === row.departmentId && (department.canSell || row.sellingPrice === null))))
                return 400;
            const saved = edit
                ? await tx.product.update({ where: { id_locationId: { id, locationId }, disabledAt: null }, data: product })
                : await tx.product.create({ data: { locationId, businessId: req.user.businessId, ...product } });
            for (const row of inventory) {
                const { quantity: openingQuantity, expectedQuantity, ...details } = row;
                const data = { ...details, stockDate: new Date(row.stockDate), expiryDate: row.expiryDate ? new Date(row.expiryDate) : null };
                await tx.productInventory.upsert({
                    where: { productId_departmentId: { productId: saved.id, departmentId: row.departmentId } },
                    create: { ...data, quantity: 0, locationId, productId: saved.id }, update: data,
                });
                if (!edit || expectedQuantity !== undefined)
                    await moveStock(tx, {
                        ...data, productId: saved.id, delta: new Prisma.Decimal(openingQuantity).minus(edit ? expectedQuantity : 0),
                        costPrice: new Prisma.Decimal(data.costPrice), type: "opening",
                        reason: edit ? "Opening quantity corrected from product edit" : "Opening inventory", userId: req.user.id,
                    });
            }
            return saved.id;
        });
        if (typeof result === "number") {
            const messages = { 404: "Product not found", 409: "Stock changed. Reload the product and review the new balance.", 422: "This department has sold this product. Use a stock adjustment memo to change its quantity." };
            res.status(result).json({ message: messages[result] ?? "Check the unit, category and current inventory departments, then reload if needed" });
            return;
        }
        res.status(edit ? 200 : 201).json({ id: result });
    });
}
router.post("/", requirePermission("products:manage"), saveProduct(false));
router.put("/:id", requirePermission("products:manage"), saveProduct(true));
router.patch("/:id/disable", requirePermission("products:manage"), handle(async (req, res, locationId) => {
    if (!req.allDepartments) {
        res.sendStatus(403);
        return;
    }
    const id = String(req.params.id);
    const product = await db.product.findFirst({ where: { id, locationId, disabledAt: null } });
    if (!product) {
        res.sendStatus(404);
        return;
    }
    const result = await db.product.updateMany({
        where: { id, locationId, disabledAt: null, sku: product.sku },
        data: { disabledAt: new Date(), archivedSku: product.sku, sku: `DISABLED-${randomUUID()}` },
    });
    res.sendStatus(result.count ? 204 : 409);
}));
router.post("/:id/images", requirePermission("products:manage"), handle(async (req, res, locationId) => {
    if (!req.allDepartments) {
        res.sendStatus(403);
        return;
    }
    const { image } = z.object({ image: z.string().refine(validLogo, "Choose a PNG, JPG or WebP image up to 200 KB") }).parse(req.body);
    const product = await db.product.findFirst({ where: { id: String(req.params.id), locationId, disabledAt: null }, include: { location: { include: { business: true } } } });
    if (!product) {
        res.sendStatus(404);
        return;
    }
    const storage = getLogoStorage();
    const uploaded = await storage.upload(product.businessId, product.location.business.name || product.location.name || "", image, "products");
    try {
        const saved = await db.productImage.create({ data: { productId: product.id, ...uploaded }, select: { id: true, url: true } });
        res.status(201).json(saved);
    }
    catch (error) {
        await storage.remove(uploaded.key);
        throw error;
    }
}));
router.delete("/:id/images/:imageId", requirePermission("products:manage"), handle(async (req, res, locationId) => {
    if (!req.allDepartments) {
        res.sendStatus(403);
        return;
    }
    const image = await db.productImage.findFirst({
        where: { id: String(req.params.imageId), productId: String(req.params.id), product: { locationId, disabledAt: null } },
    });
    if (!image) {
        res.sendStatus(404);
        return;
    }
    await getLogoStorage().remove(image.key);
    await db.productImage.deleteMany({ where: { id: image.id } });
    res.sendStatus(204);
}));
router.post("/:id/stock", requirePermission("products:manage"), handle(async (req, res, locationId) => {
    const input = z.object({
        departmentId: name, type: z.enum(["adjustment", "transfer", "purchase"]),
        mode: z.enum(["add", "remove", "set"]).default("add"),
        quantity, expectedQuantity: quantity.optional(), reason: name, destinationId: name.optional(), costPrice: money.optional(),
        stockDate: date, expiryDate: date.nullable().optional(), referenceId: name.optional(),
    }).strict().parse(req.body);
    const productId = String(req.params.id);
    const result = await db.$transaction(async (tx) => {
        // A row lock serializes stock posting with catalog edits and disabling.
        const locked = await tx.$queryRaw `SELECT id FROM Product WHERE id = ${productId} AND locationId = ${locationId} AND disabledAt IS NULL FOR UPDATE`;
        if (!locked.length)
            return "Product not found";
        const department = departmentsFor(req, locationId);
        const source = await tx.productInventory.findFirst({ where: { productId, departmentId: input.departmentId, department } });
        if (!source)
            return "Choose an accessible inventory department";
        if (input.type === "adjustment" && (input.expectedQuantity === undefined || !source.quantity.equals(input.expectedQuantity)))
            return "Stock changed or was not reviewed. Reload and confirm the current quantity.";
        const amount = new Prisma.Decimal(input.quantity);
        const movement = { productId, type: input.type, stockDate: new Date(input.stockDate), reason: input.reason, userId: req.user.id, referenceId: input.referenceId ?? randomUUID() };
        if (input.type !== "adjustment" && amount.isZero())
            return "Enter a positive quantity";
        if (input.expiryDate && input.expiryDate < input.stockDate)
            return "Expiry cannot precede the stock date";
        const delta = input.type === "transfer" || (input.type === "adjustment" && input.mode === "remove")
            ? amount.negated() : input.type === "adjustment" && input.mode === "set" ? amount.minus(source.quantity) : amount;
        if (source.quantity.plus(delta).isNegative())
            return "Insufficient stock in this department";
        if (input.type === "adjustment" && delta.isZero())
            return "Enter a quantity different from the current balance";
        const destination = input.type === "transfer" ? await tx.productInventory.findFirst({
            where: { productId, departmentId: input.destinationId ?? "", department },
        }) : null;
        if (input.type === "transfer" && (!destination || destination.departmentId === source.departmentId))
            return "Choose a different accessible destination";
        if (input.type === "purchase" && input.costPrice === undefined)
            return "Enter the purchase unit cost";
        if (input.type === "adjustment") {
            const memo = await tx.productStockAdjustment.create({ data: {
                    memo: { create: { effectiveDate: movement.stockDate, memoNumber: await nextMemoNumber(tx, locationId, movement.stockDate) } },
                    inventory: { connect: { productId_departmentId: { productId, departmentId: source.departmentId } } },
                    previousQuantity: source.quantity,
                    newQuantity: source.quantity.plus(delta), reason: input.reason, userId: req.user.id,
                } });
            movement.referenceId = memo.memoId;
        }
        const parts = await moveStock(tx, {
            ...movement, departmentId: source.departmentId, delta,
            costPrice: new Prisma.Decimal(input.costPrice ?? source.costPrice),
            expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        });
        if (destination)
            for (const part of parts)
                await moveStock(tx, {
                    ...movement, departmentId: destination.departmentId, delta: part.quantity, costPrice: part.costPrice, expiryDate: part.expiryDate,
                });
        return null;
    });
    if (result) {
        res.status(400).json({ message: result });
        return;
    }
    res.sendStatus(204);
}));
export { router as productRouter };
