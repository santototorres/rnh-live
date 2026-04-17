"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const router = (0, express_1.Router)();
router.post('/upload', admin_controller_1.uploadParticipants);
router.get('/structure', admin_controller_1.getStructure);
exports.default = router;
