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
} from "../controllers/comandas.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

router.get("/summary", summary);
router.get("/", listComandas);
router.get("/:id", getComanda);

// Garcom, caixa e admin podem operar comandas
router.post("/", createComanda);
router.post("/:id/items", addItem);
router.patch("/:id/items/:itemId", updateItemQty);
router.delete("/:id/items/:itemId", removeItem);

// Pagamento: caixa e admin
router.post("/:id/pay", authorize("admin", "caixa"), payComanda);

// Excluir comanda: apenas admin
router.delete("/:id", authorize("admin"), deleteComanda);

export default router;
