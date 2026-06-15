import { Router } from "express";
import { caixaDiario, relatorioVendas } from "../controllers/reports.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorize("admin", "caixa"));

router.get("/caixa",    caixaDiario);
router.get("/vendas",   relatorioVendas);

export default router;
