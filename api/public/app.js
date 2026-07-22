// ---- État de l'application --------------------------------------------------

let trip = null; // { home, days, totals } — chargé depuis /api/trip
let isAuthenticated = false;
let editingPlaceId = null;
let addingPlaceForDayId = null;
let pickingHomeOnMap = false;

const DAY_COLORS = [
  "#c96a3b", "#0d6d63", "#3d4d8f", "#b8892a",
  "#1f8a5f", "#a13a4c", "#21729a", "#8a6a35"
];

// ---- Utilitaires -------------------------------------------------------------

function gmapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function dayColor(dayNum) {
  return DAY_COLORS[(dayNum - 1) % DAY_COLORS.length];
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function formatDistance(km) {
  return km == null ? "—" : `${Math.round(km)} km`;
}

function formatDuration(min) {
  if (min == null) return "—";
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

function findPrimaryPlace(day) {
  return day.places.find((p) => p.isPrimary) || day.places[0] || null;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// ---- Carte Leaflet -------------------------------------------------------------

const map = L.map("map", { scrollWheelZoom: true });
let mapLayers = [];
let dayRouteLayers = {}; // dayId -> [{ layer, baseStyle }] — permet de surligner le tracé d'un jour

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
}).addTo(map);

function clearMapLayers() {
  mapLayers.forEach((l) => map.removeLayer(l));
  mapLayers = [];
  dayRouteLayers = {};
}

function highlightDay(dayId) {
  Object.entries(dayRouteLayers).forEach(([id, entries]) => {
    const active = Number(id) === dayId;
    entries.forEach(({ layer, baseStyle }) => {
      layer.setStyle(active
        ? { ...baseStyle, weight: baseStyle.weight + 3, opacity: 0.95 }
        : { ...baseStyle, opacity: baseStyle.opacity * 0.4 });
      if (active) layer.bringToFront();
    });
  });
}

function resetHighlight() {
  Object.values(dayRouteLayers).forEach((entries) => {
    entries.forEach(({ layer, baseStyle }) => layer.setStyle(baseStyle));
  });
}

function homeIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="marker-home">🏠</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19]
  });
}

