FROM node:20-alpine

# Le moteur Prisma a besoin d'OpenSSL pour fonctionner correctement sur Alpine
# (sans ça, le "schema engine" plante silencieusement au démarrage).
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY public ./public

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node src/server.js"]
