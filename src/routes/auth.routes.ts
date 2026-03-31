import { Router } from 'express';
import {
  confirmSignup,
  confirmPasswordReset,
  deleteProfile,
  getAllUsers,
  getProfile,
  loginStep1,
  loginStep2,
  passwordLogin,
  promoteUser,
  requestPasswordReset,
  setPassword,
  signup,
  updateProfile,
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { checkRole } from '../middleware/checkRole';
import { avatarImageUpload } from '../middleware/uploadMiddleware';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - id
 *         - email
 *         - role
 *         - companyId
 *         - orderLimitCents
 *         - debtCents
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: integer
 *           example: 4
 *         email:
 *           type: string
 *           format: email
 *           example: employee.ivanov@cook.local
 *         role:
 *           type: string
 *           enum: [employee, manager, admin]
 *           example: employee
 *         companyId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         fullName:
 *           type: string
 *           nullable: true
 *           example: Ivan Ivanov
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+79990000004"
 *         avatarUrl:
 *           type: string
 *           nullable: true
 *           example: https://example.com/avatar.png
 *         orderLimitCents:
 *           type: integer
 *           example: 150000
 *         debtCents:
 *           type: integer
 *           example: 25900
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     AuthTokenResponse:
 *       type: object
 *       required:
 *         - token
 *         - user
 *       properties:
 *         token:
 *           type: string
 *           example: JWT_TOKEN
 *         user:
 *           $ref: '#/components/schemas/User'
 *     LoginStep1Request:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: employee.ivanov@cook.local
 *     LoginStep1Response:
 *       type: object
 *       required:
 *         - ok
 *         - expiresInSeconds
 *       properties:
 *         ok:
 *           type: boolean
 *           example: true
 *         expiresInSeconds:
 *           type: integer
 *           example: 300
 *     LoginStep2Request:
 *       type: object
 *       required:
 *         - email
 *         - code
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         code:
 *           type: string
 *           example: "123456"
 *     PasswordLoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           format: password
 *           example: Password123!
 *     UpdateProfileRequest:
 *       type: object
 *       properties:
 *         fullName:
 *           type: string
 *           nullable: true
 *         phone:
 *           type: string
 *           nullable: true
 *         avatar:
 *           type: string
 *           format: binary
 *     UpdateProfileMultipartRequest:
 *       type: object
 *       properties:
 *         fullName:
 *           type: string
 *           nullable: true
 *         phone:
 *           type: string
 *           nullable: true
 *         avatar:
 *           type: string
 *           format: binary
 *     SetPasswordRequest:
 *       type: object
 *       required:
 *         - newPassword
 *       properties:
 *         currentPassword:
 *           type: string
 *           format: password
 *           nullable: true
 *         newPassword:
 *           type: string
 *           format: password
 *           example: NewPassword123!
 *     PasswordResetRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *     PasswordResetConfirmRequest:
 *       type: object
 *       required:
 *         - email
 *         - code
 *         - newPassword
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         code:
 *           type: string
 *           example: "111222"
 *         newPassword:
 *           type: string
 *           format: password
 *           example: Recovered123!
 *     PromoteUserRequest:
 *       type: object
 *       required:
 *         - userId
 *         - role
 *       properties:
 *         userId:
 *           type: integer
 *           example: 4
 *         role:
 *           type: string
 *           enum: [employee, manager, admin]
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: error
 *         message:
 *           type: string
 *           example: Invalid email or password
 *     SignupRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           format: password
 *           example: Password123!
 *     SignupConfirmRequest:
 *       type: object
 *       required:
 *         - email
 *         - code
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         code:
 *           type: string
 *           example: "654321"
 */

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Create account with the same credentials used for password login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *     responses:
 *       201:
 *         description: Signup created, verification code sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginStep1Response'
 *       409:
 *         description: User already exists
 */
router.post('/signup', signup);

/**
 * @swagger
 * /auth/signup/confirm:
 *   post:
 *     summary: Confirm signup email and get JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupConfirmRequest'
 *     responses:
 *       200:
 *         description: Email confirmed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokenResponse'
 *       401:
 *         description: Invalid or expired verification code
 */
router.post('/signup/confirm', confirmSignup);

/**
 * @swagger
 * /auth/login/step1:
 *   post:
 *     summary: Request a one-time login code by email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginStep1Request'
 *     responses:
 *       200:
 *         description: Login code created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginStep1Response'
 */
router.post('/login/step1', loginStep1);

/**
 * @swagger
 * /auth/login/step2:
 *   post:
 *     summary: Confirm one-time login code and get JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginStep2Request'
 *     responses:
 *       200:
 *         description: Authenticated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokenResponse'
 *       401:
 *         description: Invalid or expired code
 */
router.post('/login/step2', loginStep2);

/**
 * @swagger
 * /auth/login/password:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordLoginRequest'
 *     responses:
 *       200:
 *         description: Authenticated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokenResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login/password', passwordLogin);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Missing token
 */
router.get('/profile', authenticateToken, getProfile);

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     summary: Update current user profile and optionally upload avatar
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileMultipartRequest'
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.put('/profile', authenticateToken, avatarImageUpload.single('avatar'), updateProfile);

/**
 * @swagger
 * /auth/profile:
 *   delete:
 *     summary: Soft-delete current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Profile deleted
 */
router.delete('/profile', authenticateToken, deleteProfile);

/**
 * @swagger
 * /auth/password:
 *   put:
 *     summary: Set or change current user password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Current password is incorrect
 */
router.put('/password', authenticateToken, setPassword);

/**
 * @swagger
 * /auth/password/reset/request:
 *   post:
 *     summary: Request a password reset code by email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetRequest'
 *     responses:
 *       200:
 *         description: Reset code requested
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginStep1Response'
 */
router.post('/password/reset/request', requestPasswordReset);

/**
 * @swagger
 * /auth/password/reset/confirm:
 *   post:
 *     summary: Confirm password reset code and set a new password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetConfirmRequest'
 *     responses:
 *       200:
 *         description: Password reset completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokenResponse'
 *       401:
 *         description: Invalid or expired reset code
 */
router.post('/password/reset/confirm', confirmPasswordReset);

/**
 * @swagger
 * /auth/promote:
 *   post:
 *     summary: Change user role
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PromoteUserRequest'
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       403:
 *         description: Forbidden
 */
router.post('/promote', authenticateToken, checkRole(['admin']), promoteUser);

/**
 * @swagger
 * /auth/all:
 *   get:
 *     summary: List all active users
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       403:
 *         description: Forbidden
 */
router.get('/all', authenticateToken, checkRole(['admin']), getAllUsers);

export default router;
