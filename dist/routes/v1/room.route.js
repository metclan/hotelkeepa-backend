import { createRoom, fetchRooms } from "../../controllers/room.controller.js";
import { Router } from "express";
const router = Router();
router.get("/", fetchRooms);
router.post("/", createRoom);
export { router as roomRouter };
