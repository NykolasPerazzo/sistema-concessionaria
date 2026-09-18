const router = require("express").Router();
const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");
const {
  getSummary,
  listDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  setDocumentStatus,
  deleteDocument,
} = require("../controllers/documents.controller");

// Documentos envolvem dados pessoais, contratuais e financeiros dos
// clientes: mesmo padrão de acesso restrito a admin usado em clientes e
// propostas (customers.routes.js / proposals.routes.js).
router.use(authenticate, authorizeRoles("admin"));

router.get("/summary", getSummary);
router.get("/", listDocuments);
router.get("/:id", getDocumentById);
router.post("/", createDocument);
router.put("/:id", updateDocument);
router.patch("/:id/status", setDocumentStatus);
router.delete("/:id", deleteDocument);

module.exports = router;
