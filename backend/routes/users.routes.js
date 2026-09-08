const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  listUsers,
  listAllUsers,
  createUser,
  deleteUser,
} = require("../controllers/users.controller");
router.use(authenticate, authorizeRoles("admin", "vendedor", "despachante"));
router.get("/", listUsers);
router.get("/all", authorizeRoles("admin"), listAllUsers);
router.post("/", authorizeRoles("admin"), createUser);
router.delete("/:id", authorizeRoles("admin"), deleteUser);
module.exports = router;
