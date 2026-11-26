import { requireHotelSubscription } from "../../middleware/hotel-subscription.js";
import { Router } from "express";
import type { Request, Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { requirePermission } from "../../middleware/middleware.js";
import { moveStock } from "../../lib/product-stock.js";

const db = new PrismaClient();
const router = Router();
const receiptTemplate = readFileSync(join(process.cwd(), "src/templates/pos.receipt.pos.hbs"), "utf8");
router.use(requirePermission("sales:pos"));
class PosError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function handle(action: (req: Request, res: Response, locationId: string, userId: string) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const locationId = req.user?.locationId;
    if (!locationId || !req.user) { res.status(403).json({ message: "Select a hotel first." }); return; }
    try { await action(req, res, locationId, req.user.id); }
    catch (err) {
      if (err instanceof PosError) { res.status(err.status).json({ message: err.message }); return; }
      if (err instanceof z.ZodError) { res.status(400).json({ message: err.issues[0]?.message }); return; }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ message: "This table or order has been opened by another user. Refresh and try again." }); return;
      }
      console.error("POS request failed", err);
      res.status(500).json({ message: "Could not complete the POS request." });
    }
  };
}
function scope(req: Request, locationId: string) {
  return { locationId, isActive: true, canSell: true, holdsInventory: true,
    ...(req.allDepartments ? {} : { users: { some: { userId: req.user!.id, isActive: true } } }) };
}
const departmentSelect = { id: true, name: true, managesTables: true, kitchenOrders: true } as const;
const keyFor = (locationId: string, userId: string) => `${locationId}:${userId}`;
const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
function renderReceipt(data: Record<string, unknown>) {
  let html = receiptTemplate.replace(/{{#each (items|payments)}}([\s\S]*?){{\/each}}/g, (_match, key: string, rowTemplate: string) => {
    const rows = (data[key] as Record<string, unknown>[] | undefined) ?? [];
    return rows.map(row => rowTemplate.replace(/{{\s*([\w.]+)\s*}}/g, (_placeholder, field: string) => escapeHtml(row[field]))).join("");
  });
  return html.replace(/{{\s*([\w.]+)\s*}}/g, (_placeholder, key: string) => escapeHtml(data[key]));
}
function formatPosCurrency(value: Prisma.Decimal | number | string, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: currencyCode }).format(Number(value));
}

async function registerContext(req: Request, locationId: string, userId: string) {
  const departments = await db.department.findMany({ where: scope(req, locationId), orderBy: { name: "asc" }, select: departmentSelect });
  if (!departments.length) throw new PosError("No accessible department is enabled for sales and inventory.", 403);
  const activeKey = keyFor(locationId, userId);
  const register = await db.posRegister.findUnique({ where: { activeKey } });
  const paymentMethods = await db.customLabels.findMany({ where: { locationId, type: "payment", isActive: true }, select: { id: true, label: true } });
  return { register, departments: departments.map(d => ({ ...d, kitchen: d.kitchenOrders })), paymentMethods };
}

router.get("/register", handle(async (req, res, locationId, userId) => {
  res.json(await registerContext(req, locationId, userId));
}));

