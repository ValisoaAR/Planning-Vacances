/**
 * Calcule le total distance/durée de tout le programme.
 * Règle : un seul trajet de référence par jour (le lieu isPrimary), pour éviter
 * de sur-compter les journées à plusieurs arrêts. Les trajets ROUND_TRIP sont
 * doublés (aller-retour), les trajets ONE_WAY (J1/J8 vers Casablanca) ne le sont pas.
 */
function computeTotals(days) {
  let distanceKm = 0;
  let durationMin = 0;

  for (const day of days) {
    const primary = day.places.find((p) => p.isPrimary) || day.places[0];
    if (!primary || primary.distanceKm == null || primary.durationMin == null) continue;

    const multiplier = primary.legType === "ONE_WAY" ? 1 : 2;
    distanceKm += primary.distanceKm * multiplier;
    durationMin += primary.durationMin * multiplier;
  }

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMin: Math.round(durationMin)
  };
}

module.exports = { computeTotals };
