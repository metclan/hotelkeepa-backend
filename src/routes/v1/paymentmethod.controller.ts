import { Router } from "express";
import {
  fetchPaymentMethodById,
  fetchPaymentMethods,
  updatePaymentMethod,
} from "../../controllers/paymentmethods.controller.js";

const router = Router();

// Payment method routes
router.get("/", fetchPaymentMethods);
router.get("/:id", fetchPaymentMethodById);
router.put("/:id", updatePaymentMethod);

export { router as paymentMethodsRouter };
