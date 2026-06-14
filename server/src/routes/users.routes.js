import { Router } from "express";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/users.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorize("admin"));

router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
