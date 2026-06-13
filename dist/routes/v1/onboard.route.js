import { Router } from "express";
import { onboardNewBusiness } from "../../controllers/onboarding.controller.js";
const router = Router();
router.post("/business", onboardNewBusiness);
export { router as onboardRouter };
