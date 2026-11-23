import { Router } from "express";
import { workspace } from "../../controllers/workspace.controller.js";
const router = Router();
router.get("/", workspace.listLocations);
router.post("/", workspace.createLocation);
router.post("/:id/switch", workspace.switchLocation);
router.get("/:id/members", workspace.locationMembers);
router.put("/:id/members/:userId", workspace.saveLocationMember);
export { router as locationRouter };
