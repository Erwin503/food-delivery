import { Router } from 'express';
import {
  assignRouteCompany,
  createRoute,
  deleteRoute,
  getRouteById,
  getRouteCompanies,
  getRoutes,
  removeRouteCompany,
  updateRoute,
} from '../controllers/routes.controller';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

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
 *     Route:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - departureAt
 *         - orderAcceptanceEndsAt
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
 *         orderAcceptanceEndsAt:
 *           type: string
 *           format: date-time
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
 *       required:
 *         - name
 *         - departureAt
 *         - orderAcceptanceEndsAt
 *       properties:
 *         name:
 *           type: string
 *           example: Дневной рейс
 *         departureAt:
 *           type: string
 *           format: date-time
 *         orderAcceptanceEndsAt:
 *           type: string
 *           format: date-time
 *         description:
 *           type: string
 *           nullable: true
 *         companyIds:
 *           type: array
 *           items:
 *             type: integer
 *     UpdateRouteRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         departureAt:
 *           type: string
 *           format: date-time
 *         orderAcceptanceEndsAt:
 *           type: string
 *           format: date-time
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
 */
router.get('/routes', authenticateToken, getRoutes);

/**
 * @swagger
 * /routes/{id}:
 *   get:
 *     summary: Get one route with assigned companies
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
router.get('/routes/:id', authenticateToken, getRouteById);

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
 */
router.post('/routes', authenticateToken, createRoute);

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
 */
router.put('/routes/:id', authenticateToken, updateRoute);

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
router.delete('/routes/:id', authenticateToken, deleteRoute);

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
router.get('/routes/:id/companies', authenticateToken, getRouteCompanies);

/**
 * @swagger
 * /routes/{id}/companies:
 *   post:
 *     summary: Assign a company to a route
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
 */
router.post('/routes/:id/companies', authenticateToken, assignRouteCompany);

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
router.delete('/routes/:id/companies/:companyId', authenticateToken, removeRouteCompany);

export default router;
