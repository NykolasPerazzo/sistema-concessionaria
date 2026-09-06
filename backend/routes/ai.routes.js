const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const {
  askVehicleAI,
  recommendVehicle,
  generateVehicleDescription,
} = require("../controllers/ai.controller");

const { createPublicLead } = require("../controllers/leads.controller");

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

// Rota pública (site) que grava no banco: limita abuso
const interestedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas. Tente novamente em alguns minutos.",
  },
});

router.post("/vehicles", askVehicleAI);

router.post("/recommend", recommendLimiter, recommendVehicle);

router.post("/vehicle-description", generateVehicleDescription);

router.post("/interested", interestedLimiter, createPublicLead);

module.exports = router;
