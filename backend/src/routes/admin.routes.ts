import { Router } from 'express';
import {
  uploadParticipants,
  getStructure,
  updateCategory,
  createJudge,
  getJudges,
  deleteJudge,
  resetTournament
} from '../controllers/admin.controller';

const router = Router();

router.post('/upload', uploadParticipants);
router.get('/structure', getStructure);
router.put('/category/:id', updateCategory);
router.post('/judges', createJudge);
router.get('/judges', getJudges);
router.delete('/judges/:id', deleteJudge);
router.post('/reset', resetTournament);

export default router;
