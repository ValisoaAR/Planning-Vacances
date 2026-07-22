const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.put("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.day.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Jour introuvable." });

  const { date, title, desc } = req.body || {};

  const day = await prisma.day.update({
    where: { id },
    data: {
      date: date ?? existing.date,
      title: title ?? existing.title,
      desc: desc ?? existing.desc
    }
  });

  res.json(day);
});

module.exports = router;
