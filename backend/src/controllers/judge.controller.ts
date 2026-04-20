import { Request, Response } from 'express';
import prisma from '../db';

export const loginJudge = async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    
    if (!pin) {
      return res.status(400).json({ error: "PIN requerido" });
    }

    const judge = await prisma.judge.findUnique({
      where: { pin },
      include: { tournament: true }
    });

    if (!judge) {
      return res.status(401).json({ error: "PIN no encontrado. Contacta al administrador." });
    }

    res.status(200).json({ 
      id: judge.id,
      name: judge.name,
      pin: judge.pin,
      tournamentId: judge.tournamentId
    });

  } catch (error: any) {
    console.error("Judge login error:", error);
    res.status(500).json({ error: "Internal Server Error", detail: error.message });
  }
};
