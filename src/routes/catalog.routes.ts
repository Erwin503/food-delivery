import { Router } from 'express';
import {
  createCategory,
  createDish,
  deleteCategory,
  deleteDish,
  getCategories,
  getCategoryById,
  getDishes,
  getDishesByCategory,
  getDishById,
  updateCategory,
  updateDish,
} from '../controllers/catalog.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { checkRole } from '../middleware/checkRole';
import { catalogImageUpload } from '../middleware/uploadMiddleware';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Category:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - sortOrder
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Pizza
 *         sortOrder:
 *           type: integer
 *           example: 10
 *         imageUrl:
 *           type: string
 *           nullable: true
 *           example: /uploads/catalog/1712345678901-file.png
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     Dish:
 *       type: object
 *       required:
 *         - id
 *         - categoryId
 *         - name
 *         - priceCents
 *         - isActive
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         categoryId:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Margherita
 *         description:
 *           type: string
 *           nullable: true
 *           example: Tomato sauce, mozzarella, basil.
 *         imageUrl:
 *           type: string
 *           nullable: true
 *           example: /uploads/catalog/1712345678901-file.png
 *         basePriceCents:
 *           type: integer
 *           example: 59900
 *         discountPriceCents:
 *           type: integer
 *           example: 53900
 *         priceCents:
 *           type: integer
 *           example: 59900
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateCategoryRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           example: Soups
 *         sortOrder:
 *           type: integer
 *           example: 40
 *         image:
 *           type: string
 *           format: binary
 *     UpdateCategoryRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: Hot soups
 *         sortOrder:
 *           type: integer
 *           example: 50
 *         image:
 *           type: string
 *           format: binary
 *     CreateDishRequest:
 *       type: object
 *       required:
 *         - categoryId
 *         - name
 *         - basePriceCents
 *         - discountPriceCents
 *       properties:
 *         categoryId:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Four cheeses
 *         description:
 *           type: string
 *           nullable: true
 *         image:
 *           type: string
 *           format: binary
 *         basePriceCents:
 *           type: integer
 *           example: 79900
 *         discountPriceCents:
 *           type: integer
 *           example: 69900
 *         isActive:
 *           type: boolean
 *           example: true
 *     UpdateDishRequest:
 *       type: object
 *       properties:
 *         categoryId:
 *           type: integer
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         image:
 *           type: string
 *           format: binary
 *         basePriceCents:
 *           type: integer
 *         discountPriceCents:
 *           type: integer
 *         isActive:
 *           type: boolean
 */

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Get sorted categories list
 *     tags: [Catalog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Category'
 *   post:
 *     summary: Create a category
 *     tags: [Catalog]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/CreateCategoryRequest'
 *     responses:
 *       201:
 *         description: Category created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Category'
 *       403:
 *         description: Forbidden
 */
router.get('/categories', authenticateToken, getCategories);
router.post('/categories', authenticateToken, checkRole(['manager', 'admin']), catalogImageUpload.single('image'), createCategory);

/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     summary: Get category by id
 *     tags: [Catalog]
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
 *         description: Category details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Category'
 *       404:
 *         description: Category not found
 *   put:
 *     summary: Partially update a category
 *     tags: [Catalog]
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
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCategoryRequest'
 *     responses:
 *       200:
 *         description: Category updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Category'
 *       403:
 *         description: Forbidden
 *   delete:
 *     summary: Archive a category and its dishes
 *     tags: [Catalog]
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
 *         description: Category archived
 *       403:
 *         description: Forbidden
 */
router.get('/categories/:id', authenticateToken, getCategoryById);
router.put('/categories/:id', authenticateToken, checkRole(['manager', 'admin']), catalogImageUpload.single('image'), updateCategory);
router.delete('/categories/:id', authenticateToken, checkRole(['manager', 'admin']), deleteCategory);

/**
 * @swagger
 * /categories/{id}/dishes:
 *   get:
 *     summary: Get dishes for a category
 *     tags: [Catalog]
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
 *         description: Dishes in category
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Dish'
 */
router.get('/categories/:id/dishes', authenticateToken, getDishesByCategory);

/**
 * @swagger
 * /dishes:
 *   get:
 *     summary: Get dishes list with optional filters
 *     tags: [Catalog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Dishes list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Dish'
 *   post:
 *     summary: Create a dish
 *     tags: [Catalog]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/CreateDishRequest'
 *     responses:
 *       201:
 *         description: Dish created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dish'
 *       403:
 *         description: Forbidden
 */
router.get('/dishes', authenticateToken, getDishes);
router.post('/dishes', authenticateToken, checkRole(['manager', 'admin']), catalogImageUpload.single('image'), createDish);

/**
 * @swagger
 * /dishes/{id}:
 *   get:
 *     summary: Get dish by id
 *     tags: [Catalog]
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
 *         description: Dish details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dish'
 *       404:
 *         description: Dish not found
 *   put:
 *     summary: Partially update a dish
 *     tags: [Catalog]
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
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/UpdateDishRequest'
 *     responses:
 *       200:
 *         description: Dish updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dish'
 *       403:
 *         description: Forbidden
 *   delete:
 *     summary: Archive a dish
 *     tags: [Catalog]
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
 *         description: Dish archived
 *       403:
 *         description: Forbidden
 */
router.get('/dishes/:id', authenticateToken, getDishById);
router.put('/dishes/:id', authenticateToken, checkRole(['manager', 'admin']), catalogImageUpload.single('image'), updateDish);
router.delete('/dishes/:id', authenticateToken, checkRole(['manager', 'admin']), deleteDish);

export default router;
