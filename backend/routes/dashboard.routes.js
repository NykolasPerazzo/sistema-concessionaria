const express = require("express");

const router = express.Router();

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const { getDashboardSummary } = require("../controllers/dashboard.controller");

router.get(
  "/summary",
  authenticate,
  authorizeRoles("admin"),
  getDashboardSummary,
);

module.exports = router;
