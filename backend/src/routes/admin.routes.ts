import { Router } from 'express';
import { uploadParticipants, getStructure } from '../controllers/admin.controller';

const router = Router();

router.post('/upload', uploadParticipants);
router.get('/structure', getStructure);

export default router;
