# Itinéraire Nord du Maroc — 8 jours en famille

App interactive (carte + planning éditable) pour le trip du 29/07 au 05/08. Elle tourne sur un serveur Google Cloud (gratuit via le crédit d'essai) et est exposée en ligne via un tunnel Cloudflare.

**Repo GitHub :** https://github.com/ValisoaAR/Planning-Vacances

---

## Partie 1 — Déploiement complet sur Google Cloud (à faire une fois)

### 1.1 Compte Google Cloud
Déjà fait si tu as suivi jusqu'ici : compte créé sur [cloud.google.com/free](https://cloud.google.com/free), crédit d'essai de 300$/90 jours actif. Ce projet ne consommera que quelques dollars sur 2 semaines — largement dans les clous, aucune facturation réelle tant que tu n'actives pas explicitement un compte payant après l'essai.

### 1.2 Créer la machine (VM)

Dans la console Google Cloud → **Compute Engine → VM instances → Create instance** :

| Champ | Valeur |
|---|---|
| Nom | `itineraire-maroc` |
| Région | `europe-west1` (Belgique) ou `europe-west9` (Paris) |
| Type de machine | `e2-small` (2 Go RAM) |
| Image du disque de démarrage | **Ubuntu 22.04 LTS** |
| Pare-feu | pas besoin de cocher HTTP/HTTPS (le tunnel Cloudflare fait sortir la connexion, pas besoin d'ouvrir de port entrant) |

Cliquer **Create**. Attendre que le statut passe à vert (quelques dizaines de secondes).

### 1.3 Se connecter en SSH

Sur la ligne de la VM créée, cliquer le bouton **SSH** → ça ouvre un terminal directement dans le navigateur (aucune clé à gérer).

### 1.4 Installer Docker sur la VM

Coller ces commandes une par une dans le terminal SSH ouvert :

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Vérifier que ça marche :
```bash
sudo docker run hello-world
```

### 1.5 Récupérer le projet

```bash
git clone https://github.com/ValisoaAR/Planning-Vacances.git
cd Planning-Vacances
```

### 1.6 Configurer les secrets (`.env`)

```bash
cp .env.example .env
```

Générer un mot de passe Postgres et une clé JWT aléatoires :
```bash
openssl rand -hex 16   # à coller dans POSTGRES_PASSWORD
openssl rand -hex 32   # à coller dans JWT_SECRET
```

Générer le hash du PIN familial (remplace `TON_PIN` par le code choisi, ex. `051408`) :
```bash
sudo docker compose run --rm api node -e "console.log(require('bcryptjs').hashSync('TON_PIN', 10))"
```
Ça affiche une chaîne du type `$2a$10$abc123...`.

Éditer le fichier avec un éditeur simple :
```bash
nano .env
```
Remplir les 4 lignes :
```
POSTGRES_USER=maroc
POSTGRES_PASSWORD=<le hash openssl généré>
POSTGRES_DB=itineraire_maroc
JWT_SECRET=<la clé openssl générée>
FAMILY_PIN_HASH=<le hash bcrypt généré, EN DOUBLANT CHAQUE $>
```

⚠️ **Piège important** : le hash bcrypt contient des `$` (ex. `$2a$10$abc...`). Docker Compose interprète `$X` comme une variable et **corrompt le hash en silence** si les `$` ne sont pas doublés. Écris-le comme `FAMILY_PIN_HASH=$$2a$$10$$abc...` — uniquement dans ce fichier `.env`. Sauvegarder avec `Ctrl+O`, `Entrée`, puis quitter avec `Ctrl+X`.

### 1.7 Lancer l'application

```bash
sudo docker compose up -d --build
```

Peupler la base avec l'itinéraire de départ (**une seule fois**) :
```bash
sudo docker compose exec api npx prisma db seed
```

### 1.8 Récupérer le lien public à partager

```bash
sudo docker compose logs tunnel | grep trycloudflare
```

Ça affiche une ligne du type :
```
https://xxxx-yyyy-zzzz.trycloudflare.com
```
→ **C'est ce lien qu'il faut envoyer à la famille** (WhatsApp, etc.).

---

## Partie 2 — Utilisation au quotidien (une fois tout installé)

Toutes ces commandes se lancent depuis le terminal SSH de la VM, dans le dossier `Planning-Vacances`.

### Voir si le site tourne / redémarrer après un arrêt
```bash
sudo docker compose up -d
```

### Retrouver le lien public
```bash
sudo docker compose logs tunnel | grep trycloudflare
```
Le lien reste stable tant que le conteneur `tunnel` ne redémarre pas.

### Arrêter le site (rien n'est perdu)
```bash
sudo docker compose down
```

### Se connecter en mode édition sur le site
Bouton **🔒 Édition** en haut à droite du site → le PIN choisi à l'étape 1.6.

### Changer le PIN familial
```bash
sudo docker compose run --rm api node -e "console.log(require('bcryptjs').hashSync('NOUVEAU_PIN', 10))"
nano .env   # remplacer FAMILY_PIN_HASH (en doublant les $, voir 1.6)
sudo docker compose up -d
```

---

## Partie 3 — Développement local (sur ton PC, avant de pousser sur GitHub)

Pour tester une modification avant de la déployer sur la VM :

```bash
docker compose up -d --build
docker compose exec api npx prisma db seed   # seulement au premier lancement local
```
Ouvrir [http://localhost:3000](http://localhost:3000). Une fois satisfait, `git push` puis sur la VM : `git pull && sudo docker compose up -d --build`.

---

## Notes techniques

- Calcul de trajet : serveur public [OSRM](https://project-osrm.org/), gratuit et sans clé, mais non garanti à 100 % en continu. Un lieu en "override manuel" n'est jamais recalculé automatiquement (bouton ↻ pour forcer).
- Schéma de base synchronisé avec `prisma db push` (pas de migrations versionnées) — suffisant pour ce projet perso.
- Le Dockerfile installe explicitement `openssl` (image Alpine) : sans ça, Prisma plante en boucle au démarrage (`Could not parse schema engine response`).
- Architecture : `api/` = backend Express + Prisma + PostgreSQL, sert aussi le frontend statique (`api/public/`). `docker-compose.yml` = 3 services (`api`, `db`, `tunnel`).
- Le tunnel Cloudflare "quick" (`tunnel --url ...`) ne nécessite ni compte ni carte, mais son URL change à chaque redémarrage du conteneur `tunnel` — pas grave sur une VM qui reste allumée en continu.
- `render.yaml` est présent dans le repo comme piste alternative si un jour tu changes d'hébergeur, mais n'est plus le chemin recommandé (voir historique : Render a de vraies plaintes clients sur sa facturation).
