const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 jours
};

router.post("/login", async (req, res) => {
  const { pin } = req.body || {};
  if (!pin) {
    return res.status(400).json({ error: "PIN manquant." });
  }

  const ok = await bcrypt.compare(pin, process.env.FAMILY_PIN_HASH || "");
  if (!ok) {
    return res.status(401).json({ error: "PIN incorrect." });
  }

  const token = jwt.sign({ role: "family" }, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.cookie("session", token, COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  res.clearCookie("session", COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.get("/status", (req, res) => {
  const token = req.cookies && req.cookies.session;
  if (!token) return res.json({ authenticated: false });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    res.json({ authenticated: true });
  } catch {
    res.json({ authenticated: false });
  }
});

module.exports = router;
