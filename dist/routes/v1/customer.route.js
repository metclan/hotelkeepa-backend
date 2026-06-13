import { Router } from "express";
import { createCustomer, fetchCustomers, } from "../../controllers/customer.controller.js";
const router = Router();
router.get("/", fetchCustomers);
router.post("/", createCustomer);
export { router as customerRouter };
