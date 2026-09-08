const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const { listUsers } = require("../controllers/users.controller");
router.use(authenticate, authorizeRoles("admin", "vendedor"));
router.get("/", listUsers);
module.exports = router;
