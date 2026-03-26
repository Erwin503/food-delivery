import { Router } from 'express';
import {
  addOrderDish,
  cancelOrder,
  createOrder,
  getOrderById,
  getOrders,
  patchOrderStatus,
  removeOrderDish,
  updateOrder,
  updateOrderDish,
} from '../controllers/orders.controller';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderItem:
 *       type: object
 *       required:
 *         - dishId
 *         - qty
 *         - priceCents
 *         - lineTotalCents
 *       properties:
 *         dishId:
 *           type: integer
 *         qty:
 *           type: integer
 *         priceCents:
 *           type: integer
 *         lineTotalCents:
 *           type: integer
 *     Order:
 *       type: object
 *       required:
 *         - id
 *         - orderNumber
 *         - userId
 *         - companyId
 *         - routeId
 *         - status
 *         - subtotalCents
 *         - deliveryFeeCents
 *         - discountCents
 *         - totalCents
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: integer
 *         orderNumber:
 *           type: string
 *           nullable: true
 *         userId:
 *           type: integer
 *         companyId:
 *           type: integer
 *         routeId:
 *           type: integer
 *         status:
 *           type: string
 *           enum: [created, paid, cooking, delivering, completed, cancelled]
 *         subtotalCents:
 *           type: integer
 *         deliveryFeeCents:
 *           type: integer
 *         discountCents:
 *           type: integer
 *         totalCents:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 *     CreateOrderRequest:
 *       type: object
 *       properties:
 *         deliveryFeeCents:
 *           type: integer
 *           example: 1000
 *         discountCents:
 *           type: integer
 *           example: 200
 *     UpdateOrderRequest:
 *       type: object
 *       properties:
 *         deliveryFeeCents:
 *           type: integer
 *         discountCents:
 *           type: integer
 *     OrderDishRequest:
 *       type: object
 *       required:
 *         - dishId
 *         - qty
 *       properties:
 *         dishId:
 *           type: integer
 *           example: 4
 *         qty:
 *           type: integer
 *           minimum: 1
 *           example: 2
 *     OrderStatusRequest:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: [paid, cooking, delivering, completed, cancelled]
 *           example: paid
 */

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: List orders visible to the current admin or manager
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [created, paid, cooking, delivering, completed, cancelled]
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: routeId
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Orders list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 *       403:
 *         description: Forbidden
 */
router.get('/orders', authenticateToken, getOrders);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get one order with items
 *     tags: [Orders]
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
 *         description: Order details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 */
router.get('/orders/:id', authenticateToken, getOrderById);

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Create a new order draft for the current employee or manager
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *     responses:
 *       201:
 *         description: Order created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       403:
 *         description: Only employees or managers can create orders
 */
router.post('/orders', authenticateToken, createOrder);

/**
 * @swagger
 * /orders/{id}:
 *   put:
 *     summary: Update order meta fields
 *     tags: [Orders]
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
 *             $ref: '#/components/schemas/UpdateOrderRequest'
 *     responses:
 *       200:
 *         description: Updated order
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       409:
 *         description: Order cannot be updated in the current status
 */
router.put('/orders/:id', authenticateToken, updateOrder);

/**
 * @swagger
 * /orders/{id}:
 *   delete:
 *     summary: Cancel an order before route acceptance closes
 *     tags: [Orders]
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
 *         description: Order cancelled
 *       409:
 *         description: Order cannot be cancelled in the current route or status
 */
router.delete('/orders/:id', authenticateToken, cancelOrder);

/**
 * @swagger
 * /orders/{id}/dishes:
 *   post:
 *     summary: Add a dish to an order
 *     tags: [Orders]
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
 *             $ref: '#/components/schemas/OrderDishRequest'
 *     responses:
 *       200:
 *         description: Updated order with items
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       409:
 *         description: Only created orders can be edited
 */
router.post('/orders/:id/dishes', authenticateToken, addOrderDish);

/**
 * @swagger
 * /orders/{id}/dishes:
 *   put:
 *     summary: Update quantity of a dish in an order
 *     tags: [Orders]
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
 *             $ref: '#/components/schemas/OrderDishRequest'
 *     responses:
 *       200:
 *         description: Updated order with items
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order item not found
 */
router.put('/orders/:id/dishes', authenticateToken, updateOrderDish);

/**
 * @swagger
 * /orders/{id}/dishes/{dishId}:
 *   delete:
 *     summary: Remove a dish from an order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: dishId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Order item removed
 *       404:
 *         description: Order item not found
 */
router.delete('/orders/:id/dishes/:dishId', authenticateToken, removeOrderDish);

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     summary: Change order status
 *     tags: [Orders]
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
 *             $ref: '#/components/schemas/OrderStatusRequest'
 *     responses:
 *       200:
 *         description: Updated order
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       409:
 *         description: Status transition is not allowed
 */
router.patch('/orders/:id/status', authenticateToken, patchOrderStatus);

export default router;
