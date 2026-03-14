import test from 'node:test';

test('GET /api/categories returns sorted categories list', { skip: true }, async () => {});
test('GET /api/categories/:id returns a category by id', { skip: true }, async () => {});
test('POST /api/categories creates a category for manager or admin', { skip: true }, async () => {});
test('PUT /api/categories/:id partially updates a category', { skip: true }, async () => {});
test('DELETE /api/categories/:id deletes or archives a category', { skip: true }, async () => {});
test('GET /api/dishes returns dishes with category and active filters', { skip: true }, async () => {});
test('GET /api/dishes/:id returns a dish by id', { skip: true }, async () => {});
test('GET /api/categories/:id/dishes returns dishes for the selected category', { skip: true }, async () => {});
test('POST /api/dishes creates a dish for manager or admin', { skip: true }, async () => {});
test('PUT /api/dishes/:id partially updates a dish', { skip: true }, async () => {});
test('DELETE /api/dishes/:id deletes or archives a dish', { skip: true }, async () => {});
