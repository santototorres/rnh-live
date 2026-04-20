import { Request, Response } from 'express';
import prisma from '../db';
import Papa from 'papaparse';

// ─── Upload Participants from Google Sheets CSV ───

export const uploadParticipantsUrl = async (req: Request, res: Response) => {
  try {
    const { sheetUrl, groupSize = 4 } = req.body;
    if (!sheetUrl) return res.status(400).json({ error: "URL inválida" });

    let csvUrl = sheetUrl;
    if (!sheetUrl.includes('/pub?')) {
      let docId = sheetUrl;
      const match = sheetUrl.match(/\/d\/(.*?)(\/|$)/);
      if (match?.[1]) docId = match[1];
      csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`;
    }
    const response = await fetch(csvUrl);
    if (!response.ok) {
      return res.status(400).json({ error: "No se pudo descargar. Verifica que el enlace a la hoja de cálculo sea público (Cualquier persona con el enlace)." });
    }
    const csvText = await response.text();

    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const participants = results.data as any[];

          let tournament = await prisma.tournament.findFirst({ where: { status: "setup" } });
          if (!tournament) {
            tournament = await prisma.tournament.create({
              data: { name: "RNH Live Event", status: "setup" }
            });
            const fixedCategories = ["Mujeres Pro", "Hombres Amateur", "Hombres Pro", "Rollerskate", "Mujeres Amateur", "Junior"];
            for (const catName of fixedCategories) {
              await prisma.category.create({ data: { name: catName, tournamentId: tournament.id, groupSize: 4 } });
            }
          }

          const participantsByCategory: Record<string, any[]> = {};
          for (const p of participants) {
            const catName = p.Categoria || p.categoria || p.category || "Open";
            if (!participantsByCategory[catName]) participantsByCategory[catName] = [];
            participantsByCategory[catName].push(p);
          }

          let totalGroups = 0;
          let totalParticipants = 0;

          const categories = await prisma.category.findMany({ where: { tournamentId: tournament.id } });

          for (const [catName, catParticipants] of Object.entries(participantsByCategory)) {
            let category = categories.find(c => c.name.toLowerCase().trim() === catName.toLowerCase().trim());
            
            if (!category) {
              category = await prisma.category.create({
                data: { name: catName, tournamentId: tournament.id, groupSize }
              });
            }

            const createdParticipants = await Promise.all(
              catParticipants.map(async (p: any) =>
                prisma.participant.create({
                  data: {
                    name: p.Nombre || p.nombre || p.name || 'Unknown',
                    alias: p.Alias || p.alias || null,
                    categoryId: category!.id
                  }
                })
              )
            );

            totalParticipants += createdParticipants.length;

            let round1 = await prisma.round.findFirst({ where: { categoryId: category.id, number: 1 } });
            if (!round1) {
              round1 = await prisma.round.create({ data: { number: 1, categoryId: category.id } });
            }

            const existingParticipants = await prisma.participant.findMany({ where: { categoryId: category.id } });
            const shuffled = [...existingParticipants].sort(() => Math.random() - 0.5);
            
            const existingGroups = await prisma.group.findMany({ where: { roundId: round1.id } });
            if (existingGroups.length > 0) {
              await prisma.groupParticipant.deleteMany({ where: { groupId: { in: existingGroups.map(g => g.id) } } });
              await prisma.group.deleteMany({ where: { roundId: round1.id } });
            }

            const chunks = [];
            for (let i = 0; i < shuffled.length; i += groupSize) {
              chunks.push(shuffled.slice(i, i + groupSize));
            }

            for (let i = 0; i < chunks.length; i++) {
              const group = await prisma.group.create({
                data: { name: `Grupo ${i + 1}`, roundId: round1.id }
              });
              await Promise.all(chunks[i].map((p, index) =>
                prisma.groupParticipant.create({
                  data: { groupId: group.id, participantId: p.id, order: index + 1 }
                })
              ));
            }

            totalGroups += chunks.length;
          }

          res.status(200).json({ 
            message: "Participantes importados correctamente.",
            tournamentId: tournament.id,
            totalParticipants,
            totalGroups
          });
        } catch (e: any) {
          console.error("Parse Error:", e);
          res.status(500).json({ error: "Error interno procesando CSV: " + e.message });
        }
      }
    });

  } catch (error: any) {
    console.error("Error uploadParticipantsUrl:", error);
    res.status(500).json({ error: "Error en servidor al obtener CSV: " + error.message });
  }
};

// ─── Upload Participants from Google Sheets CSV ───

export const uploadParticipants = async (req: Request, res: Response) => {
  try {
    const { participants, groupSize = 4 } = req.body;
    
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: "No participants provided" });
    }

    // 1. Ensure we have an active Tournament
    let tournament = await prisma.tournament.findFirst({ where: { status: "setup" } });
    if (!tournament) {
      tournament = await prisma.tournament.create({
        data: { name: "RNH Live Event", status: "setup" }
      });
      const fixedCategories = ["Mujeres Pro", "Hombres Amateur", "Hombres Pro", "Rollerskate", "Mujeres Amateur", "Junior"];
      for (const catName of fixedCategories) {
        await prisma.category.create({ data: { name: catName, tournamentId: tournament.id, groupSize: 4 } });
      }
    }

    // 2. Group participants by their "Categoria" column
    const participantsByCategory: Record<string, any[]> = {};
    for (const p of participants) {
      const catName = p.Categoria || p.categoria || p.category || "Open";
      if (!participantsByCategory[catName]) participantsByCategory[catName] = [];
      participantsByCategory[catName].push(p);
    }

    let totalGroups = 0;
    let totalParticipants = 0;

    const categories = await prisma.category.findMany({ where: { tournamentId: tournament.id } });

    // 3. Process each Category
    for (const [catName, catParticipants] of Object.entries(participantsByCategory)) {
      let category = categories.find(c => c.name.toLowerCase().trim() === catName.toLowerCase().trim());
      
      if (!category) {
        category = await prisma.category.create({
          data: { name: catName, tournamentId: tournament.id, groupSize }
        });
      }

      const createdParticipants = await Promise.all(
        catParticipants.map(async (p: any) =>
          prisma.participant.create({
            data: {
              name: p.Nombre || p.name || 'Unknown',
              alias: p.Alias || p.alias || null,
              categoryId: category!.id
            }
          })
        )
      );

      totalParticipants += createdParticipants.length;

      // Generate Round 1
      let round1 = await prisma.round.findFirst({ 
        where: { categoryId: category.id, number: 1 } 
      });
      if (!round1) {
        round1 = await prisma.round.create({ data: { number: 1, categoryId: category.id } });
      }

      // Shuffle and chunk
      const shuffled = [...createdParticipants].sort(() => Math.random() - 0.5);
      const chunks = [];
      for (let i = 0; i < shuffled.length; i += groupSize) {
        chunks.push(shuffled.slice(i, i + groupSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        const group = await prisma.group.create({
          data: { name: `Grupo ${i + 1}`, roundId: round1.id }
        });
        await Promise.all(chunks[i].map((p, index) =>
          prisma.groupParticipant.create({
            data: { groupId: group.id, participantId: p.id, order: index + 1 }
          })
        ));
      }

      totalGroups += chunks.length;
    }

    res.status(200).json({ 
      message: "Participantes importados.",
      tournamentId: tournament.id,
      totalParticipants,
      totalGroups
    });
  } catch (error) {
    console.error("Error uploadParticipants:", error);
    res.status(500).json({ error: "Internal Server Error during upload." });
  }
};

// ─── Randomize Groups ───

export const randomizeGroups = async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.categoryId as string;
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return res.status(404).json({ error: "No category found" });

    const round1 = await prisma.round.findFirst({ 
      where: { categoryId: categoryId, number: 1 }, 
      include: { groups: { include: { participants: true } } } 
    }) as any;
    
    if (round1) {
      const participantIds = round1.groups.flatMap((g: any) => g.participants.map((p: any) => p.participantId));
      
      await prisma.groupParticipant.deleteMany({ where: { group: { roundId: round1.id } } });
      await prisma.group.deleteMany({ where: { roundId: round1.id } });
      
      const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
      const chunks: string[][] = [];
      for (let i = 0; i < shuffled.length; i += category.groupSize) {
        chunks.push(shuffled.slice(i, i + category.groupSize));
      }
      
      for (let i = 0; i < chunks.length; i++) {
        const group = await prisma.group.create({
          data: { name: `Grupo ${i + 1}`, roundId: round1.id }
        });
        await Promise.all(chunks[i].map((pid: string, index: number) =>
          prisma.groupParticipant.create({
            data: { groupId: group.id, participantId: pid, order: index + 1 }
          })
        ));
      }
    }
    // Fetch the formed groups with participant names
    const formedGroups = await prisma.group.findMany({
      where: { roundId: round1.id },
      orderBy: { name: 'asc' },
      include: { participants: { include: { participant: true }, orderBy: { order: 'asc' } } }
    });

    const groupsData = formedGroups.map(g => ({
      name: g.name,
      participants: g.participants.map(gp => gp.participant.name)
    }));

    res.status(200).json({ message: "Grupos mezclados aleatoriamente.", groups: groupsData });
  } catch (error) {
    console.error("Error randomizeGroups:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── Get Full Tournament Structure ───

export const getStructure = async (_req: Request, res: Response) => {
  try {
    let tournament: any = await prisma.tournament.findFirst({
      include: {
        judges: true,
        categories: {
          include: {
            participants: true,
            rounds: {
              include: {
                groups: {
                  include: {
                    participants: {
                      include: { participant: true },
                      orderBy: { order: 'asc' }
                    }
                  },
                  orderBy: { name: 'asc' }
                }
              },
              orderBy: { number: 'asc' }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!tournament) {
      const createdTournament = await prisma.tournament.create({
        data: { name: "RNH Live Event", status: "setup" }
      });
      const fixedCategories = ["Mujeres Pro", "Hombres Amateur", "Hombres Pro", "Rollerskate", "Mujeres Amateur", "Junior"];
      for (const catName of fixedCategories) {
        await prisma.category.create({ data: { name: catName, tournamentId: createdTournament.id, groupSize: 4 } });
      }

      tournament = await prisma.tournament.findFirst({
        where: { id: createdTournament.id },
        include: {
          judges: true,
          categories: {
            include: {
              participants: true,
              rounds: { include: { groups: { include: { participants: { include: { participant: true }, orderBy: { order: 'asc' } } }, orderBy: { name: 'asc' } } }, orderBy: { number: 'asc' } }
            }
          }
        }
      });
    }

    res.status(200).json(tournament);
  } catch (error) {
    console.error("Error fetching structure:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── Update Category Config ───

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pasadasCount, groupSize, qualifyCount } = req.body;

    const updated = await prisma.category.update({
      where: { id: id as string },
      data: {
        ...(pasadasCount !== undefined && { pasadasCount }),
        ...(groupSize !== undefined && { groupSize }),
        ...(qualifyCount !== undefined && { qualifyCount })
      }
    });

    if (groupSize !== undefined) {
      const activeRound = await prisma.round.findFirst({ 
        where: { categoryId: updated.id, status: { not: 'completed' } }, 
        orderBy: { number: 'desc' },
        include: { groups: { include: { participants: true } } } 
      }) as any;
      if (activeRound) {
        const participantIds = activeRound.groups.flatMap((g: any) => g.participants.map((p: any) => p.participantId));
        
        await prisma.groupParticipant.deleteMany({ where: { group: { roundId: activeRound.id } } });
        await prisma.group.deleteMany({ where: { roundId: activeRound.id } });
        
        const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
        const chunks: string[][] = [];
        for (let i = 0; i < shuffled.length; i += updated.groupSize) {
          chunks.push(shuffled.slice(i, i + updated.groupSize));
        }
        
        for (let i = 0; i < chunks.length; i++) {
          const group = await prisma.group.create({
            data: { name: `Grupo ${i + 1}`, roundId: activeRound.id }
          });
          await Promise.all(chunks[i].map((pid: string, index: number) =>
            prisma.groupParticipant.create({
              data: { groupId: group.id, participantId: pid, order: index + 1 }
            })
          ));
        }
      }
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updateCategory:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── CRUD Judges ───

export const createJudge = async (req: Request, res: Response) => {
  try {
    const { name, pin, tournamentId } = req.body;
    if (!name || !pin || !tournamentId) {
      return res.status(400).json({ error: "name, pin, and tournamentId are required" });
    }

    const existing = await prisma.judge.findUnique({ where: { pin } });
    if (existing) return res.status(409).json({ error: "PIN already exists" });

    const judge = await prisma.judge.create({
      data: { name, pin, tournamentId }
    });

    res.status(201).json(judge);
  } catch (error) {
    console.error("Error createJudge:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getJudges = async (req: Request, res: Response) => {
  try {
    const tournamentId = req.query.tournamentId as string | undefined;
    const judges = await prisma.judge.findMany({
      where: tournamentId ? { tournamentId } : {},
      include: { tournament: true }
    });
    res.status(200).json(judges);
  } catch (error) {
    console.error("Error getJudges:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const deleteJudge = async (req: Request, res: Response) => {
  try {
    await prisma.judge.delete({ where: { id: req.params.id as string } });
    res.status(200).json({ message: "Judge deleted" });
  } catch (error) {
    console.error("Error deleteJudge:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── Reset Tournament ───

export const resetTournament = async (_req: Request, res: Response) => {
  try {
    // Delete all data in order
    await prisma.score.deleteMany({});
    await prisma.groupParticipant.deleteMany({});
    await prisma.group.deleteMany({});
    await prisma.round.deleteMany({});
    await prisma.participant.deleteMany({});
    await prisma.judge.deleteMany();
    await prisma.category.deleteMany();
    await prisma.tournament.deleteMany();

    await prisma.systemState.upsert({
      where: { id: 'global' },
      update: {
        status: 'setup',
        activeTournamentId: null,
        activeCategoryId: null,
        activeRoundId: null,
        activeGroupId: null,
        activeParticipantId: null,
        activePasadaNumber: 1,
        consensusEndPasada: '[]',
        consensusNextPasada: '[]',
        consensusNextGroup: '[]'
      },
      create: { id: 'global' }
    });

    res.status(200).json({ message: "Tournament reset complete" });
  } catch (error) {
    console.error("Error resetTournament:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const resetCategory = async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.categoryId as string;
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) return res.status(404).json({ error: "No encontrada" });

    // Get rounds and groups for this category
    const rounds = await prisma.round.findMany({ where: { categoryId } });
    const roundIds = rounds.map(r => r.id);

    // Delete scores for this category's rounds
    if (roundIds.length > 0) {
      await prisma.score.deleteMany({ where: { roundId: { in: roundIds } } });
    }

    // Delete group participants and groups
    const groups = await prisma.group.findMany({ where: { roundId: { in: roundIds } } });
    const groupIds = groups.map(g => g.id);
    if (groupIds.length > 0) {
      await prisma.groupParticipant.deleteMany({ where: { groupId: { in: groupIds } } });
      await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
    }

    // Delete rounds
    await prisma.round.deleteMany({ where: { categoryId } });

    // Recreate Round 1 with participants reshuffled
    const participants = await prisma.participant.findMany({ where: { categoryId } });
    if (participants.length > 0) {
      const round1 = await prisma.round.create({ data: { number: 1, categoryId } });
      const shuffled = [...participants].sort(() => Math.random() - 0.5);
      const chunks = [];
      for (let i = 0; i < shuffled.length; i += cat.groupSize) {
        chunks.push(shuffled.slice(i, i + cat.groupSize));
      }
      for (let i = 0; i < chunks.length; i++) {
        const group = await prisma.group.create({
          data: { name: `Grupo ${i + 1}`, roundId: round1.id }
        });
        await Promise.all(chunks[i].map((p, index) =>
          prisma.groupParticipant.create({
            data: { groupId: group.id, participantId: p.id, order: index + 1 }
          })
        ));
      }
    }

    // Reset SystemState if this category was active
    const state = await prisma.systemState.findUnique({ where: { id: 'global' } });
    if (state && state.activeCategoryId === categoryId) {
      await prisma.systemState.update({
        where: { id: 'global' },
        data: {
          status: 'setup',
          activeTournamentId: null,
          activeCategoryId: null,
          activeRoundId: null,
          activeGroupId: null,
          activeParticipantId: null,
          activePasadaNumber: 1,
          consensusEndPasada: '[]',
          consensusNextPasada: '[]',
          consensusNextGroup: '[]'
        }
      });
    }

    res.status(200).json({ message: "Datos de categoría limpiados. Participantes y categoría intactos." });
  } catch (error) {
    console.error("Error resetCategory:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
