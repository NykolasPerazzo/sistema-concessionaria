const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  verifyWebhook,
  receiveWebhook,
  status,
} = require("../controllers/meta.controller");
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);
router.get("/status", authenticate, authorizeRoles("admin"), status);
module.exports = router;
