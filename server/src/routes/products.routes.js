import { Router } from "express";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  stockEntry,
  stockAdjust,
  stockHistory,
  stockPanel,
} from "../controllers/products.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/",          listProducts);
router.get("/stock",     authorize("admin", "caixa"), stockPanel);
router.post("/",         authorize("admin", "caixa"), createProduct);
router.patch("/:id",     authorize("admin", "caixa"), updateProduct);
router.delete("/:id",    authorize("admin", "caixa"), deleteProduct);
router.post("/:id/stock/entry",   authorize("admin", "caixa"), stockEntry);
router.post("/:id/stock/adjust",  authorize("admin", "caixa"), stockAdjust);
router.get("/:id/stock/history",  authorize("admin", "caixa"), stockHistory);

export default router;
