const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: "Connexion requise (PIN famille)." });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session invalide ou expirée, reconnecte-toi." });
  }
}

module.exports = { requireAuth };
