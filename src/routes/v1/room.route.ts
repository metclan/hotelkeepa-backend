import { requirePermission } from "../../middleware/middleware.js";
import {
  createRoom,
  editRoom,
  fetchRooms,
  fetchRoomFilterOptions,
  updateRoomStatus,
  fetchRoomById,
} from "../../controllers/room.controller.js";
import { Router } from "express";

import { createBulkRooms } from "../../controllers/bulk-room.controller.js";

const router = Router();
router.get("/", requirePermission("rooms:view"), fetchRooms);
router.get("/filter-options", requirePermission("rooms:view"), fetchRoomFilterOptions);
router.post("/", requirePermission("rooms:create"), createRoom);
router.post("/bulk", requirePermission("rooms:create"), createBulkRooms);
router.get("/:id", requirePermission("rooms:view"), fetchRoomById);
router.patch("/:id/status", requirePermission("rooms:view", "rooms:status:update"), updateRoomStatus);
router.patch("/:id/edit", requirePermission("rooms:edit"), editRoom);

export { router as roomRouter };
