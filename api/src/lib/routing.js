const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

/**
 * Interroge le serveur public OSRM pour obtenir la distance/durée réelle
 * par la route et la géométrie du trajet entre deux points.
 * @returns {Promise<{distanceKm: number, durationMin: number, geometry: object}>}
 */
async function computeRoute(from, to) {
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM a répondu avec le statut ${res.status}`);
  }

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error(`OSRM n'a pas trouvé de route (code: ${data.code})`);
  }

  const route = data.routes[0];
  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    geometry: route.geometry
  };
}

/** Convertit le résultat de computeRoute() en champs prêts pour un update Prisma. */
function routeToUpdateFields(route) {
  return {
    distanceKm: route.distanceKm,
    durationMin: route.durationMin,
    routeGeometry: route.geometry
  };
}

/**
 * Recalcule un lot de lieux (utilisé après un changement de domicile, ou pour
 * un recalcul global manuel). Les échecs individuels n'interrompent pas le lot.
 * @returns {Promise<{updated: number, errors: Array}>}
 */
async function recalculatePlaces(prisma, home, places) {
  const errors = [];
  for (const place of places) {
    try {
      const route = await computeRoute(home, place);
      await prisma.place.update({ where: { id: place.id }, data: routeToUpdateFields(route) });
    } catch (err) {
      errors.push({ placeId: place.id, name: place.name, error: err.message });
    }
  }
  return { updated: places.length - errors.length, errors };
}

module.exports = { computeRoute, routeToUpdateFields, recalculatePlaces };
