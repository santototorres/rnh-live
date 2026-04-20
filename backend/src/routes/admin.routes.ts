import { Router } from 'express';
import {
  uploadParticipants,
  getStructure,
  updateCategory,
  createJudge,
  getJudges,
  deleteJudge,
  resetTournament,
  randomizeGroups
} from '../controllers/admin.controller';

const router = Router();

router.post('/upload', uploadParticipants);
router.get('/structure', getStructure);
router.put('/category/:id', updateCategory);
router.post('/judges', createJudge);
router.get('/judges', getJudges);
router.delete('/judges/:id', deleteJudge);
router.post('/category/:categoryId/randomize', randomizeGroups);
router.post('/reset', resetTournament);

export default router;
