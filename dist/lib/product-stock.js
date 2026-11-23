import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
export async function moveStock(tx, input) {
    const { productId, departmentId, delta, costPrice, stockDate, expiryDate, type, reason, userId } = input;
    const referenceId = input.referenceId ?? randomUUID();
    const where = { productId, departmentId };
    const parts = [];
    const record = (stockBatchId, quantity, unitCost) => tx.stockMovement.create({ data: { stockBatchId, quantity, unitCost, type, reason, userId, referenceId, effectiveDate: stockDate } });
    if (delta.isZero())
        return parts;
    if (delta.isPositive()) {
        const batch = await tx.stockBatch.create({ data: { ...where, quantity: delta, quantityLeft: delta, costPrice, stockDate, expiryDate } });
        await record(batch.id, delta, costPrice);
    }
    else {
        let remaining = delta.abs();
        const batches = await tx.stockBatch.findMany({
            where: { ...where, quantityLeft: { gt: 0 } },
            orderBy: [{ stockDate: "asc" }, { id: "asc" }],
        });
        for (const batch of batches) {
            if (remaining.isZero())
                break;
            const used = Prisma.Decimal.min(remaining, batch.quantityLeft);
            await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityLeft: { decrement: used } } });
            await record(batch.id, used.negated(), batch.costPrice);
            parts.push({ quantity: used, costPrice: batch.costPrice, expiryDate: batch.expiryDate });
            remaining = remaining.minus(used);
        }
        if (!remaining.isZero())
            throw new Error("Inventory batch balance is inconsistent");
    }
    await tx.productInventory.update({
        where: { productId_departmentId: where }, data: { quantity: { increment: delta } },
    });
    return parts;
}
