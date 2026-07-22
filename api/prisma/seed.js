const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CASABLANCA = { lat: 33.5731, lng: -7.5898 };

const HOME = {
  name: "Cabo Negro (logement)",
  lat: 35.6627774,
  lng: -5.2945694
};

const DAYS = [
  {
    num: 1,
    date: "29/07",
    title: "Route vers Cabo Negro",
    desc: "Trajet Casablanca → Cabo Negro (logement). Installation, plage à pied en fin de journée, dîner front de mer.",
    places: [
      { name: "Casablanca (point de départ)", ...CASABLANCA, legType: "ONE_WAY", isPrimary: true }
    ]
  },
  {
    num: 2,
    date: "30/07",
    title: "Tétouan",
    desc: "Matin : médina et quartier andalou. Après-midi : retour au logement + plage (Marina Smir / Dalia). Must-see : Place Hassan II.",
    places: [
      { name: "Médina de Tétouan (UNESCO)", lat: 35.5724388, lng: -5.3755039, isPrimary: true }
    ]
  },
  {
    num: 3,
    date: "31/07",
    title: "Chefchaouen",
    desc: "Journée complète : la ville bleue, la Kasbah, Plaza Uta el-Hammam.",
    places: [
      { name: "Chefchaouen", lat: 35.168796, lng: -5.2683641, isPrimary: true }
    ]
  },
  {
    num: 4,
    date: "01/08",
    title: "Tanger",
    desc: "Matin : Cap Spartel puis Grottes d'Hercule. Après-midi : médina / Kasbah. Coucher de soleil : Café Hafa. Option (si le temps le permet) : prolonger jusqu'à Assilah en fin d'après-midi, à la place ou en plus de Café Hafa.",
    places: [
      { name: "Cap Spartel", lat: 35.7863578, lng: -5.9145568, isPrimary: true },
      { name: "Grottes d'Hercule", lat: 35.7599335, lng: -5.9392319 },
      { name: "Kasbah de Tanger", lat: 35.7885534, lng: -5.8127174 },
      { name: "Café Hafa", lat: 35.7913719, lng: -5.8218393 },
      {
        name: "Assilah",
        lat: 35.4658,
        lng: -6.0342,
        optional: true,
        note: "Extension possible fin d'après-midi · ~1h de Tanger, ~1h30-2h de Cabo Negro"
      }
    ]
  },
  {
    num: 5,
    date: "02/08",
    title: "Oued Laou",
    desc: "Plage et village de pêcheurs, route côtière sinueuse.",
    places: [
      { name: "Oued Laou", lat: 35.4474148, lng: -5.0952218, isPrimary: true }
    ]
  },
  {
    num: 6,
    date: "03/08",
    title: "Fnideq / Belyounech",
    desc: "Matin : shopping à Fnideq. Après-midi : plage de Belyounech (zone frontalière avec Ceuta — prévoir papiers d'identité).",
    places: [
      { name: "Fnideq", lat: 35.8432765, lng: -5.3610346, isPrimary: true },
      { name: "Plage de Belyounech", lat: 35.9095942, lng: -5.3945701 }
    ]
  },
  {
    num: 7,
    date: "04/08",
    title: "Journée plage libre",
    desc: "Farniente à la plage, sans planning fixe.",
    places: [
      { name: "Marina Smir", lat: 35.7367281, lng: -5.3468563, isPrimary: true },
      { name: "Dalia Beach (option)", lat: 35.9052485, lng: -5.4767981 }
    ]
  },
  {
    num: 8,
    date: "05/08",
    title: "Retour à Casablanca",
    desc: "Trajet Cabo Negro (logement) → Casablanca.",
    places: [
      { name: "Casablanca (retour)", ...CASABLANCA, legType: "ONE_WAY", isPrimary: true }
    ]
  }
];

async function main() {
  await prisma.place.deleteMany();
  await prisma.day.deleteMany();
  await prisma.home.deleteMany();

  await prisma.home.create({ data: HOME });

  for (const day of DAYS) {
    await prisma.day.create({
      data: {
        num: day.num,
        date: day.date,
        title: day.title,
        desc: day.desc,
        places: {
          create: day.places.map((p, index) => ({
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            optional: p.optional ?? false,
            isPrimary: p.isPrimary ?? false,
            legType: p.legType ?? "ROUND_TRIP",
            note: p.note ?? null,
            sortOrder: index
          }))
        }
      }
    });
  }

  console.log("Seed terminé : domicile + 8 jours + lieux insérés.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
