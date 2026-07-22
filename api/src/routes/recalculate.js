const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { recalculatePlaces } = require("../lib/routing");

const router = express.Router();

// Recalcule tous les lieux qui ne sont pas en override manuel (utile après une
// panne ponctuelle d'OSRM, sans avoir à re-sauvegarder le domicile).
router.post("/", requireAuth, async (req, res) => {
  const home = await prisma.home.findFirst();
  if (!home) return res.status(400).json({ error: "Aucun domicile configuré." });

  const places = await prisma.place.findMany({ where: { isManualOverride: false } });
  const { updated, errors } = await recalculatePlaces(prisma, home, places);

  res.json({ recalculated: updated, errors });
});

module.exports = router;
