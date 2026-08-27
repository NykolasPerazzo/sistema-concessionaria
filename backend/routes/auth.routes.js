const express = require("express");

const {
    login,
    logout,
    me
} = require("../controllers/auth.controller");

const {
    authenticate
} = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/login", login);

router.post("/logout", authenticate, logout);

router.get("/me", authenticate, me);

module.exports = router;