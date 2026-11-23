import { Router } from "express";
import {
  createCustomer,
  fetchCustomers,
} from "../../controllers/customer.controller.js";
import { requirePermission } from "../../middleware/middleware.js";

const router = Router();
router.get("/", requirePermission("guests:view"), fetchCustomers);
router.post("/", requirePermission("guests:create"), createCustomer);

export { router as customerRouter };
