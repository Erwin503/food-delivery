import { Router } from 'express';
import {
  downloadTodayDishesReport,
  downloadTodayLabelsReport,
  downloadTodayOrdersReport,
  runTodayReportsTestRequest,
} from '../controllers/reports.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { checkRole } from '../middleware/checkRole';

const router = Router();

/**
 * @swagger
 * components:
 *   headers:
 *     ReportDay:
 *       description: Календарный день отчёта в BUSINESS_TIME_ZONE (по умолчанию Europe/Moscow).
 *       schema:
 *         type: string
 *         format: date
 *     ReportValidForMs:
 *       description: Миллисекунды от отправки ответа до окончания дня отчёта. Ноль означает, что день уже закончился.
 *       schema:
 *         type: integer
 *         minimum: 0
 */

/**
 * @swagger
 * /reports/orders/today.pdf:
 *   get:
 *     summary: Скачать PDF-отчёт по сегодняшним заказам, сгруппированным по компаниям
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF-файл с таблицей заказов на сегодня
 *         headers:
 *           X-Report-Day:
 *             $ref: '#/components/headers/ReportDay'
 *           X-Report-Valid-For-Ms:
 *             $ref: '#/components/headers/ReportValidForMs'
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Доступно только администратору
 */
router.get('/reports/orders/today.pdf', authenticateToken, checkRole(['admin']), downloadTodayOrdersReport);

/**
 * @swagger
 * /reports/dishes/today.pdf:
 *   get:
 *     summary: Скачать PDF-сводку заказанных на сегодня блюд
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF-файл со списком блюд и итоговыми количествами
 *         headers:
 *           X-Report-Day:
 *             $ref: '#/components/headers/ReportDay'
 *           X-Report-Valid-For-Ms:
 *             $ref: '#/components/headers/ReportValidForMs'
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Доступно только администратору
 */
router.get('/reports/dishes/today.pdf', authenticateToken, checkRole(['admin']), downloadTodayDishesReport);

/**
 * @swagger
 * /reports/labels/today.pdf:
 *   get:
 *     summary: Скачать PDF с карточками-наклейками по каждому заказу на сегодня
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF-файл с компактными карточками для печати и нарезки
 *         headers:
 *           X-Report-Day:
 *             $ref: '#/components/headers/ReportDay'
 *           X-Report-Valid-For-Ms:
 *             $ref: '#/components/headers/ReportValidForMs'
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Доступно только администратору
 */
router.get('/reports/labels/today.pdf', authenticateToken, checkRole(['admin']), downloadTodayLabelsReport);

/**
 * @swagger
 * /reports/test-run/today:
 *   post:
 *     summary: Скачать архив с тремя PDF на демонстрационных данных
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ZIP-архив с файлами orders-today.pdf, dishes-today.pdf и labels-today.pdf
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Доступно только администратору
 */
router.post('/reports/test-run/today', authenticateToken, checkRole(['admin']), runTodayReportsTestRequest);

export default router;
