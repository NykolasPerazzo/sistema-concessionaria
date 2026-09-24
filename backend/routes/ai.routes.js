const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const {
  getAiStatus,
  askVehicleAI,
  consultantChat,
  generateVehicleDescription,
  generateVehicleSpecs,
  generateVehicleCover,
} = require("../controllers/ai.controller");

const { createPublicLead } = require("../controllers/leads.controller");

const upload = require("../middleware/upload.middleware");

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");

// Rota pública (site) que chama uma API paga: limita abuso.
// Uma conversa envolve várias mensagens, por isso o limite é mais alto
// que o de uma ação única.
const consultantChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas mensagens em pouco tempo. Aguarde alguns minutos.",
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

// Assistente da área administrativa: uso autenticado, limita abuso
const assistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas perguntas em pouco tempo. Aguarde alguns minutos.",
  },
});

// Busca especificações técnicas do veículo com IA: uso autenticado, limita abuso
const specsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas. Tente novamente em alguns minutos.",
  },
});

// Gera a capa profissional do veículo com IA: uso autenticado e caro (IA de imagem), limita abuso
const coverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas. Tente novamente em alguns minutos.",
  },
});

router.get("/status", authenticate, getAiStatus);

router.post(
  "/vehicles",
  authenticate,
  authorizeRoles("admin", "vendedor"),
  assistantLimiter,
  askVehicleAI,
);

router.post("/consultant-chat", consultantChatLimiter, consultantChat);

router.post("/vehicle-description", generateVehicleDescription);

router.post(
  "/vehicle-specs",
  authenticate,
  authorizeRoles("admin", "vendedor"),
  specsLimiter,
  generateVehicleSpecs,
);

router.post(
  "/vehicle-cover",
  authenticate,
  authorizeRoles("admin"),
  coverLimiter,
  upload.single("photo"),
  generateVehicleCover,
);

router.post("/interested", interestedLimiter, createPublicLead);

module.exports = router;
