import { requirePermission } from "../../middleware/middleware.js";
import { createRoomType, fetchRoomTypes, fetchRoomTypeById, editRoomType, } from "../../controllers/roomtype.controller.js";
import { Router } from "express";
const router = Router();
router.get("/", requirePermission("room:types:view"), fetchRoomTypes);
router.post("/", requirePermission("room:types:create"), createRoomType);
router.get("/:id", requirePermission("room:types:view"), fetchRoomTypeById);
router.patch("/:id/edit", requirePermission("room:types:edit"), editRoomType);
export { router as roomTypeRouter };
