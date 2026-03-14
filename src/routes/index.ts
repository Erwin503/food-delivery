import express from 'express';
import authRouter from './auth.routes';
import catalogRouter from './catalog.routes';

const router = express.Router();

router.use('/auth', authRouter);
router.use(catalogRouter);

export default router;
