const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const upload = require("../middleware/upload.middleware");
const crlvUpload = require("../middleware/crlv-upload.middleware");

const router = express.Router();

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} = require("../controllers/vehicles.controller");

const { importCrlv } = require("../controllers/crlv.controller");

// Leitura de CRLV por usuário/IP: chama uma IA paga, limita abuso.
const crlvImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.sub ? `user:${req.user.sub}` : ipKeyGenerator(req.ip),
  message: {
    error: "Muitas leituras de CRLV em pouco tempo. Aguarde alguns minutos.",
  },
});

router.get("/", getVehicles);

router.get("/:id", getVehicleById);

router.post(
  "/",
  authenticate,
  authorizeRoles("admin", "vendedor"),
  upload.fields([
    {
      name: "coverImage",
      maxCount: 1,
    },
    {
      name: "galleryImages",
      maxCount: 10,
    },
  ]),
  createVehicle,
);

router.post(
  "/import-crlv",
  authenticate,
  authorizeRoles("admin", "vendedor"),
  crlvImportLimiter,
  ...crlvUpload,
  importCrlv,
);

router.put(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  upload.fields([
    {
      name: "coverImage",
      maxCount: 1,
    },
    {
      name: "galleryImages",
      maxCount: 10,
    },
  ]),
  updateVehicle,
);

router.delete("/:id", authenticate, authorizeRoles("admin"), deleteVehicle);

module.exports = router;
