const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const {
  askVehicleAI,
  recommendVehicle,
  generateVehicleDescription,
} = require("../controllers/ai.controller");

// Rota pública (site) que chama uma API paga: limita abuso
const recommendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas. Tente novamente em alguns minutos.",
  },
});

router.post("/vehicles", askVehicleAI);

router.post("/recommend", recommendLimiter, recommendVehicle);

router.post("/vehicle-description", generateVehicleDescription);

module.exports = router;