router.post("/register/open", requireHotelSubscription, handle(async (req, res, locationId, userId) => {
  const context = await registerContext(req, locationId, userId);
  const input = z.object({ departmentId: z.string().min(1) }).parse(req.body);
  if (!context.departments.some(department => department.id === input.departmentId)) {
    throw new PosError("Select a department you can access.", 403);
  }
  if (!context.register) {
    const activeKey = keyFor(locationId, userId);
    try {
      context.register = await db.posRegister.create({ data: { activeKey, locationId, userId } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
      context.register = await db.posRegister.findUnique({ where: { activeKey } });
      if (!context.register) throw err;
    }
  }
  res.json(context);
}));

router.get("/customers/search", handle(async (req, res, locationId) => {
  const search = z.string().trim().max(191).optional().parse(req.query.search);
  res.json(await db.customer.findMany({
    where: { locationId, ...(search ? { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { phone: { contains: search } }] } : {}) },
    orderBy: [{ firstName: "asc" }, { id: "asc" }], take: 25,
    select: { id: true, firstName: true, lastName: true, phone: true },
  }));
}));

router.get("/kitchen/:departmentId", handle(async (req, res, locationId) => {
  const id = String(req.params.departmentId);
  if (!await db.department.findFirst({ where: { ...scope(req, locationId), id, kitchenOrders: true }, select: { id: true } })) {
    throw new PosError("Kitchen orders are unavailable for this department.", 403);
  }
  res.json(await db.posOrder.findMany({
    where: { departmentId: id, register: { locationId }, status: "held", kitchenVersion: { gt: 0 } },
    orderBy: { updatedAt: "asc" },
  }));
}));

router.post("/register/close", handle(async (_req, res, locationId, userId) => {
  const key = keyFor(locationId, userId);
  await db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM PosRegister WHERE activeKey = ${key} FOR UPDATE`;
    if (!rows.length) return;
    if (await tx.posOrder.count({ where: { registerId: rows[0].id, status: "held" } })) throw new PosError("Complete your held orders before closing the register.");
    await tx.posRegister.update({ where: { id: rows[0].id }, data: { activeKey: null, closedAt: new Date() } });
  });
  res.sendStatus(204);
}));

router.get("/register/report", handle(async (_req, res, locationId, userId) => {
  const register = await db.posRegister.findUnique({ where: { activeKey: keyFor(locationId, userId) } });
  if (!register) throw new PosError("No open register.", 404);
  const [payments, legacyPayments, held, methods] = await Promise.all([
    db.posOrderPayment.groupBy({ by: ["paymentMethodId"], where: { order: { registerId: register.id, status: "paid" } }, _count: { _all: true }, _sum: { amountApplied: true } }),
    db.posOrder.groupBy({ by: ["paymentMethodId"], where: { registerId: register.id, status: "paid", paymentMethodId: { not: null }, paymentEntries: { none: {} } }, _count: { _all: true }, _sum: { total: true } }),
    db.posOrder.count({ where: { registerId: register.id, status: "held" } }),
    db.customLabels.findMany({ where: { locationId, type: "payment" }, select: { id: true, label: true } }),
  ]);
  const totals = new Map<string, { count: number; total: Prisma.Decimal }>();
  for (const payment of [...payments.map(p => ({ id: p.paymentMethodId, count: p._count._all, total: p._sum.amountApplied ?? new Prisma.Decimal(0) })),
    ...legacyPayments.flatMap(p => p.paymentMethodId ? [{ id: p.paymentMethodId, count: p._count._all, total: p._sum.total ?? new Prisma.Decimal(0) }] : [])]) {
    const current = totals.get(payment.id) ?? { count: 0, total: new Prisma.Decimal(0) };
    totals.set(payment.id, { count: current.count + payment.count, total: current.total.plus(payment.total) });
  }
  res.json({ held, payments: [...totals].map(([id, payment]) => ({
    label: methods.find(method => method.id === id)?.label ?? "Unknown payment method",
    count: payment.count, total: payment.total.toString(),
  })) });
}));

router.get("/history", handle(async (req, res, locationId, userId) => {
  const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
  const departmentId = z.string().min(1).optional().parse(req.query.departmentId);
  const search = z.string().trim().max(191).optional().parse(req.query.search);
  if (departmentId && !await db.department.findFirst({ where: { ...scope(req, locationId), id: departmentId }, select: { id: true } })) throw new PosError("Department is unavailable.", 404);
  const where: Prisma.PosOrderWhereInput = {
    status: "paid", register: { locationId, userId }, ...(departmentId ? { departmentId } : {}),
    ...(search ? { OR: [{ receiptNumber: { contains: search } }, { customerName: { contains: search } }] } : {}),
  };
  const [orders, total] = await Promise.all([
    db.posOrder.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * 20, take: 20,
      include: { paymentEntries: { include: { paymentMethod: { select: { label: true } } } } } }),
    db.posOrder.count({ where }),
  ]);
  const departmentIds = [...new Set(orders.map(order => order.departmentId))];
  const tableIds = [...new Set(orders.flatMap(order => order.tableId ? [order.tableId] : []))];
  const [departments, tables] = await Promise.all([
    db.department.findMany({ where: { locationId, id: { in: departmentIds } }, select: { id: true, name: true } }),
    db.diningTable.findMany({ where: { locationId, id: { in: tableIds } }, select: { id: true, name: true } }),
  ]);
  res.json({ orders: orders.map(order => ({ ...order,
    departmentName: departments.find(department => department.id === order.departmentId)?.name ?? "",
    tableName: tables.find(table => table.id === order.tableId)?.name ?? null,
  })), total, page, pageSize: 20 });
}));

router.get("/held", handle(async (req, res, locationId, userId) => {
  const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
  const departmentId = z.string().min(1).optional().parse(req.query.departmentId);
  const departments = await db.department.findMany({ where: { ...scope(req, locationId), ...(departmentId ? { id: departmentId } : {}) }, select: { id: true, managesTables: true } });
  if (departmentId && !departments.length) throw new PosError("Department is unavailable.", 404);
  const tableDepartmentIds = departments.filter(department => department.managesTables).map(department => department.id);
  const personalDepartmentIds = departments.filter(department => !department.managesTables).map(department => department.id);
  const where: Prisma.PosOrderWhereInput = {
    status: "held",
    OR: [
      { departmentId: { in: tableDepartmentIds }, register: { locationId } },
      { departmentId: { in: personalDepartmentIds }, register: { locationId, userId } },
    ],
  };
  const [orders, total] = await Promise.all([
    db.posOrder.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * 20, take: 20 }),
    db.posOrder.count({ where }),
  ]);
  res.json({ orders, total, page, pageSize: 20 });
}));

router.get("/orders/:orderId/print", handle(async (req, res, locationId, userId) => {
  const id = z.uuid().parse(String(req.params.orderId));
  const order = await db.posOrder.findFirst({ where: { id, register: { locationId } }, include: { register: { select: { userId: true } } } });
  if (!order) throw new PosError("Receipt not found.", 404);
  const department = await db.department.findFirst({ where: { ...scope(req, locationId), id: order.departmentId }, select: { id: true, name: true, managesTables: true } });
  if (!department || (!department.managesTables && order.register.userId !== userId)) throw new PosError("Receipt not found.", 404);
  const [location, cashier, table, payments] = await Promise.all([
    db.location.findUnique({ where: { id: locationId }, include: { business: { include: { currency: true } } } }),
    db.user.findUnique({ where: { id: order.register.userId }, select: { name: true } }),
    order.tableId ? db.diningTable.findFirst({ where: { id: order.tableId, locationId }, select: { name: true } }) : null,
    db.posOrderPayment.findMany({ where: { orderId: order.id }, include: { paymentMethod: { select: { label: true } } } }),
  ]);
  const currencyCode = location?.business.currency?.code ?? "NGN";
  const currency = (value: Prisma.Decimal | number | string) => formatPosCurrency(value, currencyCode);
  const items = Array.isArray(order.items) ? order.items as { name: string; quantity: number; price: string; lineTotal?: string }[] : [];
  const paymentRows = payments.map(payment => ({ method: payment.paymentMethod.label, amountApplied: currency(payment.amountApplied) }));
  if (!paymentRows.length && order.paymentMethodId) {
    const method = await db.customLabels.findUnique({ where: { id: order.paymentMethodId }, select: { label: true } });
    paymentRows.push({ method: method?.label ?? "Payment", amountApplied: currency(order.total) });
  }
  const paid = payments.reduce((sum, payment) => sum.plus(payment.amountApplied), new Prisma.Decimal(0));
  const tendered = payments.reduce((sum, payment) => sum.plus(payment.amountReceived), new Prisma.Decimal(0));
  const receiptHtml = renderReceipt({
    receiptTitle: order.status === "paid" ? "SALES RECEIPT" : "HELD RECEIPT",
    receiptNumber: order.receiptNumber ?? `HELD-${order.id.slice(0, 8).toUpperCase()}`,
    companyName: location?.name ?? "", companyAddress: [location?.address, location?.city, location?.state].filter(Boolean).join(", "), companyPhone: location?.phone ?? "",
    receiptDate: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: location?.timezone ?? "Africa/Lagos" }).format(order.createdAt),
    cashier: cashier?.name ?? "", department: department.name, table: table?.name ?? "Counter sale", customer: order.customerName ?? "Walk-in customer",
    items: items.map(item => ({ name: item.name, quantity: item.quantity, unitPrice: currency(item.price), lineTotal: currency(item.lineTotal ?? Number(item.price) * item.quantity) })),
    payments: paymentRows, total: currency(order.total), amountTendered: currency(tendered), changeDue: currency(order.changeDue), balanceDue: currency(new Prisma.Decimal(order.total).minus(paid)),
    footerMessage: order.status === "paid" ? "THANK YOU" : "HELD ORDER · NOT PAID",
  });
  res.status(200).json({ receiptHtml, printerType: "pos80mm" });
}));

router.delete("/orders/:orderId", handle(async (req, res, locationId, userId) => {
  const id = z.uuid().parse(String(req.params.orderId));
  const cancelled = await db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM PosOrder WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new PosError("Held receipt not found.", 404);
    const order = await tx.posOrder.findUnique({ where: { id }, include: { register: { select: { locationId: true, userId: true } } } });
    if (!order || order.register.locationId !== locationId || order.status !== "held") throw new PosError("Only an open held receipt can be removed.", 409);
    const department = await tx.department.findFirst({ where: { ...scope(req, locationId), id: order.departmentId }, select: { managesTables: true } });
    if (!department || (!department.managesTables && order.register.userId !== userId)) throw new PosError("Held receipt not found.", 404);
    return tx.posOrder.update({ where: { id }, data: { status: "cancelled", activeTableId: null, version: { increment: 1 } } });
  });
  res.json(cancelled);
}));

router.get("/:departmentId", handle(async (req, res, locationId, userId) => {
  const id = String(req.params.departmentId);
  const department = await db.department.findFirst({ where: { ...scope(req, locationId), id }, select: departmentSelect });
  if (!department) throw new PosError("Department is unavailable.", 404);
  const search = z.string().trim().max(191).optional().parse(req.query.search);
  const categoryId = z.string().max(191).optional().parse(req.query.categoryId);
  const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
  const sort = z.enum(["name", "price", "stock"]).default("name").parse(req.query.sort);
  const where: Prisma.ProductInventoryWhereInput = { locationId, departmentId: id,
    product: { disabledAt: null, categoryId, ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }] } : {}) } };
  const [rows, total, categories, tables, orders] = await Promise.all([
    db.productInventory.findMany({ where, orderBy: [sort === "price" ? { sellingPrice: "asc" } : sort === "stock" ? { quantity: "desc" } : { product: { name: "asc" } }, { productId: "asc" }], skip: (page - 1) * 30, take: 30,
      select: { quantity: true, sellingPrice: true, product: { select: { id: true, name: true, sku: true, images: { take: 1, orderBy: { createdAt: "asc" }, select: { url: true } } } } } }),
    db.productInventory.count({ where }),
    db.productCategory.findMany({ where: { locationId, products: { some: { disabledAt: null, inventory: { some: { departmentId: id } } } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    department.managesTables ? db.diningTable.findMany({ where: { locationId, departmentId: id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    db.posOrder.findMany({ where: { departmentId: id,
      OR: [
        { status: "held", register: { locationId, ...(department.managesTables ? {} : { userId }) } },
        { status: "paid", register: { locationId, userId } },
      ] },
      orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  const occupied = department.managesTables ? await db.posOrder.findMany({
    where: { departmentId: id, register: { locationId }, activeTableId: { not: null } },
  }) : [];
  const orderMap = new Map([...orders, ...occupied].map(order => [order.id, order]));
  res.json({ products: rows.map(row => ({ ...row.product, quantity: row.quantity, sellingPrice: row.sellingPrice })), total, categories, tables, orders: [...orderMap.values()] });
}));

const orderSchema = z.object({
  id: z.uuid(), departmentId: z.string().min(1), tableId: z.string().min(1).nullable(),
  action: z.enum(["hold", "kitchen", "checkout"]),
  payments: z.array(z.object({ paymentMethodId: z.string().min(1), amountReceived: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/) }).strict()).min(1).max(20).optional(),
  customerId: z.string().min(1).nullable().optional(),
  expectedTotal: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).optional(),
  version: z.number().int().nonnegative(),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().positive().max(99999999).multipleOf(0.001) })).min(1).max(100),
}).strict();

router.post("/orders", requireHotelSubscription, handle(async (req, res, locationId, userId) => {
  const input = orderSchema.parse(req.body);
  const ids = input.items.map(item => item.productId).sort();
  if (new Set(ids).size !== ids.length) throw new PosError("Each product must appear once.");
  const order = await db.$transaction(async tx => {
    const activeKey = keyFor(locationId, userId);
    const registers = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM PosRegister WHERE activeKey = ${activeKey} FOR UPDATE`;
    const registerId = registers[0]?.id;
    if (!registerId) throw new PosError("Open your register first.");
    const department = await tx.department.findFirst({ where: { ...scope(req, locationId), id: input.departmentId }, select: departmentSelect });
    if (!department) throw new PosError("Department cannot make sales.", 403);
    if (input.action === "kitchen" && !department.kitchenOrders) throw new PosError("Kitchen orders are disabled in this department.");
    if (department.managesTables !== Boolean(input.tableId)) throw new PosError("Choose a table for this department.");
    if (input.tableId && !await tx.diningTable.findFirst({ where: { id: input.tableId, locationId, departmentId: department.id, isActive: true }, select: { id: true } })) throw new PosError("This table is unavailable.");
    await tx.$queryRaw`SELECT id FROM PosOrder WHERE id = ${input.id} FOR UPDATE`;
    const existing = await tx.posOrder.findUnique({ where: { id: input.id }, include: { register: true } });
    if (existing && (existing.register.locationId !== locationId || existing.departmentId !== department.id ||
      (!department.managesTables && existing.register.userId !== userId))) throw new PosError("This order is unavailable.", 404);
    if (existing?.status === "paid") {
      if (input.action === "checkout") return existing;
      throw new PosError("This order has already been paid.", 409);
    }
    if ((existing?.version ?? 0) !== input.version) throw new PosError("This order changed. Refresh and reopen it.", 409);
    for (const id of ids) {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM Product WHERE id = ${id} AND locationId = ${locationId} AND disabledAt IS NULL FOR UPDATE`;
      if (!rows.length) throw new PosError("An item is no longer available.");
    }
    const inventory = await tx.productInventory.findMany({
      where: { locationId, departmentId: department.id, productId: { in: ids } }, include: { product: { select: { name: true, sku: true } } },
    });
    let total = new Prisma.Decimal(0);
    const items = input.items.map(item => {
      const row = inventory.find(entry => entry.productId === item.productId);
      if (!row || row.sellingPrice === null) throw new PosError("An item has no selling price in this department.");
      if (row.quantity.lt(item.quantity)) throw new PosError(`Insufficient stock for ${row.product.name}.`);
      const lineTotal = row.sellingPrice.times(item.quantity).toDecimalPlaces(2);
      total = total.plus(lineTotal);
      return { ...item, name: row.product.name, sku: row.product.sku, price: row.sellingPrice.toString(), lineTotal: lineTotal.toString() };
    });
    const paid = input.action === "checkout";
    const customer = input.customerId ? await tx.customer.findFirst({ where: { id: input.customerId, locationId }, select: { id: true, firstName: true, lastName: true } }) : null;
    if (input.customerId && !customer) throw new PosError("This customer is unavailable.");
    let receiptNumber: string | null = null;
    let changeDue = new Prisma.Decimal(0);
    let paymentEntries: { paymentMethodId: string; amountReceived: Prisma.Decimal; amountApplied: Prisma.Decimal }[] = [];
    if (paid) {
      if (!input.expectedTotal || !total.equals(input.expectedTotal)) throw new PosError("Prices changed. Save the order to refresh its prices, then review the total.", 409);
      if (!input.payments?.length) throw new PosError("Add at least one payment method.");
      if (new Set(input.payments.map(payment => payment.paymentMethodId)).size !== input.payments.length) throw new PosError("A payment method can only be added once.");
      const activeMethods = await tx.customLabels.findMany({ where: { id: { in: input.payments.map(payment => payment.paymentMethodId) }, locationId, type: "payment", isActive: true }, select: { id: true } });
      if (activeMethods.length !== input.payments.length) throw new PosError("Choose active payment methods.");
      const amountReceived = input.payments.map(payment => ({ paymentMethodId: payment.paymentMethodId, amountReceived: new Prisma.Decimal(payment.amountReceived) }));
      if (amountReceived.some(payment => !payment.amountReceived.greaterThan(0))) throw new PosError("Payment amounts must be greater than zero.");
      const tendered = amountReceived.reduce((sum, payment) => sum.plus(payment.amountReceived), new Prisma.Decimal(0));
      if (tendered.lessThan(total)) throw new PosError("The amount received is less than the amount due.");
      let remaining = total;
      paymentEntries = amountReceived.map(payment => {
        const amountApplied = Prisma.Decimal.min(payment.amountReceived, remaining);
        remaining = remaining.minus(amountApplied);
        return { ...payment, amountApplied };
      });
      changeDue = tendered.minus(total);
      const seq = await tx.documentSequence.upsert({
        where: { locationId_transactionType: { locationId, transactionType: "sale" } },
        create: { locationId, transactionType: "sale", currentNumber: 1 }, update: { currentNumber: { increment: 1 } },
      });
      receiptNumber = `SL-${new Date().getFullYear()}-${String(seq.currentNumber).padStart(4, "0")}`;
    }
    const data = {
      registerId, departmentId: department.id, tableId: input.tableId, activeTableId: paid ? null : input.tableId,
      status: paid ? "paid" as const : "held" as const, items, total, receiptNumber,
      paymentMethodId: paid ? paymentEntries[0]?.paymentMethodId ?? null : null, changeDue, version: input.version + 1,
      customerId: customer?.id ?? null, customerName: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : null,
      ...(paid ? { paymentEntries: { create: paymentEntries } } : {}),
      ...(input.action === "kitchen" ? { kitchenVersion: (existing?.kitchenVersion ?? 0) + 1, kitchenItems: items } : {}),
    };
    const includePayments = { paymentEntries: { include: { paymentMethod: { select: { label: true } } } } } as const;
    const saved = existing
      ? await tx.posOrder.update({ where: { id: input.id }, data, include: includePayments })
      : await tx.posOrder.create({ data: { id: input.id, ...data }, include: includePayments });
    if (paid) for (const item of items) {
      const row = inventory.find(entry => entry.productId === item.productId)!;
      await moveStock(tx, {
        productId: item.productId, departmentId: department.id, delta: new Prisma.Decimal(item.quantity).negated(),
        costPrice: row.costPrice, stockDate: new Date(), expiryDate: null,
        type: "sale", reason: receiptNumber!, userId, referenceId: saved.id,
      });
    }
    return saved;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
  res.json(order);
}));

export { router as posRouter };
