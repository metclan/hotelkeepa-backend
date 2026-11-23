import { Router } from "express";
import {
  fetchRoles,
  createRole,
  updateRole,
  fetchRoleById,
  deleteRole,
} from "../../controllers/role.controller.js";

import { requirePermission } from "../../middleware/middleware.js";

const router = Router();
router.get("/", fetchRoles);
router.post("/", requirePermission("roles:create"), createRole);
router.patch("/:id", requirePermission("roles:edit"), updateRole);
router.get("/:id", fetchRoleById);
router.delete("/:id", requirePermission("roles:delete"), deleteRole);

export { router as roleRouter };
