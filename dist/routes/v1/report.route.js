import { fetchReservationsReport } from "../../controllers/report.controller.js";
import { Router } from "express";
const router = Router();
router.get("/reservations", fetchReservationsReport);
export { router as reportRouter };
