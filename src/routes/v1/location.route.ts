import { Router } from "express";
import { workspace } from "../../controllers/workspace.controller.js";

import { confirmSubscriptionCheckout, downloadSubscriptionInvoice, startSubscriptionCheckout } from "../../controllers/subscription.controller.js";

const router = Router();
router.get("/", workspace.listLocations);
router.post("/", workspace.createLocation);
router.get("/subscription", workspace.locationSubscription);
router.post("/subscription/checkout", startSubscriptionCheckout);
router.post("/subscription/checkout/confirm", confirmSubscriptionCheckout);
router.get("/subscription/invoices/:id", downloadSubscriptionInvoice);
router.post("/:id/switch", workspace.switchLocation);
router.get("/:id/members", workspace.locationMembers);
router.put("/:id/members/:userId", workspace.saveLocationMember);
export { router as locationRouter };
