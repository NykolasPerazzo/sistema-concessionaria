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
  assignLead,
  addNote,
  convertLead,
  analyzeLeadNow,
  leadEvents,
  addInteraction,
  createTask,
  updateTask,
  recalculateScore,
} = require("../controllers/leads.controller");
router.use(authenticate, authorizeRoles("admin", "vendedor"));
router.get("/", listLeads);
router.get("/stream", leadEvents);
router.get("/:id", leadDetails);
router.post("/", saveLead);
router.put("/:id", saveLead);
router.patch("/:id/status", changeStage);
router.patch("/:id/assign", assignLead);
router.post("/:id/notes", addNote);
router.post("/:id/convert", convertLead);
router.post("/:id/analyze", analyzeLeadNow);
router.post("/:id/interactions", addInteraction);
router.post("/:id/tasks", createTask);
router.patch("/:id/tasks/:taskId", updateTask);
router.post("/:id/score/recalculate", recalculateScore);
module.exports = router;
