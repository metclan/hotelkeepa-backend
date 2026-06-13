import { createBusiness } from "../../controllers/business.controller.js";
import { Router } from "express";
const router = Router();
router
    .post("/", createBusiness);
export { router as businessRouter };
