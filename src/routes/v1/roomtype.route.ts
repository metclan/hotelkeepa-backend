import {
  createRoomType,
  fetchRoomTypes,
} from "../../controllers/roomtype.controller.js";
import { Router } from "express";

const router = Router();
router.get("/", fetchRoomTypes).post("/", createRoomType);

export { router as roomTypeRouter };
