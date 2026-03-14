# Database schema

This schema is designed from the API contract in `Base URL \`api\`.txt`.

## Main entities

- `companies`: customer companies with address and description.
- `users`: application users with one optional `company_id` and role `employee | manager | admin`.
- `auth_login_codes`: one-time email codes for the two-step login flow.
- `company_managers`: one manager per company and one company per manager.
- `categories`: global dish categories.
- `dishes`: menu items with current price and active flag.
- `routes`: delivery рейсы with departure date/time.
- `route_companies`: M:N relation between routes and companies.
- `orders`: order header with customer, company, delivery/contact data, totals, and status.
- `order_items`: order lines with frozen dish price at the time of ordering.
- `order_status_history`: audit trail for status changes.

## Important decisions

- Soft delete support is added through `deleted_at` on core business tables so the API can hide removed records without losing history.
- `users.company_id` is nullable to support admins or global users outside any company.
- `company_managers` keeps manager assignment separate from `users.company_id`, matching the API note about a dedicated table.
- `order_items` uses the composite primary key (`order_id`, `dish_id`) because the API updates and deletes an item by `dishId` inside a specific order.
- Money is stored in integer cents to avoid floating-point errors.
- Order aggregates (`subtotal_cents`, `total_cents`) are stored directly in `orders` for fast reads; application code should recalculate them whenever items, delivery fee, or discount change.
- `order_status_history` is optional from the API perspective, but useful for auditing manager/admin status changes.

## Suggested application rules

- Generate `orders.order_number` on the server, for example `YYYYMMDD-000123`.
- Allow order edits by employees only while the order is still editable in business terms, usually before `cooking`.
- When `delivery_address` is omitted on order creation, fill it from `companies.address`.
- Before assigning a company manager, verify that the chosen user has role `manager` or `admin`.