function placeIcon(day, place, color) {
  const isTransfer = place.legType === "ONE_WAY";
  const label = isTransfer ? "🚗" : day.num;
  const classes = ["marker-badge"];
  if (place.optional) classes.push("optional");
  if (isTransfer) classes.push("transfer");
  return L.divIcon({
    className: "",
    html: `<div class="${classes.join(" ")}" style="background:${color}"><span>${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28]
  });
}

function drawPlaceLine(home, place, color, dayId) {
  const baseStyle = {
    color,
    weight: place.legType === "ONE_WAY" ? 4 : 3,
    opacity: place.optional ? 0.3 : 0.55,
    dashArray: place.legType === "ONE_WAY" ? "2 8" : "6 8"
  };

  // Pas encore calculé par OSRM : ligne droite provisoire en attendant.
  const layer = place.routeGeometry
    ? L.geoJSON(place.routeGeometry, { style: baseStyle })
    : L.polyline([[home.lat, home.lng], [place.lat, place.lng]], { ...baseStyle, dashArray: "2 6" });

  layer.addTo(map);
  mapLayers.push(layer);
  (dayRouteLayers[dayId] ||= []).push({ layer, baseStyle });
}

function renderMap() {
  clearMapLayers();
  if (!trip) return;

  const { home, days } = trip;
  const boundsPoints = [[home.lat, home.lng]];

  const homeMarker = L.marker([home.lat, home.lng], { icon: homeIcon() })
    .addTo(map)
    .bindPopup(`<strong>${escapeHtml(home.name)}</strong><br><a class="place-link" href="${gmapsLink(home.lat, home.lng)}" target="_blank" rel="noopener">Ouvrir dans Google Maps</a>`);
  mapLayers.push(homeMarker);

  days.forEach((day) => {
    const color = dayColor(day.num);
    day.places.forEach((place) => {
      drawPlaceLine(home, place, color, day.id);

      // Cliquer sur un pin affiche le programme complet du jour (organisé, avec le tracé mis en avant)
      // plutôt qu'une simple popup — c'est la même vue que celle ouverte depuis la liste des jours.
      const marker = L.marker([place.lat, place.lng], { icon: placeIcon(day, place, color) }).addTo(map);
      marker.on("click", () => openDayDetail(day));
      mapLayers.push(marker);

      boundsPoints.push([place.lat, place.lng]);
    });
  });

  map.fitBounds(boundsPoints, { padding: [30, 30] });
}

function focusOnDay(day) {
  const points = day.places.map((p) => [p.lat, p.lng]);
  if (points.length === 0) {
    map.setView([trip.home.lat, trip.home.lng], 13);
    return;
  }
  map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
}

// ---- Rendu : bandeau total ------------------------------------------------------

function totalsBannerHTML(totals) {
  return `
    <div class="totals-banner">
      <div class="totals-icon">🧭</div>
      <div>
        <div class="totals-label">Total trajets du programme</div>
        <div class="totals-value">${formatDistance(totals.distanceKm)} · ${formatDuration(totals.durationMin)}</div>
      </div>
    </div>`;
}

// ---- Rendu : éditeur domicile ----------------------------------------------------

function homeEditorHTML(home) {
  return `
    <div class="editor-card" id="home-editor">
      <h2 class="editor-title">🏠 Domicile</h2>
      <div class="editor-grid">
        <label>Nom
          <input type="text" id="home-name" value="${escapeHtml(home.name)}">
        </label>
        <label>Latitude
          <input type="number" step="any" id="home-lat" value="${home.lat}">
        </label>
        <label>Longitude
          <input type="number" step="any" id="home-lng" value="${home.lng}">
        </label>
      </div>
      <div class="editor-actions">
        <button type="button" data-action="pick-home-on-map" class="btn-secondary">📍 Choisir sur la carte</button>
        <button type="button" data-action="save-home" class="btn-primary">Enregistrer et recalculer</button>
      </div>
      <p id="home-save-status" class="save-status" hidden></p>
    </div>`;
}

// ---- Rendu : lieux (vue + édition) ------------------------------------------------

/** Texte partagé aller / aller-retour (ou trajet simple), réutilisé par la liste des lieux, le badge du jour et la vue détail. */
function tripInfoText(place) {
  if (place.distanceKm == null || place.durationMin == null) return "Trajet non calculé";
  if (place.legType === "ONE_WAY") {
    return `Trajet simple : ${formatDistance(place.distanceKm)} · ${formatDuration(place.durationMin)}`;
  }
  return `Aller : ${formatDistance(place.distanceKm)} · ${formatDuration(place.durationMin)} &nbsp;·&nbsp; Aller-retour : ${formatDistance(place.distanceKm * 2)} · ${formatDuration(place.durationMin * 2)}`;
}

function legInfoHTML(place) {
  const pending = place.distanceKm == null;
  return `<span class="place-trip-info${pending ? " pending" : ""}">${tripInfoText(place)}</span>`;
}

/** Bloc nom + tags + note + trajet, partagé entre la carte-jour (éditable) et la vue détail (lecture seule). */
function placeInfoBlockHTML(place) {
  return `
    <span class="place-name">
      ${escapeHtml(place.name)}
      ${place.optional ? '<span class="optional-tag">Optionnel</span>' : ""}
      ${place.isPrimary ? '<span class="primary-tag">★ Référence du jour</span>' : ""}
      ${place.isManualOverride ? '<span class="manual-tag">Manuel</span>' : ""}
    </span>
    ${place.note ? `<span class="place-note">${escapeHtml(place.note)}</span>` : ""}
    ${legInfoHTML(place)}
  `;
}

function placeViewHTML(day, place) {
  return `
    <li class="place-item${place.optional ? " optional" : ""}" data-place-id="${place.id}">
      <div class="place-main">
        <span class="place-name-wrap">
          ${placeInfoBlockHTML(place)}
        </span>
        <a class="place-link" href="${gmapsLink(place.lat, place.lng)}" target="_blank" rel="noopener">Google Maps</a>
      </div>
      ${isAuthenticated ? `
        <div class="place-edit-actions">
          <button type="button" class="icon-btn" data-action="edit-place" data-id="${place.id}" title="Modifier">✎</button>
          <button type="button" class="icon-btn" data-action="recalc-place" data-id="${place.id}" title="Recalculer le trajet">↻</button>
          ${!place.isPrimary ? `<button type="button" class="icon-btn" data-action="set-primary" data-id="${place.id}" title="Définir comme référence du jour">★</button>` : ""}
          <button type="button" class="icon-btn danger" data-action="delete-place" data-id="${place.id}" title="Supprimer">🗑</button>
        </div>` : ""}
    </li>`;
}

function placeEditFormHTML(place) {
  return `
    <li class="place-item place-edit-form" data-place-id="${place.id}">
      <div class="editor-grid">
        <label>Nom <input type="text" class="edit-name" value="${escapeHtml(place.name)}"></label>
        <label>Latitude <input type="number" step="any" class="edit-lat" value="${place.lat}"></label>
        <label>Longitude <input type="number" step="any" class="edit-lng" value="${place.lng}"></label>
        <label>Note <input type="text" class="edit-note" value="${escapeHtml(place.note || "")}"></label>
      </div>
      <label class="checkbox-line"><input type="checkbox" class="edit-optional" ${place.optional ? "checked" : ""}> Optionnel</label>
      <label class="checkbox-line">
        <input type="checkbox" class="edit-manual-override" ${place.isManualOverride ? "checked" : ""}> Distance/durée manuelle (override)
      </label>
      <div class="editor-grid manual-fields" ${place.isManualOverride ? "" : "hidden"}>
        <label>Distance aller (km) <input type="number" step="any" class="edit-distance" value="${place.distanceKm ?? ""}"></label>
        <label>Durée aller (min) <input type="number" step="any" class="edit-duration" value="${place.durationMin ?? ""}"></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-action="cancel-edit-place">Annuler</button>
        <button type="button" class="btn-primary" data-action="save-place" data-id="${place.id}">Enregistrer</button>
      </div>
    </li>`;
}

function addPlaceFormHTML(dayId) {
  return `
    <li class="place-item place-edit-form">
      <div class="editor-grid">
        <label>Nom <input type="text" class="new-name" placeholder="Nom du lieu"></label>
        <label>Latitude <input type="number" step="any" class="new-lat" placeholder="35.123"></label>
        <label>Longitude <input type="number" step="any" class="new-lng" placeholder="-5.123"></label>
      </div>
      <label class="checkbox-line"><input type="checkbox" class="new-optional"> Optionnel</label>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-action="cancel-add-place">Annuler</button>
        <button type="button" class="btn-primary" data-action="save-new-place" data-day-id="${dayId}">Ajouter</button>
      </div>
    </li>`;
}

function placeListHTML(day) {
  const items = day.places.map((p) =>
    editingPlaceId === p.id ? placeEditFormHTML(p) : placeViewHTML(day, p)
  ).join("");

  const addForm = addingPlaceForDayId === day.id ? addPlaceFormHTML(day.id) : "";
  const addButton = isAuthenticated && addingPlaceForDayId !== day.id
    ? `<button type="button" class="btn-secondary add-place-btn" data-action="add-place" data-day-id="${day.id}">+ Ajouter un lieu</button>`
    : "";

  return `<ul class="place-list">${items}${addForm}</ul>${addButton}`;
}

// ---- Rendu : cartes jour ---------------------------------------------------------

function dayBadgeHTML(day) {
  const primary = findPrimaryPlace(day);
  if (!primary) return "";
  const pending = primary.distanceKm == null;
  return `<span class="day-badge${pending ? " badge-pending" : ""}">🚗 ${tripInfoText(primary)}</span>`;
}

// ---- Rendu : vue détail du programme d'un jour (modal, ouverte depuis un pin ou une carte-jour) ----

function placeDetailRowHTML(place, order) {
  return `
    <li class="detail-place-row${place.optional ? " optional" : ""}">
      <span class="detail-place-order">${order}</span>
      <div class="detail-place-body">${placeInfoBlockHTML(place)}</div>
      <a class="place-link" href="${gmapsLink(place.lat, place.lng)}" target="_blank" rel="noopener">Google Maps</a>
    </li>`;
}

function dayDetailHTML(day) {
  // --day-color est posée ici, sur le conteneur englobant : .detail-header et
  // .detail-place-list sont frères, une variable CSS ne descend pas entre frères.
  return `
    <div style="--day-color:${dayColor(day.num)}">
      <div class="detail-header">
        <div class="day-number">${day.num}</div>
        <div class="day-heading">
          <h2 class="day-title">${escapeHtml(day.title)}</h2>
          <div class="day-date">${escapeHtml(day.date)}</div>
        </div>
      </div>
      ${dayBadgeHTML(day)}
      <p class="day-desc">${escapeHtml(day.desc)}</p>
      <ol class="detail-place-list">
        ${day.places.map((p, i) => placeDetailRowHTML(p, i + 1)).join("")}
      </ol>
    </div>
  `;
}

function openDayDetail(day) {
  authModal.hidden = true;
  document.getElementById("day-detail-content").innerHTML = dayDetailHTML(day);
  document.getElementById("day-detail-modal").hidden = false;
  highlightDay(day.id);
  focusOnDay(day);
}

function closeDayDetail() {
  document.getElementById("day-detail-modal").hidden = true;
  resetHighlight();
}

function renderDaysList() {
  const listEl = document.getElementById("days-list");
  listEl.innerHTML = "";

  listEl.insertAdjacentHTML("beforeend", totalsBannerHTML(trip.totals));
  if (isAuthenticated) listEl.insertAdjacentHTML("beforeend", homeEditorHTML(trip.home));

  trip.days.forEach((day) => {
    const card = document.createElement("article");
    card.className = "day-card";
    card.style.setProperty("--day-color", dayColor(day.num));
    card.dataset.dayId = day.id;

    card.innerHTML = `
      <div class="day-card-header" data-action="focus-day" data-day-id="${day.id}">
        <div class="day-number">${day.num}</div>
        <div class="day-heading">
          <h2 class="day-title">${escapeHtml(day.title)}</h2>
          <div class="day-date">${escapeHtml(day.date)}</div>
        </div>
      </div>
      ${dayBadgeHTML(day)}
      <p class="day-desc">${escapeHtml(day.desc)}</p>
      ${placeListHTML(day)}
    `;

    listEl.appendChild(card);
  });
}

function renderAll() {
  renderMap();
  renderDaysList();
}

// ---- Chargement des données -------------------------------------------------------

async function loadTrip() {
  trip = await api("/api/trip");
  renderAll();
}

// ---- Authentification --------------------------------------------------------------

const authModal = document.getElementById("auth-modal");
const authBtn = document.getElementById("auth-toggle");
const authForm = document.getElementById("auth-form");
const authError = document.getElementById("auth-error");

async function refreshAuthStatus() {
  const status = await api("/api/auth/status");
  isAuthenticated = status.authenticated;
  updateAuthButton();
}

function updateAuthButton() {
  authBtn.textContent = isAuthenticated ? "🔓 Déconnexion" : "🔒 Édition";
}

authBtn.addEventListener("click", async () => {
  if (isAuthenticated) {
    await api("/api/auth/logout", { method: "POST" });
    isAuthenticated = false;
    editingPlaceId = null;
    addingPlaceForDayId = null;
    updateAuthButton();
    renderAll();
  } else {
    closeDayDetail();
    authError.hidden = true;
    authForm.reset();
    authModal.hidden = false;
  }
});

document.getElementById("auth-cancel").addEventListener("click", () => {
  authModal.hidden = true;
});

const dayDetailModal = document.getElementById("day-detail-modal");
document.getElementById("detail-close").addEventListener("click", closeDayDetail);
dayDetailModal.addEventListener("click", (e) => {
  if (e.target === dayDetailModal) closeDayDetail();
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = document.getElementById("pin-input").value;
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ pin }) });
    isAuthenticated = true;
    authModal.hidden = true;
    updateAuthButton();
    renderAll();
  } catch (err) {
    authError.textContent = err.message;
    authError.hidden = false;
  }
});

// ---- Actions (délégation d'événements sur la liste des jours) ------------------------

document.getElementById("days-list").addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  try {
    if (action === "focus-day") {
      const day = trip.days.find((d) => d.id === Number(target.dataset.dayId));
      if (day) openDayDetail(day);
    } else if (action === "edit-place") {
      editingPlaceId = Number(target.dataset.id);
      addingPlaceForDayId = null;
      renderDaysList();
    } else if (action === "cancel-edit-place") {
      editingPlaceId = null;
      renderDaysList();
    } else if (action === "delete-place") {
      if (!confirm("Supprimer ce lieu ?")) return;
      await api(`/api/places/${target.dataset.id}`, { method: "DELETE" });
      await loadTrip();
    } else if (action === "recalc-place") {
      await api(`/api/places/${target.dataset.id}/recalculate`, { method: "POST" });
      await loadTrip();
    } else if (action === "set-primary") {
      await api(`/api/places/${target.dataset.id}`, { method: "PUT", body: JSON.stringify({ isPrimary: true }) });
      await loadTrip();
    } else if (action === "save-place") {
      await savePlaceEdit(Number(target.dataset.id), target.closest(".place-edit-form"));
    } else if (action === "add-place") {
      addingPlaceForDayId = Number(target.dataset.dayId);
      editingPlaceId = null;
      renderDaysList();
    } else if (action === "cancel-add-place") {
      addingPlaceForDayId = null;
      renderDaysList();
    } else if (action === "save-new-place") {
      await saveNewPlace(Number(target.dataset.dayId), target.closest(".place-edit-form"));
    } else if (action === "pick-home-on-map") {
      pickingHomeOnMap = true;
      target.classList.add("active");
      target.textContent = "📍 Clique sur la carte…";
    } else if (action === "save-home") {
      await saveHome();
    }
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("days-list").addEventListener("change", (e) => {
  if (e.target.classList.contains("edit-manual-override")) {
    const fields = e.target.closest(".place-edit-form").querySelector(".manual-fields");
    fields.hidden = !e.target.checked;
  }
});

async function savePlaceEdit(id, form) {
  const isManualOverride = form.querySelector(".edit-manual-override").checked;
  const payload = {
    name: form.querySelector(".edit-name").value,
    lat: Number(form.querySelector(".edit-lat").value),
    lng: Number(form.querySelector(".edit-lng").value),
    note: form.querySelector(".edit-note").value || null,
    optional: form.querySelector(".edit-optional").checked,
    isManualOverride
  };
  if (isManualOverride) {
    const distanceVal = form.querySelector(".edit-distance").value;
    const durationVal = form.querySelector(".edit-duration").value;
    payload.distanceKm = distanceVal === "" ? null : Number(distanceVal);
    payload.durationMin = durationVal === "" ? null : Number(durationVal);
  }
  await api(`/api/places/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  editingPlaceId = null;
  await loadTrip();
}

async function saveNewPlace(dayId, form) {
  const payload = {
    dayId,
    name: form.querySelector(".new-name").value,
    lat: Number(form.querySelector(".new-lat").value),
    lng: Number(form.querySelector(".new-lng").value),
    optional: form.querySelector(".new-optional").checked
  };
  if (!payload.name || Number.isNaN(payload.lat) || Number.isNaN(payload.lng)) {
    alert("Nom, latitude et longitude sont requis.");
    return;
  }
  await api("/api/places", { method: "POST", body: JSON.stringify(payload) });
  addingPlaceForDayId = null;
  await loadTrip();
}

async function saveHome() {
  const name = document.getElementById("home-name").value;
  const lat = Number(document.getElementById("home-lat").value);
  const lng = Number(document.getElementById("home-lng").value);
  const statusEl = document.getElementById("home-save-status");

  statusEl.hidden = false;
  statusEl.textContent = "Enregistrement et recalcul en cours…";

  const result = await api("/api/home", { method: "PUT", body: JSON.stringify({ name, lat, lng }) });
  await loadTrip();

  const banner = document.getElementById("home-save-status");
  if (banner) {
    banner.hidden = false;
    banner.textContent = result.recalcErrors && result.recalcErrors.length
      ? `${result.recalculated} lieu(x) recalculé(s), ${result.recalcErrors.length} échec(s) (réessaie avec le bouton ↻).`
      : `${result.recalculated} lieu(x) recalculé(s) avec succès.`;
  }
}

map.on("click", (e) => {
  if (!pickingHomeOnMap) return;
  pickingHomeOnMap = false;
  const latInput = document.getElementById("home-lat");
  const lngInput = document.getElementById("home-lng");
  if (latInput && lngInput) {
    latInput.value = e.latlng.lat.toFixed(6);
    lngInput.value = e.latlng.lng.toFixed(6);
  }
});

// ---- Bouton menu : réduire / afficher la liste des jours --------------------

const toggleBtn = document.getElementById("toggle-list");
const layoutEl = document.querySelector(".layout");

toggleBtn.addEventListener("click", () => {
  const isCollapsed = layoutEl.classList.toggle("list-collapsed");
  toggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
  setTimeout(() => map.invalidateSize(), 260);
});

// ---- Démarrage -----------------------------------------------------------------

(async function init() {
  await refreshAuthStatus();
  await loadTrip();
})();
