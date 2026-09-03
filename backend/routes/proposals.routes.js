const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  getProposals,
  saveProposal,
  changeStatus,
  convertProposal,
} = require("../controllers/proposals.controller");
router.use(authenticate, authorizeRoles("admin"));
router.get("/", getProposals);
router.post("/", saveProposal);
router.put("/:id", saveProposal);
router.patch("/:id/status", changeStatus);
router.post("/:id/convert", convertProposal);
module.exports = router;
