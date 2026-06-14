import { Router } from "express";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/products.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

// Qualquer usuario logado pode ver o cardapio
router.get("/", listProducts);

// Apenas admin e caixa gerenciam o cardapio
router.post("/", authorize("admin", "caixa"), createProduct);
router.patch("/:id", authorize("admin", "caixa"), updateProduct);
router.delete("/:id", authorize("admin", "caixa"), deleteProduct);

export default router;
