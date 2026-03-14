import test from 'node:test';

test('POST /api/auth/login/step1 sends a one-time email code', { skip: true }, async () => {});
test('POST /api/auth/login/step2 returns JWT and user DTO for a valid code', { skip: true }, async () => {});
test('GET /api/auth/profile returns current user for a valid bearer token', { skip: true }, async () => {});
test('PUT /api/auth/profile updates profile fields and returns the updated user', { skip: true }, async () => {});
test('DELETE /api/auth/profile performs a soft delete for the current user', { skip: true }, async () => {});
test('POST /api/auth/promote allows only admins to change user role', { skip: true }, async () => {});
test('GET /api/auth/all returns paginated users list for admins only', { skip: true }, async () => {});
