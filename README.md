# Itinéraire Nord du Maroc — 8 jours en famille

App interactive (backend Node/Express + PostgreSQL, frontend Leaflet.js) présentant l'itinéraire du 29/07 au 05/08, avec domicile modifiable, calcul automatique des trajets (routage réel via OSRM) et édition manuelle des lieux/distances.

## Architecture

- `api/` — backend Express + Prisma + PostgreSQL, sert aussi le frontend statique (`api/public/`)
- `docker-compose.yml` — deux services : `api` (app) et `db` (Postgres), pour un usage local
- `render.yaml` — blueprint pour déployer en ligne sur Render en quelques clics
- Calcul de trajet : [serveur public OSRM](https://project-osrm.org/) (gratuit, sans clé API)

## Mettre l'app en ligne (Render — recommandé)

Render fait tourner le conteneur `api` (Dockerfile) + une base Postgres managée, avec un plan gratuit suffisant pour ce projet.

1. Pousser ce dossier sur un repo GitHub (public ou privé, peu importe).
2. Générer le hash bcrypt du PIN familial (choisis un code, ex. `1234`) — le plus simple est de le faire une fois en local avec Docker :
   ```bash
   docker build -t hash-tool ./api
   docker run --rm hash-tool node -e "console.log(require('bcryptjs').hashSync('TON_PIN', 10))"
   ```
   Garde le résultat de côté (une chaîne du type `$2a$10$...`).
3. Sur [dashboard.render.com](https://dashboard.render.com), **New → Blueprint**, sélectionner le repo GitHub. Render détecte `render.yaml` à la racine et propose de créer :
   - le service web `itineraire-maroc` (build à partir de `api/Dockerfile`)
   - la base `itineraire-maroc-db` (Postgres), reliée automatiquement via `DATABASE_URL`
   - un `JWT_SECRET` généré automatiquement
4. Render va demander la valeur de `FAMILY_PIN_HASH` (marquée `sync: false` dans le blueprint, donc à saisir à la main) : coller le hash généré à l'étape 2.
5. Lancer le déploiement. Une fois le service "Live", ouvrir une **Shell** sur le service (onglet *Shell* dans le dashboard Render) et peupler la base une seule fois :
   ```bash
   npx prisma db seed
   ```
6. L'app est accessible à l'URL fournie par Render (`https://itineraire-maroc-xxxx.onrender.com`).

Le plan gratuit Render met le service en veille après une période d'inactivité (premier chargement plus lent après une pause) — largement suffisant pour un usage familial ; passer à un plan payant si besoin d'une dispo permanente.

### Alternatives

- **Railway** ([railway.app](https://railway.app)) : `railway init`, ajouter un plugin Postgres, puis `railway up` — Railway lit directement le `Dockerfile` dans `api/`. Mêmes variables d'env à définir (`DATABASE_URL` auto-injectée par le plugin Postgres, `JWT_SECRET`, `FAMILY_PIN_HASH`).
- **Fly.io** ([fly.io](https://fly.io)) : `fly launch` depuis `api/` (détecte le Dockerfile), `fly postgres create` pour la base, `fly secrets set JWT_SECRET=... FAMILY_PIN_HASH=...`.
- **VPS** : `docker compose up -d` directement dessus (voir section suivante), derrière un reverse proxy (Caddy/nginx) pour le HTTPS.

## Démarrage en local (Docker)

1. Copier `.env.example` en `.env` et remplir les valeurs :
   ```bash
   cp .env.example .env
   ```
2. Générer le hash du PIN familial (choisis un code, ex. `1234`) :
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('TON_PIN', 10))"
   ```
   (nécessite `npm install bcryptjs` en local, ou lance-le une fois dans le conteneur après le premier `up` : `docker compose exec api node -e "console.log(require('bcryptjs').hashSync('TON_PIN',10))"`)

   Colle le résultat dans `FAMILY_PIN_HASH` du `.env`. Choisis aussi un `JWT_SECRET` long et aléatoire.

   ⚠️ **Piège docker-compose** : un hash bcrypt contient des `$` (ex. `$2a$10$...`). Docker Compose interprète `$X` comme une variable dans les fichiers `.env` et va **corrompre le hash en silence** si les `$` ne sont pas doublés. Écris-le comme `FAMILY_PIN_HASH=$$2a$$10$$...` dans `.env` (uniquement dans ce fichier — ne pas doubler les `$` ailleurs, par exemple si tu passes la valeur directement en variable d'env sur Render).
3. Lancer les conteneurs :
   ```bash
   docker compose up -d --build
   ```
4. Peupler la base avec l'itinéraire initial (**une seule fois**, à la première installation) :
   ```bash
   docker compose exec api npx prisma db seed
   ```
5. Ouvrir [http://localhost:3000](http://localhost:3000).

Le bouton **🔒 Édition** en haut à droite permet de se connecter avec le PIN pour changer le domicile, éditer les lieux, forcer un recalcul de trajet ou passer une distance/durée en saisie manuelle. Sans connexion, le site reste consultable en lecture seule.

## Développement sans Docker

```bash
cd api
npm install
# DATABASE_URL doit pointer vers un Postgres local ou distant
npx prisma db push
npx prisma db seed
npm run dev
```

## Notes techniques

- Le calcul de trajet interroge le serveur **public** OSRM (`router.project-osrm.org`) : gratuit et sans clé, mais non garanti à 100 % en continu. Un lieu passé en "override manuel" n'est jamais recalculé automatiquement ; le bouton ↻ force un recalcul ponctuel.
- Le schéma de base est synchronisé avec `prisma db push` (pas de migrations versionnées) — adapté à ce projet perso ; passer à `prisma migrate` si un historique de migrations devient utile.
- Image `api` basée sur `node:20-alpine` : le paquet `openssl` est installé explicitement dans le Dockerfile — sans lui, le moteur Prisma plante silencieusement en boucle sur Alpine (erreur `Could not parse schema engine response`).
