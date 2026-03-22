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
 *         status:
 *           type: string
 *           enum: [created, paid, cooking, delivering, completed, cancelled]
 *         deliveryAddress:
 *           type: string
 *           nullable: true
 *         contactName:
 *           type: string
 *           nullable: true
 *         contactPhone:
 *           type: string
 *           nullable: true
 *         scheduledFor:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         subtotalCents:
 *           type: integer
 *         deliveryFeeCents:
 *           type: integer
 *         discountCents:
 *           type: integer
 *         totalCents:
 *           type: integer
 *         comment:
 *           type: string
 *           nullable: true
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
 */

router.get('/orders', authenticateToken, getOrders);
router.get('/orders/:id', authenticateToken, getOrderById);
router.post('/orders', authenticateToken, createOrder);
router.put('/orders/:id', authenticateToken, updateOrder);
router.delete('/orders/:id', authenticateToken, cancelOrder);
router.post('/orders/:id/dishes', authenticateToken, addOrderDish);
router.put('/orders/:id/dishes', authenticateToken, updateOrderDish);
router.delete('/orders/:id/dishes/:dishId', authenticateToken, removeOrderDish);
router.patch('/orders/:id/status', authenticateToken, patchOrderStatus);

export default router;
