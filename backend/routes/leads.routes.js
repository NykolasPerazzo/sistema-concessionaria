const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  listLeads,
  leadDetails,
  saveLead,
  changeStage,
  addNote,
  convertLead,
  analyzeLeadNow,
} = require("../controllers/leads.controller");
router.use(authenticate, authorizeRoles("admin"));
router.get("/", listLeads);
router.get("/:id", leadDetails);
router.post("/", saveLead);
router.put("/:id", saveLead);
router.patch("/:id/status", changeStage);
router.post("/:id/notes", addNote);
router.post("/:id/convert", convertLead);
router.post("/:id/analyze", analyzeLeadNow);
module.exports = router;
