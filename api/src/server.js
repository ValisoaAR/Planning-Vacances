const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const tripRoutes = require("./routes/trip");
const homeRoutes = require("./routes/home");
const placesRoutes = require("./routes/places");
const daysRoutes = require("./routes/days");
const authRoutes = require("./routes/auth");
const recalculateRoutes = require("./routes/recalculate");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.use("/api/trip", tripRoutes);
app.use("/api/home", homeRoutes);
app.use("/api/places", placesRoutes);
app.use("/api/days", daysRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/recalculate-all", recalculateRoutes);

app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`Itinéraire Maroc — serveur démarré sur http://localhost:${PORT}`);
});
