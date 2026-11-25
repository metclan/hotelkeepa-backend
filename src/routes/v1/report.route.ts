import { requirePermission } from "../../middleware/middleware.js";
import { fetchDashboardOverview, fetchOccupancyReport, fetchPaymentsReport, fetchReservationsReport } from "../../controllers/report.controller.js";
import { Router } from "express";

const router = Router();
router.get("/dashboard-overview", requirePermission("dashboard:view"), fetchDashboardOverview);
router.get("/dashboard-revenue", requirePermission("dashboard:view", "dashboard:revenue:view"), fetchDashboardOverview);
router.get("/reservations", requirePermission("reports:view:bookings"), fetchReservationsReport);
router.get("/payments", requirePermission("reports:view:payments"), fetchPaymentsReport);
router.get("/occupancy", requirePermission("reports:view:occupancy"), fetchOccupancyReport);

export { router as reportRouter };
