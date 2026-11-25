import { Router } from 'express';
import {
  addOrderDish,
  calculateOrder,
  cancelOrder,
  createOrder,
  getMyOrders,
  getOrderAvailability,
  getOrderById,
  getOrders,
  patchOrderStatus,
  replaceOrderDishes,
  removeOrderDish,
  updateOrder,
} from '../controllers/orders.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { checkRole } from '../middleware/checkRole';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderItem:
 *       type: object
 *       required:
 *         - dishId
 *         - dishName
 *         - categoryId
 *         - qty
 *         - priceCents
 *         - basePriceCents
 *         - discountPriceCents
 *         - discountedQty
 *         - lineTotalCents
 *       properties:
 *         dishId:
 *           type: integer
 *         dishName:
 *           type: string
 *           example: Маргарита
 *         categoryId:
 *           type: integer
 *         qty:
 *           type: integer
 *         priceCents:
 *           type: integer
 *         basePriceCents:
 *           type: integer
 *         discountPriceCents:
 *           type: integer
 *         discountedQty:
 *           type: integer
 *         lineTotalCents:
 *           type: integer
 *         canIncrease:
 *           type: boolean
 *           description: Whether the dish is active and can be increased beyond the existing quantity. Included on order details and dish replacement responses.
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
 *         - companyPaidCents
 *         - employeeDebtCents
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
 *         companyPaidCents:
 *           type: integer
 *         employeeDebtCents:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         canEdit:
 *           type: boolean
 *           description: Whether the authenticated viewer can edit the order at the time of the response. Included on order details and dish replacement responses.
 *         itemsRevision:
 *           type: integer
 *           minimum: 0
 *           description: Revision to send when replacing the items. Included on order details and dish replacement responses.
 *         orderAcceptanceEndsAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Acceptance cutoff for the order's route. Included on order details and dish replacement responses.
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 *     CreateOrderRequest:
 *       type: object
 *       required:
 *         - items
 *       properties:
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/OrderDishRequest'
 *     UpdateOrderRequest:
 *       type: object
 *       properties:
 *         deliveryFeeCents:
 *           type: integer
 *         discountCents:
 *           type: integer
 *     CalculateOrderResponse:
 *       type: object
 *       required:
 *         - subtotalCents
 *         - totalCents
 *         - companyPaidCents
 *         - employeeDebtCents
 *         - items
 *       properties:
 *         subtotalCents:
 *           type: integer
 *         totalCents:
 *           type: integer
 *         orderLimitCents:
 *           type: integer
 *         companyPaidCents:
 *           type: integer
 *         employeeDebtCents:
 *           type: integer
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
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
 *     ReplaceOrderDishesRequest:
 *       type: object
 *       required:
 *         - items
 *       properties:
 *         items:
 *           type: array
 *           minItems: 1
 *           description: Complete new dish list. Existing order items are fully replaced.
 *           items:
 *             $ref: '#/components/schemas/OrderDishRequest'
 *         expectedItemsRevision:
 *           type: integer
 *           minimum: 0
 *           description: Present on version-aware clients. A different current revision results in a conflict.
 *     OrderStatusRequest:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: [paid, cooking, delivering, completed, cancelled]
 *           example: paid
 *     OrderAvailabilityResponse:
 *       type: object
 *       required:
 *         - canCreateOrder
 *         - existingOrder
 *       properties:
 *         canCreateOrder:
 *           type: boolean
 *         existingOrder:
 *           nullable: true
 *           allOf:
 *             - $ref: '#/components/schemas/Order'
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
router.get('/orders', authenticateToken, checkRole(['admin', 'manager']), getOrders);

/**
 * @swagger
 * /orders/my:
 *   get:
 *     summary: List all current user orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All current user orders
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 */
router.get('/orders/my', authenticateToken, checkRole(['employee', 'manager', 'admin']), getMyOrders);

/**
 * @swagger
 * /orders/can-create-today:
 *   get:
 *     summary: Check whether current user has reached the daily order limit
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order creation availability
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderAvailabilityResponse'
 */
router.get('/orders/can-create-today', authenticateToken, checkRole(['employee', 'manager', 'admin']), getOrderAvailability);

/**
 * @swagger
 * /orders/calculate:
 *   post:
 *     summary: Calculate order total from dishes without creating an order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *     responses:
 *       200:
 *         description: Calculated order total
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CalculateOrderResponse'
 *       403:
 *         description: Only employees or managers can calculate orders
 *       409:
 *         description: The user already has an order today
 */
router.post('/orders/calculate', authenticateToken, checkRole(['employee', 'manager']), calculateOrder);

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
 *     summary: Create a new order draft from dishes and quantities
 *     description: When acceptance closes on an earlier date, orders use the first departure with an open cutoff. With a same-day cutoff, orders close until that departure leaves.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
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
 *       409:
 *         description: The user already has an order today or no active route is available
 */
router.post('/orders', authenticateToken, checkRole(['employee', 'manager']), createOrder);

/**
 * @swagger
 * /orders/{id}:
 *   put:
 *     summary: Update order charges as an administrator
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
 *       403:
 *         description: Only administrators can change order charges
 *       409:
 *         description: Order cannot be updated in the current status
 */
router.put('/orders/:id', authenticateToken, checkRole(['employee', 'manager', 'admin']), updateOrder);

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
router.delete('/orders/:id', authenticateToken, checkRole(['employee', 'manager', 'admin']), cancelOrder);

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
router.post('/orders/:id/dishes', authenticateToken, checkRole(['employee', 'manager', 'admin']), addOrderDish);

/**
 * @swagger
 * /orders/{id}/dishes:
 *   put:
 *     summary: Replace all dishes in an order
 *     description: Accepts the complete dish list and fully replaces the previous items. A removed or deactivated dish can remain up to its existing quantity and keeps its saved pricing. Subscription discounts are recalculated for the new list.
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
 *             $ref: '#/components/schemas/ReplaceOrderDishesRequest'
 *     responses:
 *       200:
 *         description: Updated order with items
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: A non-empty valid items list is required
 *       404:
 *         description: Order or dish not found
 *       409:
 *         description: The supplied revision is stale or the order is no longer editable
 *       422:
 *         description: An unavailable dish exceeds the quantity in the existing order
 */
router.put('/orders/:id/dishes', authenticateToken, checkRole(['employee', 'manager', 'admin']), replaceOrderDishes);

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
router.delete('/orders/:id/dishes/:dishId', authenticateToken, checkRole(['employee', 'manager', 'admin']), removeOrderDish);

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
router.patch('/orders/:id/status', authenticateToken, checkRole(['employee', 'manager', 'admin']), patchOrderStatus);

export default router;
