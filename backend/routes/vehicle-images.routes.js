const express = require("express");

const router = express.Router();

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const {
  getVehicleImages,
  createVehicleImage,
  deleteVehicleImage,
} = require("../controllers/vehicle-images.controller");

// Público: qualquer visitante pode ver as imagens
router.get("/:vehicleId", getVehicleImages);

// Apenas admin pode adicionar imagem
router.post(
  "/:vehicleId",
  authenticate,
  authorizeRoles("admin"),
  createVehicleImage,
);

// Apenas admin pode excluir imagem
router.delete(
  "/:imageId",
  authenticate,
  authorizeRoles("admin"),
  deleteVehicleImage,
);

module.exports = router;
