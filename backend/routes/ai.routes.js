const express = require("express");

const router = express.Router();

const {
  askVehicleAI,
  generateVehicleDescription,
} = require("../controllers/ai.controller");

router.post("/vehicles", askVehicleAI);

router.post("/vehicle-description", generateVehicleDescription);

module.exports = router;
