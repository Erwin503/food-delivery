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
 *   parameters:
 *     ReportDate:
 *       in: query
 *       name: date
 *       description: Дата отчёта в BUSINESS_TIME_ZONE (по умолчанию сегодня). Учитываются заказы с сохранённым выездом в эту дату, оформленные строго после последнего выезда накануне по расписанию (либо с полуночи, если рейсов не было) и до сохранённого для заказа срока приёма. Отменённые заказы и заказы удалённых сотрудников и компаний исключаются.
 *       schema:
 *         type: string
 *         format: date
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
 *     summary: Скачать PDF по заказам за выбранную дату, сгруппированным по рейсам и компаниям
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReportDate'
 *     responses:
 *       400:
 *         description: Некорректная дата отчёта
 *       200:
 *         description: PDF-файл с таблицей заказов за выбранную дату
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
 *     summary: Скачать PDF-сводку блюд за выбранную дату
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReportDate'
 *     responses:
 *       400:
 *         description: Некорректная дата отчёта
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
 *     summary: Скачать PDF с наклейками для заказов за выбранную дату
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReportDate'
 *     responses:
 *       400:
 *         description: Некорректная дата отчёта
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
