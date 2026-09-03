const express = require("express");

const router = express.Router();

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const {
  getVehicleExpenses,
  createVehicleExpense,
  deleteVehicleExpense,
} = require("../controllers/vehicle-expenses.controller");

// Listar despesas do veículo
router.get(
  "/vehicle/:vehicleId",
  authenticate,
  authorizeRoles("admin"),
  getVehicleExpenses,
);

// Adicionar uma despesa
router.post(
  "/vehicle/:vehicleId",
  authenticate,
  authorizeRoles("admin"),
  createVehicleExpense,
);

// Excluir uma despesa
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  deleteVehicleExpense,
);

module.exports = router;
