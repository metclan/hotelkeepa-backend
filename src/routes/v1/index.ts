import { Router } from "express";
import { settingRouter } from "./setting.route.js";
import { roomTypeRouter } from "./roomtype.route.js";
import { roomRouter } from "./room.route.js";
import { requireOnboarding } from "../../middleware/middleware.js";
import { onboardRouter } from "./onboard.route.js";
import { customerRouter } from "./customer.route.js";
import { paymentMethodsRouter } from "./paymentmethod.controller.js";
import { reservationRouter } from "./reservation.route.js";
import { reportRouter } from "./report.route.js";
import { roleRouter } from "./role.route.js";
import { locationRouter } from "./location.route.js";
import { permissionRouter } from "./permission.route.js";
import { loadPermissions } from "../../middleware/middleware.js";

const router = Router();

router.use("/onboard", onboardRouter);
router.use("/settings", settingRouter);
router.use(requireOnboarding);
router.use(loadPermissions);
router.use("/room-types", roomTypeRouter);
router.use("/rooms", roomRouter);
router.use("/customers", customerRouter);
router.use("/payment-methods", paymentMethodsRouter);
router.use("/reservations", reservationRouter);
router.use("/reports", reportRouter);
router.use("/roles", roleRouter);
router.use("/locations", locationRouter);
router.use("/permissions", permissionRouter);

export { router as indexRouter };
