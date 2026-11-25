import type { Knex } from 'knex';
import type { WeeklyRouteSchedule } from '../src/models/route.model';
import { getNextScheduledRoute, readRouteSchedule, weeklyScheduleFromOccurrence } from '../src/utils/routeSchedule';

interface RouteRow {
  id: number;
  schedule: WeeklyRouteSchedule | string | null;
  schedule_migrated_from_legacy: boolean | number;
  departure_unix: number | string | null;
  acceptance_ends_unix: number | string | null;
}

const routesWithOriginalTimes = (knex: Knex) => knex<RouteRow>('routes').select<RouteRow[]>(
  'id',
  'schedule',
  'schedule_migrated_from_legacy',
  knex.raw('UNIX_TIMESTAMP(departure_at) as departure_unix'),
  knex.raw('UNIX_TIMESTAMP(order_acceptance_ends_at) as acceptance_ends_unix')
);

const originalSchedule = (route: RouteRow): WeeklyRouteSchedule => weeklyScheduleFromOccurrence(
  new Date(Number(route.departure_unix) * 1000),
  new Date(Number(route.acceptance_ends_unix) * 1000)
);

export async function up(knex: Knex): Promise<void> {
  if (!await knex.schema.hasColumn('routes', 'schedule_migrated_from_legacy')) {
    await knex.schema.alterTable('routes', (table) => {
      table.boolean('schedule_migrated_from_legacy').notNullable().defaultTo(false);
    });
  }

  const legacyRoutes = await routesWithOriginalTimes(knex).whereNull('schedule');
  for (const route of legacyRoutes) {
    await knex('routes').where({ id: route.id }).update({
      schedule: JSON.stringify(originalSchedule(route)),
      schedule_migrated_from_legacy: true,
    });
  }

  await knex('orders as o')
    .join('routes as r', 'r.id', 'o.route_id')
    .where((query) => query.whereNull('o.route_departure_unix').orWhereNull('o.route_acceptance_ends_unix'))
    .update({
      'o.route_departure_unix': knex.raw('COALESCE(??, UNIX_TIMESTAMP(??))', ['o.route_departure_unix', 'r.departure_at']),
      'o.route_acceptance_ends_unix': knex.raw('COALESCE(??, UNIX_TIMESTAMP(??))', ['o.route_acceptance_ends_unix', 'r.order_acceptance_ends_at']),
    });

  await knex.schema.alterTable('orders', (table) => {
    table.bigInteger('route_departure_unix').unsigned().notNullable().alter();
    table.bigInteger('route_acceptance_ends_unix').unsigned().notNullable().alter();
  });

  await knex.schema.alterTable('routes', (table) => {
    table.json('schedule').notNullable().alter();
    table.timestamp('departure_at').nullable().alter();
    table.timestamp('order_acceptance_ends_at').nullable().alter();
  });
}

const matchesOriginalSchedule = (route: RouteRow, schedule: WeeklyRouteSchedule): boolean => {
  if (!route.schedule_migrated_from_legacy || route.departure_unix === null || route.acceptance_ends_unix === null) {
    return false;
  }

  const original = originalSchedule(route);
  return schedule.weekdays.length === 1 && schedule.weekdays[0] === original.weekdays[0] &&
    schedule.departureTime === original.departureTime &&
    schedule.orderAcceptanceEndsTime === original.orderAcceptanceEndsTime &&
    (schedule.orderAcceptanceDaysBefore ?? 0) === (original.orderAcceptanceDaysBefore ?? 0);
};

export async function down(knex: Knex): Promise<void> {
  const routes = await routesWithOriginalTimes(knex);
  const from = new Date(Date.now() + 1);
  const restoreLegacyIds: number[] = [];
  const newRouteTimes = [];

  // Validate the rollback before MySQL executes any non-transactional DDL.
  for (const route of routes) {
    if (route.schedule === null) continue;
    const schedule = readRouteSchedule(route.schedule);

    if (matchesOriginalSchedule(route, schedule)) {
      restoreLegacyIds.push(route.id);
      continue;
    }
    if (schedule.orderAcceptanceDaysBefore) {
      throw new Error(`Cannot roll back route ${route.id}: the previous schema does not support a cutoff on an earlier day`);
    }
    if (route.departure_unix === null || route.acceptance_ends_unix === null) {
      newRouteTimes.push({ id: route.id, times: getNextScheduledRoute(schedule, from) });
    }
  }

  await knex.schema.alterTable('routes', (table) => {
    table.json('schedule').nullable().alter();
  });

  for (const { id, times } of newRouteTimes) {
    await knex('routes').where({ id }).update({
      departure_at: knex.raw('COALESCE(departure_at, FROM_UNIXTIME(?))', [times.departureAt.getTime() / 1000]),
      order_acceptance_ends_at: knex.raw('COALESCE(order_acceptance_ends_at, FROM_UNIXTIME(?))', [
        times.orderAcceptanceEndsAt.getTime() / 1000,
      ]),
    });
  }
  if (restoreLegacyIds.length > 0) {
    await knex('routes').whereIn('id', restoreLegacyIds).update({ schedule: null });
  }

  await knex.schema.alterTable('routes', (table) => {
    table.timestamp('departure_at').notNullable().alter();
    table.timestamp('order_acceptance_ends_at').notNullable().alter();
    table.dropColumn('schedule_migrated_from_legacy');
  });

  await knex.schema.alterTable('orders', (table) => {
    table.bigInteger('route_departure_unix').unsigned().nullable().alter();
    table.bigInteger('route_acceptance_ends_unix').unsigned().nullable().alter();
  });
}
