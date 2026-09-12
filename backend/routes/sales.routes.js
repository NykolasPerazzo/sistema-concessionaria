const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  getSales,
  getSaleVehicles,
  getSellers,
  createSale,
  cancelSale,
} = require("../controllers/sales.controller");
router.use(authenticate, authorizeRoles("admin", "vendedor"));
router.get("/vehicles", getSaleVehicles);
router.get("/sellers", getSellers);
router.get("/", getSales);
router.post("/", createSale);
router.post("/:id/cancel", cancelSale);
module.exports = router;
