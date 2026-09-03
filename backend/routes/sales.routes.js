const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  getSales,
  getSaleVehicles,
  createSale,
  cancelSale,
} = require("../controllers/sales.controller");
router.use(authenticate, authorizeRoles("admin"));
router.get("/vehicles", getSaleVehicles);
router.get("/", getSales);
router.post("/", createSale);
router.post("/:id/cancel", cancelSale);
module.exports = router;
