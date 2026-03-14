import test from 'node:test';

test('GET /api/orders returns filtered orders list for admin or manager', { skip: true }, async () => {});
test('GET /api/orders/:id returns order details with items for owner, manager, or admin', { skip: true }, async () => {});
test('POST /api/orders creates a draft order for employee role', { skip: true }, async () => {});
test('PUT /api/orders/:id updates order meta fields for owner or manager', { skip: true }, async () => {});
test('DELETE /api/orders/:id cancels an order for admin or manager', { skip: true }, async () => {});
test('POST /api/orders/:id/dishes adds an item and snapshots current dish price', { skip: true }, async () => {});
test('PUT /api/orders/:id/dishes changes item quantity for owner or manager', { skip: true }, async () => {});
test('DELETE /api/orders/:id/dishes/:dishId removes an order item', { skip: true }, async () => {});
test('PATCH /api/orders/:id/status changes order status through allowed transitions', { skip: true }, async () => {});
