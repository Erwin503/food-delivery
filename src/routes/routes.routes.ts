import { Router } from 'express';
import {
  assignRouteCompany,
  createRoute,
  deleteRoute,
  getAvailableRouteCompanies,
  getRouteById,
  getRouteCompanies,
  getRoutes,
  removeRouteCompany,
  updateRoute,
} from '../controllers/routes.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { checkRole } from '../middleware/checkRole';

const router = Router();

/**
 * @swagger
 * /routes/available-companies:
 *   get:
 *     summary: List companies that are not assigned to an active route
 *     description: A company can belong to only one active route. Companies whose previous route was archived are available for assignment again.
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Companies available for route assignment
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RouteCompany'
 *       403:
 *         description: Admin access required
 */
router.get(
  '/routes/available-companies',
  authenticateToken,
  checkRole(['admin']),
  getAvailableRouteCompanies
);

/**
 * @swagger
 * components:
 *   schemas:
 *     RouteCompany:
 *       type: object
 *       required:
 *         - id
 *         - name
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: ООО Ромашка
 *     WeeklyRouteSchedule:
 *       type: object
 *       required:
 *         - weekdays
 *         - departureTime
 *         - orderAcceptanceEndsTime
 *         - timeZone
 *       properties:
 *         weekdays:
 *           type: array
 *           minItems: 1
 *           description: ISO weekdays from Monday (1) through Sunday (7). Select all seven for a daily route.
 *           example: [1, 2, 3, 5]
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 7
 *         departureTime:
 *           type: string
 *           pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
 *           example: '13:00'
 *         orderAcceptanceEndsTime:
 *           type: string
 *           pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
 *           description: Must be earlier than departureTime when both times fall on the same day.
 *           example: '11:00'
 *         orderAcceptanceDaysBefore:
 *           type: integer
 *           minimum: 0
 *           maximum: 364635
 *           default: 0
 *           description: Number of business-calendar days before each departure when order acceptance ends.
 *         timeZone:
 *           type: string
 *           readOnly: true
 *           description: Business time zone configured on the server for the schedule.
 *           example: Europe/Moscow
 *     Route:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - departureAt
 *         - orderAcceptanceEndsAt
 *         - schedule
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         departureAt:
 *           type: string
 *           format: date-time
 *           description: Absolute departure for the selected occurrence of the weekly route.
 *         orderAcceptanceEndsAt:
 *           type: string
 *           format: date-time
 *           description: Absolute cutoff for the same occurrence.
 *         schedule:
 *           $ref: '#/components/schemas/WeeklyRouteSchedule'
 *         description:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         companies:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RouteCompany'
 *     CreateRouteRequest:
 *       type: object
 *       description: A company can belong to only one active route.
 *       required:
 *         - name
 *         - schedule
 *       not:
 *         anyOf:
 *           - required: [departureAt]
 *           - required: [orderAcceptanceEndsAt]
 *       properties:
 *         name:
 *           type: string
 *           example: Дневной рейс
 *         schedule:
 *           $ref: '#/components/schemas/WeeklyRouteSchedule'
 *         description:
 *           type: string
 *           nullable: true
 *         companyIds:
 *           type: array
 *           items:
 *             type: integer
 *     UpdateRouteRequest:
 *       type: object
 *       description: Omitting schedule preserves the existing weekly schedule. A supplied schedule replaces it.
 *       not:
 *         anyOf:
 *           - required: [departureAt]
 *           - required: [orderAcceptanceEndsAt]
 *       properties:
 *         name:
 *           type: string
 *         schedule:
 *           $ref: '#/components/schemas/WeeklyRouteSchedule'
 *         description:
 *           type: string
 *           nullable: true
 *         companyIds:
 *           type: array
 *           items:
 *             type: integer
 *     AssignRouteCompanyRequest:
 *       type: object
 *       required:
 *         - companyId
 *       properties:
 *         companyId:
 *           type: integer
 *           example: 1
 */

/**
 * @swagger
 * /routes:
 *   get:
 *     summary: List delivery routes
 *     description: Weekly routes are represented by their first departure on or after dateFrom, or by their next departure if dateFrom is omitted. dateTo is an inclusive upper bound.
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Routes list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Route'
 *       400:
 *         description: Invalid filter date or a year outside the range 1000 through 9999
 */
router.get('/routes', authenticateToken, checkRole(['admin']), getRoutes);

/**
 * @swagger
 * /routes/{id}:
 *   get:
 *     summary: Get one route with assigned companies
 *     description: A weekly route includes the absolute times for its next departure.
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Route details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Route'
 */
router.get('/routes/:id', authenticateToken, checkRole(['admin']), getRouteById);

/**
 * @swagger
 * /routes:
 *   post:
 *     summary: Create a new delivery route
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRouteRequest'
 *     responses:
 *       201:
 *         description: Route created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Route'
 *       400:
 *         description: Missing or invalid route schedule or unsupported absolute route times
 *       409:
 *         description: One or more companies are already assigned to another route
 */
router.post('/routes', authenticateToken, checkRole(['admin']), createRoute);

/**
 * @swagger
 * /routes/{id}:
 *   put:
 *     summary: Update route fields and assigned companies
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRouteRequest'
 *     responses:
 *       200:
 *         description: Updated route
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Route'
 *       400:
 *         description: Missing or invalid route schedule or unsupported absolute route times
 *       409:
 *         description: One or more companies are already assigned to another route
 */
router.put('/routes/:id', authenticateToken, checkRole(['admin']), updateRoute);

/**
 * @swagger
 * /routes/{id}:
 *   delete:
 *     summary: Soft-delete route
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Route deleted
 */
router.delete('/routes/:id', authenticateToken, checkRole(['admin']), deleteRoute);

/**
 * @swagger
 * /routes/{id}/companies:
 *   get:
 *     summary: List companies assigned to a route
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Assigned companies
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RouteCompany'
 */
router.get('/routes/:id/companies', authenticateToken, checkRole(['admin']), getRouteCompanies);

/**
 * @swagger
 * /routes/{id}/companies:
 *   post:
 *     summary: Assign an available company to a route
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignRouteCompanyRequest'
 *     responses:
 *       200:
 *         description: Updated assigned companies
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RouteCompany'
 *       409:
 *         description: The company is already assigned to another route
 */
router.post('/routes/:id/companies', authenticateToken, checkRole(['admin']), assignRouteCompany);

/**
 * @swagger
 * /routes/{id}/companies/{companyId}:
 *   delete:
 *     summary: Remove a company from a route
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Company removed from route
 */
router.delete('/routes/:id/companies/:companyId', authenticateToken, checkRole(['admin']), removeRouteCompany);

export default router;
