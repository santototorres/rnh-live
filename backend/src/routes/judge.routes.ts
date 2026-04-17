import { Router } from 'express';
import { loginJudge } from '../controllers/judge.controller';

const router = Router();

router.post('/login', loginJudge);

export default router;
