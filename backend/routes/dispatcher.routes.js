const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  getProcesses,
  getProcessById,
  createProcess,
  updateProcess,
  deleteProcess,
  changeStatus,
  getDocuments,
  addDocument,
  updateDocument,
  deleteDocument,
  getTimeline,
  createFromSale,
} = require("../controllers/dispatcher.controller");

router.use(
  authenticate,
  authorizeRoles("admin", "despachante", "vendedor", "financeiro"),
);

const manage = authorizeRoles("admin", "despachante");

router.get("/processes", getProcesses);
router.get("/processes/:id", getProcessById);
router.post("/processes", manage, createProcess);
router.put("/processes/:id", manage, updateProcess);
router.delete("/processes/:id", manage, deleteProcess);
router.patch("/processes/:id/status", manage, changeStatus);

router.get("/processes/:id/documents", getDocuments);
router.post("/processes/:id/documents", manage, addDocument);
router.patch("/documents/:id", manage, updateDocument);
router.delete("/documents/:id", manage, deleteDocument);

router.get("/processes/:id/timeline", getTimeline);

router.post("/from-sale/:saleId", authorizeRoles("admin"), createFromSale);

module.exports = router;
