import { Router } from "express";
import {
  createCustomer,
  fetchCustomers,
} from "../../controllers/customer.controller.js";
import { requirePermission } from "../../middleware/middleware.js";

const router = Router();
router.get("/", fetchCustomers);
router.post("/", createCustomer);

export { router as customerRouter };
