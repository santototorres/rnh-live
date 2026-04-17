"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginJudge = void 0;
const db_1 = __importDefault(require("../db"));
const loginJudge = async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin) {
            return res.status(400).json({ error: "PIN requerido" });
        }
        const judge = await db_1.default.judge.findUnique({
            where: { pin },
            include: { category: true }
        });
        if (!judge) {
            return res.status(401).json({ error: "PIN no encontrado. Contacta al administrador." });
        }
        res.status(200).json({
            id: judge.id,
            name: judge.name,
            pin: judge.pin,
            categoryId: judge.categoryId,
            categoryName: judge.category.name
        });
    }
    catch (error) {
        console.error("Judge login error:", error);
        res.status(500).json({ error: "Internal Server Error", detail: error.message });
    }
};
exports.loginJudge = loginJudge;
