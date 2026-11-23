import { requirePermission } from "../../middleware/middleware.js";
import { fetchReservationsReport } from "../../controllers/report.controller.js";
import { Router } from "express";

const router = Router();
router.get("/reservations", requirePermission("reports:view:bookings"), fetchReservationsReport);

export { router as reportRouter };
