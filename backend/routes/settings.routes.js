const express = require("express");

const router = express.Router();

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const settingsController = require("../controllers/settings.controller");

router.get("/public", settingsController.getPublicSettings);

router.get(
  "/",
  authenticate,
  authorizeRoles("admin"),
  settingsController.getSettings,
);

router.put(
  "/",
  authenticate,
  authorizeRoles("admin"),
  settingsController.updateSettings,
);

module.exports = router;
