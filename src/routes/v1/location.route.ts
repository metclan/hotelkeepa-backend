import { Router } from "express";
import { fetchLocations } from "../../controllers/location.controller.js";

const router = Router();
router.get("/", fetchLocations);

export { router as locationRouter };
