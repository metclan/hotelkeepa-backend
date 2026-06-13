import { Router } from "express";
import {
  fetchUsers,
  acceptInvitation,
  sendInvitation,
  validateInvitation,
  fetchInvitations,
  revokeInvitation,
  resendInvitation,
  modifyUserRole,
} from "../../controllers/user.controller.js";
import { requireAuth, requireOwner } from "../../middleware/middleware.js";

const router = Router();

router.post("/accept", acceptInvitation);
router.get("/validate", validateInvitation);
router.get("/invitations", requireAuth, fetchInvitations);
router.patch("/invitations/:id/revoke", requireAuth, revokeInvitation);
router.post("/invitations/:id/resend", requireAuth, resendInvitation);
router.post("/invite", requireAuth, requireOwner, sendInvitation);
router.get("/", requireAuth, fetchUsers);
router.patch("/:id/modify-role", requireAuth, modifyUserRole);

export { router as userRouter };
