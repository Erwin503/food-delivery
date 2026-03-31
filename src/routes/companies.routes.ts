import { Router } from 'express';
import {
  acceptCompanyUserDebtPayment,
  assignCompanyUser,
  createCompany,
  createCompanyJoinCode,
  deleteCompany,
  getCompanies,
  getCompanyById,
  getCompanyManager,
  getCompanyUsers,
  joinCompanyByCode,
  purchaseCompanySubscription,
  removeCompanyUser,
  setCompanyUserLimit,
  setCompanyManager,
  updateCompany,
} from '../controllers/companies.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { checkRole } from '../middleware/checkRole';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Company:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - debtCents
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         address:
 *           type: string
 *           nullable: true
 *         debtCents:
 *           type: integer
 *         subscriptionStartedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         subscriptionExpiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         hasActiveSubscription:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateCompanyRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         address:
 *           type: string
 *           nullable: true
 *     UpdateCompanyRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         address:
 *           type: string
 *           nullable: true
 *     AssignCompanyUserRequest:
 *       type: object
 *       properties:
 *         userId:
 *           type: integer
 *         email:
 *           type: string
 *           format: email
 *     AssignManagerRequest:
 *       type: object
 *       required:
 *         - userId
 *       properties:
 *         userId:
 *           type: integer
 *     UpdateUserLimitRequest:
 *       type: object
 *       required:
 *         - orderLimitCents
 *       properties:
 *         orderLimitCents:
 *           type: integer
 *           minimum: 0
 *     AcceptDebtPaymentRequest:
 *       type: object
 *       required:
 *         - amountCents
 *       properties:
 *         amountCents:
 *           type: integer
 *           minimum: 1
 *     CompanyJoinCodeResponse:
 *       type: object
 *       required:
 *         - code
 *         - expiresInSeconds
 *       properties:
 *         code:
 *           type: string
 *         expiresInSeconds:
 *           type: integer
 *     JoinCompanyRequest:
 *       type: object
 *       required:
 *         - code
 *       properties:
 *         code:
 *           type: string
 *     CompanySubscriptionResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/Company'
 */

/**
 * @swagger
 * /companies:
 *   get:
 *     summary: Get visible companies for the current user
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Companies list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Company'
 *   post:
 *     summary: Create a company
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCompanyRequest'
 *     responses:
 *       201:
 *         description: Company created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
 */
router.get('/companies', authenticateToken, checkRole(['admin', 'manager']), getCompanies);
router.post('/companies', authenticateToken, checkRole(['admin']), createCompany);

/**
 * @swagger
 * /companies/join:
 *   post:
 *     summary: Join a company using a short code
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/JoinCompanyRequest'
 *     responses:
 *       200:
 *         description: User joined the company
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid or expired code
 */
router.post('/companies/join', authenticateToken, checkRole(['employee']), joinCompanyByCode);

/**
 * @swagger
 * /companies/{id}:
 *   get:
 *     summary: Get company by id
 *     tags: [Companies]
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
 *         description: Company details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
 *   put:
 *     summary: Update company
 *     tags: [Companies]
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
 *             $ref: '#/components/schemas/UpdateCompanyRequest'
 *     responses:
 *       200:
 *         description: Company updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
 *   delete:
 *     summary: Archive company
 *     tags: [Companies]
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
 *         description: Company archived
 */
router.get('/companies/:id', authenticateToken, checkRole(['admin', 'manager']), getCompanyById);
router.put('/companies/:id', authenticateToken, checkRole(['admin', 'manager']), updateCompany);
router.delete('/companies/:id', authenticateToken, checkRole(['admin']), deleteCompany);

/**
 * @swagger
 * /companies/{id}/users:
 *   get:
 *     summary: Get company users
 *     tags: [Companies]
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
 *         description: Company users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *   post:
 *     summary: Assign user to company by email or id
 *     tags: [Companies]
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
 *             $ref: '#/components/schemas/AssignCompanyUserRequest'
 *     responses:
 *       200:
 *         description: User assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.get('/companies/:id/users', authenticateToken, checkRole(['admin', 'manager']), getCompanyUsers);
router.post('/companies/:id/users', authenticateToken, checkRole(['admin']), assignCompanyUser);

/**
 * @swagger
 * /companies/{id}/users/{userId}/limit:
 *   put:
 *     summary: Set order limit for a company member
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserLimitRequest'
 *     responses:
 *       200:
 *         description: Updated user with new order limit
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.put('/companies/:id/users/:userId/limit', authenticateToken, checkRole(['admin', 'manager']), setCompanyUserLimit);

/**
 * @swagger
 * /companies/{id}/users/{userId}/debt-payment:
 *   post:
 *     summary: Accept debt payment from a company member
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AcceptDebtPaymentRequest'
 *     responses:
 *       200:
 *         description: Updated user after debt payment
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.post('/companies/:id/users/:userId/debt-payment', authenticateToken, checkRole(['admin']), acceptCompanyUserDebtPayment);

/**
 * @swagger
 * /companies/{id}/users/{userId}:
 *   delete:
 *     summary: Remove user from company
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: User removed from company
 */
router.delete('/companies/:id/users/:userId', authenticateToken, checkRole(['admin', 'manager']), removeCompanyUser);

/**
 * @swagger
 * /companies/{id}/manager:
 *   get:
 *     summary: Get company manager
 *     tags: [Companies]
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
 *         description: Manager or null
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/User'
 *                 - type: 'null'
 *   put:
 *     summary: Assign company manager
 *     tags: [Companies]
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
 *             $ref: '#/components/schemas/AssignManagerRequest'
 *     responses:
 *       200:
 *         description: Assigned manager
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.get('/companies/:id/manager', authenticateToken, checkRole(['admin', 'manager']), getCompanyManager);
router.put('/companies/:id/manager', authenticateToken, checkRole(['admin', 'manager']), setCompanyManager);

/**
 * @swagger
 * /companies/{id}/subscription:
 *   post:
 *     summary: Purchase or extend company subscription for one month
 *     tags: [Companies]
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
 *         description: Subscription updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompanySubscriptionResponse'
 */
router.post('/companies/:id/subscription', authenticateToken, checkRole(['admin', 'manager']), purchaseCompanySubscription);

/**
 * @swagger
 * /companies/{id}/join-code:
 *   post:
 *     summary: Generate a short code for joining the company
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       201:
 *         description: Join code generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompanyJoinCodeResponse'
 */
router.post('/companies/:id/join-code', authenticateToken, checkRole(['admin', 'manager']), createCompanyJoinCode);

export default router;
