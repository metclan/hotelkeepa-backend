import { Router } from "express";
import { getMe } from "../../controllers/auth.controller.js";

const router = Router();
router.get("/me", getMe);

export { router as authRouter };
