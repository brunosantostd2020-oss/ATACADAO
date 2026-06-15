import { Router } from "express";
import {
  searchCustomers,
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  customerHistory,
} from "../controllers/customers.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/search", searchCustomers);          // autocomplete
router.get("/",       listCustomers);
router.get("/:id/history", customerHistory);
router.post("/",      authorize("admin", "caixa"), createCustomer);
router.patch("/:id",  authorize("admin", "caixa"), updateCustomer);
router.delete("/:id", authorize("admin"),          deleteCustomer);

export default router;
