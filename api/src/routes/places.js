const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { computeRoute, routeToUpdateFields } = require("../lib/routing");

const router = express.Router();

async function getHomeOrThrow() {
  const home = await prisma.home.findFirst();
  if (!home) throw new Error("Aucun domicile configuré.");
  return home;
}

async function clearOtherPrimaries(dayId, keepPlaceId) {
  await prisma.place.updateMany({
    where: { dayId, NOT: { id: keepPlaceId } },
    data: { isPrimary: false }
  });
}

router.post("/", requireAuth, async (req, res) => {
  const {
    dayId, name, lat, lng, optional, isPrimary, legType, note,
    isManualOverride, distanceKm, durationMin
  } = req.body || {};

  if (!dayId || !name || typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "dayId, name, lat et lng sont requis." });
  }

  const count = await prisma.place.count({ where: { dayId } });

  let computedFields = { distanceKm: distanceKm ?? null, durationMin: durationMin ?? null, routeGeometry: null };
  if (!isManualOverride) {
    try {
      const home = await getHomeOrThrow();
      computedFields = routeToUpdateFields(await computeRoute(home, { lat, lng }));
    } catch (err) {
      return res.status(502).json({ error: `Calcul de trajet impossible : ${err.message}` });
    }
  }

  const place = await prisma.place.create({
    data: {
      dayId,
      name,
      lat,
      lng,
      optional: optional ?? false,
      isPrimary: isPrimary ?? false,
      legType: legType ?? "ROUND_TRIP",
      note: note ?? null,
      isManualOverride: isManualOverride ?? false,
      sortOrder: count,
      ...computedFields
    }
  });

  if (place.isPrimary) await clearOtherPrimaries(place.dayId, place.id);

  res.status(201).json(place);
});

router.put("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.place.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Lieu introuvable." });

  const {
    name, lat, lng, optional, isPrimary, legType, note,
    isManualOverride, distanceKm, durationMin
  } = req.body || {};

  const coordsChanged =
    (lat !== undefined && lat !== existing.lat) || (lng !== undefined && lng !== existing.lng);
  const nextManualOverride = isManualOverride !== undefined ? isManualOverride : existing.isManualOverride;

  const data = {
    name: name ?? existing.name,
    lat: lat ?? existing.lat,
    lng: lng ?? existing.lng,
    optional: optional ?? existing.optional,
    isPrimary: isPrimary ?? existing.isPrimary,
    legType: legType ?? existing.legType,
    note: note !== undefined ? note : existing.note,
    isManualOverride: nextManualOverride
  };

  if (nextManualOverride) {
    if (distanceKm !== undefined) data.distanceKm = distanceKm;
    if (durationMin !== undefined) data.durationMin = durationMin;
  } else if (coordsChanged || (existing.isManualOverride && !nextManualOverride)) {
    try {
      const home = await getHomeOrThrow();
      const route = await computeRoute(home, { lat: data.lat, lng: data.lng });
      Object.assign(data, routeToUpdateFields(route));
    } catch (err) {
      return res.status(502).json({ error: `Calcul de trajet impossible : ${err.message}` });
    }
  }

  const place = await prisma.place.update({ where: { id }, data });

  if (place.isPrimary) await clearOtherPrimaries(place.dayId, place.id);

  res.json(place);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.place.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Lieu introuvable." });
  }
});

router.post("/:id/recalculate", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const place = await prisma.place.findUnique({ where: { id } });
  if (!place) return res.status(404).json({ error: "Lieu introuvable." });

  try {
    const home = await getHomeOrThrow();
    const route = await computeRoute(home, place);
    const updated = await prisma.place.update({ where: { id }, data: routeToUpdateFields(route) });
    res.json(updated);
  } catch (err) {
    res.status(502).json({ error: `Calcul de trajet impossible : ${err.message}` });
  }
});

module.exports = router;
