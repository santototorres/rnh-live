import { Router } from 'express';
import { uploadParticipants } from '../controllers/admin.controller';

const router = Router();

router.post('/upload', uploadParticipants);

export default router;
