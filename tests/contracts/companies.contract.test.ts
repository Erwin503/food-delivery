import test from 'node:test';

test('GET /api/companies returns all visible companies for an authenticated user', { skip: true }, async () => {});
test('GET /api/companies/:id returns a single company by id', { skip: true }, async () => {});
test('POST /api/companies creates a company for admin role', { skip: true }, async () => {});
test('PUT /api/companies/:id updates company fields for admin or manager', { skip: true }, async () => {});
test('DELETE /api/companies/:id removes or archives a company for admin role', { skip: true }, async () => {});
test('GET /api/companies/:id/users returns company users for admin or manager', { skip: true }, async () => {});
test('POST /api/companies/:id/users assigns a user to a company', { skip: true }, async () => {});
test('DELETE /api/companies/:id/users/:userId clears company assignment for a user', { skip: true }, async () => {});
test('GET /api/companies/:id/manager returns the assigned manager or null', { skip: true }, async () => {});
test('PUT /api/companies/:id/manager assigns the company manager', { skip: true }, async () => {});
