import {
  createRoomType,
  fetchRoomTypes,
  fetchRoomTypeById,
  editRoomType,
} from "../../controllers/roomtype.controller.js";
import { Router } from "express";

const router = Router();
router.get("/", fetchRoomTypes);
router.post("/", createRoomType);
router.get("/:id", fetchRoomTypeById);
router.patch("/:id/edit", editRoomType);

export { router as roomTypeRouter };
