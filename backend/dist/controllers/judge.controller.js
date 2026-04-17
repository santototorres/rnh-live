"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginJudge = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const loginJudge = async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin) {
            return res.status(400).json({ error: "PIN requerido" });
        }
        let judge = await prisma.judge.findUnique({ where: { pin } });
        // HACK: Auto-create judge for testing if PIN doesn't exist, using the first category available
        if (!judge) {
            const firstCategory = await prisma.category.findFirst();
            if (!firstCategory)
                return res.status(400).json({ error: "No hay categorías creadas aún." });
            judge = await prisma.judge.create({
                data: {
                    name: `Juez ${pin}`,
                    pin,
                    categoryId: firstCategory.id
                }
            });
        }
        res.status(200).json({
            id: judge.id,
            name: judge.name,
            categoryId: judge.categoryId
        });
    }
    catch (error) {
        console.error("Error loginJudge:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.loginJudge = loginJudge;
