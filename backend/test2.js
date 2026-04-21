const Papa = require('papaparse');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLVC-7KTW8mhUZiiyR7fvTfYEZ3S6AP7jkmC4_2S-SpK-NCQF6DpT4NWERQO8rGIBZ0dkaSiYhXK1E/pub?gid=0&single=true&output=csv";
  
  console.log("Fetching CSV...");
  const response = await fetch(sheetUrl);
  const csvText = await response.text();
  console.log("Fetched " + csvText.length + " bytes.");
  
  const results = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  
  const participants = results.data;
  console.log("Parsed " + participants.length + " participants");
  
  console.log("Simulating upload logic...");
  
  let tournament = await prisma.tournament.findFirst({ where: { status: "setup" } });
  if (!tournament) {
    console.log("Creating setup tournament...");
    tournament = await prisma.tournament.create({
      data: { name: "RNH Live Event", status: "setup" }
    });
  }

  const participantsByCategory = {};
  for (const p of participants) {
    const catName = p.Categoria || p.categoria || p.category || "Open";
    if (!participantsByCategory[catName]) participantsByCategory[catName] = [];
    participantsByCategory[catName].push(p);
  }

  const categories = await prisma.category.findMany({ where: { tournamentId: tournament.id } });
  let totalParts = 0;

  for (const [catName, catParticipants] of Object.entries(participantsByCategory)) {
    let category = categories.find(c => c.name.toLowerCase().trim() === catName.toLowerCase().trim());
    if (!category) {
      console.log("Creating category", catName);
      category = await prisma.category.create({
        data: { name: catName, tournamentId: tournament.id, groupSize: 4 }
      });
    }

    const createdParticipants = [];
    for (const p of catParticipants) {
      const cp = await prisma.participant.create({
        data: {
          name: p.Nombre || p.name || 'Unknown',
          alias: p.Alias || p.alias || null,
          categoryId: category.id
        }
      });
      createdParticipants.push(cp);
    }
    console.log("Created", createdParticipants.length, "for", catName);
    totalParts += createdParticipants.length;
  }
  
  console.log("All done!", totalParts);
}

run().catch(console.error).finally(()=>prisma.$disconnect());
