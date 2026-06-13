import { Router } from "express";
import {
  fetchRoles,
  createRole,
  updateRole,
  fetchRoleById,
  deleteRole,
} from "../../controllers/role.controller.js";

const router = Router();
router.get("/", fetchRoles);
router.post("/", createRole);
router.patch("/:id", updateRole);
router.get("/:id", fetchRoleById);
router.delete("/:id", deleteRole);

export { router as roleRouter };
