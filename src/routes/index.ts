import express from 'express';
import authRouter from './auth.routes';
import catalogRouter from './catalog.routes';
import companiesRouter from './companies.routes';
import ordersRouter from './orders.routes';

const router = express.Router();

router.use('/auth', authRouter);
router.use(catalogRouter);
router.use(companiesRouter);
router.use(ordersRouter);

export default router;
