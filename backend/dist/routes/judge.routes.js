"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const judge_controller_1 = require("../controllers/judge.controller");
const router = (0, express_1.Router)();
router.post('/login', judge_controller_1.loginJudge);
exports.default = router;
