import express from 'express';
import authRouter from './auth.routes';
import catalogRouter from './catalog.routes';
import companiesRouter from './companies.routes';
import ordersRouter from './orders.routes';
import reportsRouter from './reports.routes';
import routesRouter from './routes.routes';

const router = express.Router();

router.use('/auth', authRouter);
router.use(catalogRouter);
router.use(companiesRouter);
router.use(ordersRouter);
router.use(reportsRouter);
router.use(routesRouter);

export default router;
