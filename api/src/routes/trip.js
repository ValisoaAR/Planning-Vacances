const express = require("express");
const prisma = require("../lib/prisma");
const { computeTotals } = require("../lib/totals");

const router = express.Router();

router.get("/", async (req, res) => {
  const home = await prisma.home.findFirst();
  const days = await prisma.day.findMany({
    orderBy: { num: "asc" },
    include: { places: { orderBy: { sortOrder: "asc" } } }
  });

  const totals = computeTotals(days);

  res.json({ home, days, totals });
});

module.exports = router;
