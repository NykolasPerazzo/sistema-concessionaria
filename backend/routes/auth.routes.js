const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const { login, logout, me } = require("../controllers/auth.controller");

const { authenticate } = require("../middleware/auth.middleware");

// Proteção contra muitas tentativas de login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos

  limit: 5, // máximo de 5 tentativas

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: "Muitas tentativas de login. Tente novamente em alguns minutos.",
  },
});

router.post("/login", loginLimiter, login);

router.post("/logout", authenticate, logout);

router.get("/me", authenticate, me);

module.exports = router;
