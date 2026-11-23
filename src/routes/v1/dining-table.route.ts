import { Router } from "express";
import { requirePermission } from "../../middleware/middleware.js";
import { createDiningTable, createDiningTablesBulk, deleteDiningTable, listDiningTables, updateDiningTable } from "../../controllers/dining-table.controller.js";

const router = Router();
router.get("/", requirePermission("tables:view"), listDiningTables);
router.post("/", requirePermission("tables:manage"), createDiningTable);
router.post("/bulk", requirePermission("tables:manage"), createDiningTablesBulk);
router.patch("/:id", requirePermission("tables:manage"), updateDiningTable);
router.delete("/:id", requirePermission("tables:manage"), deleteDiningTable);

export { router as diningTableRouter };
