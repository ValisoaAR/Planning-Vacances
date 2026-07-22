const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { recalculatePlaces } = require("../lib/routing");

const router = express.Router();

router.put("/", requireAuth, async (req, res) => {
  const { name, lat, lng } = req.body || {};
  if (!name || typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "name, lat et lng (nombres) sont requis." });
  }

  const existing = await prisma.home.findFirst();
  const home = existing
    ? await prisma.home.update({ where: { id: existing.id }, data: { name, lat, lng } })
    : await prisma.home.create({ data: { name, lat, lng } });

  const placesToRecalc = await prisma.place.findMany({ where: { isManualOverride: false } });
  const { updated, errors } = await recalculatePlaces(prisma, home, placesToRecalc);

  res.json({ home, recalculated: updated, recalcErrors: errors });
});

module.exports = router;
