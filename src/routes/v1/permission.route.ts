import { fetchPermission } from "../../controllers/permission.controller.js";
import { Router } from "express";

const router = Router();
router.get("/", fetchPermission);

export { router as permissionRouter };
