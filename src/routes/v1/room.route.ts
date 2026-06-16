import {
  createRoom,
  editRoom,
  fetchRooms,
  fetchRoomById,
} from "../../controllers/room.controller.js";
import { Router } from "express";

const router = Router();
router.get("/", fetchRooms);
router.post("/", createRoom);
router.get("/:id", fetchRoomById);
router.patch("/:id/edit", editRoom);

export { router as roomRouter };
