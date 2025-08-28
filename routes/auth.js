const express = require("express");
const verifyToken = require("../verifyToken");
const router = express.Router();

// (Removed) Forgot password is handled on Mobile via Firebase client SDK

// Example protected route
router.get("/profile", verifyToken, (req, res) => {
  res.json({ message: "Secure profile data", user: req.user });
});

module.exports = router; // ✅ must export router
