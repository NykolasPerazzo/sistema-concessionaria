const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  listCustomers,
  saveCustomer,
  setCustomerStatus,
  customerHistory,
} = require("../controllers/customers.controller");
router.use(authenticate, authorizeRoles("admin"));
router.get("/", listCustomers);
router.get("/:id/history", customerHistory);
router.post("/", saveCustomer);
router.put("/:id", saveCustomer);
router.patch("/:id/status", setCustomerStatus);
module.exports = router;
