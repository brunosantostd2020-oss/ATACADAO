import { Router } from "express";
import {
  listComandas,
  getComanda,
  createComanda,
  addItem,
  updateItemQty,
  removeItem,
  payComanda,
  deleteComanda,
  summary,
  updatePhone,
} from "../controllers/comandas.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/summary", summary);
router.get("/", listComandas);
router.get("/:id", getComanda);

router.post("/", createComanda);
router.post("/:id/items", addItem);
router.patch("/:id/items/:itemId", updateItemQty);
router.delete("/:id/items/:itemId", removeItem);
router.patch("/:id/phone", updatePhone);

router.post("/:id/pay", authorize("admin", "caixa"), payComanda);
router.delete("/:id", authorize("admin"), deleteComanda);

export default router;
