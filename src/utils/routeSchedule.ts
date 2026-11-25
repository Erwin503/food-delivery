import { AppError } from '../errors/AppError';
import type { RouteModel, WeeklyRouteSchedule } from '../models/route.model';
import { BUSINESS_TIME_ZONE, getBusinessDateKey } from './businessTime';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// Even a route filtered from year 1000 keeps its cutoff inside the Gregorian calendar.
const MAX_ORDER_ACCEPTANCE_DAYS_BEFORE = 999 * 365;
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface RouteTimes {
  departureAt: Date;
  orderAcceptanceEndsAt: Date;
}

export const parseWeeklyRouteSchedule = (value: unknown): WeeklyRouteSchedule => {
  if (value === null || typeof value !== 'object') {
    throw new AppError('schedule must be an object', 400);
  }

  const {
    weekdays,
    departureTime,
    orderAcceptanceEndsTime,
    orderAcceptanceDaysBefore = 0,
  } = value as Record<string, unknown>;
  if (!Array.isArray(weekdays) || weekdays.length === 0 ||
    weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new AppError('schedule.weekdays must contain ISO weekdays from 1 to 7', 400);
  }

  if (typeof departureTime !== 'string' || !CLOCK_TIME.test(departureTime) ||
    typeof orderAcceptanceEndsTime !== 'string' || !CLOCK_TIME.test(orderAcceptanceEndsTime)) {
    throw new AppError('Schedule times must use HH:mm format', 400);
  }

  if (typeof orderAcceptanceDaysBefore !== 'number' || !Number.isInteger(orderAcceptanceDaysBefore) ||
    orderAcceptanceDaysBefore < 0 || orderAcceptanceDaysBefore > MAX_ORDER_ACCEPTANCE_DAYS_BEFORE) {
    throw new AppError(
      `orderAcceptanceDaysBefore must be an integer from 0 to ${MAX_ORDER_ACCEPTANCE_DAYS_BEFORE}`,
      400
    );
  }

  if (orderAcceptanceDaysBefore === 0 && orderAcceptanceEndsTime >= departureTime) {
    throw new AppError('Order acceptance end time must be before departure time', 400);
  }

  return {
    weekdays: [...new Set<number>(weekdays)].sort((left, right) => left - right),
    departureTime,
    orderAcceptanceEndsTime,
    ...(orderAcceptanceDaysBefore > 0 && { orderAcceptanceDaysBefore }),
  };
};

const clockFormatter = (timeZone: string): Intl.DateTimeFormat => new Intl.DateTimeFormat('en-GB', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const businessClockFormatter = clockFormatter(BUSINESS_TIME_ZONE);

const getClockFormatter = (timeZone: string): Intl.DateTimeFormat =>
  timeZone === BUSINESS_TIME_ZONE ? businessClockFormatter : clockFormatter(timeZone);

const isoYear = (year: string): string => year.length <= 4 ? year.padStart(4, '0') : `+${year.padStart(6, '0')}`;

// Interpret the clock fields as UTC to calculate the offset used at an instant.
const wallClock = (formatter: Intl.DateTimeFormat, timestamp: number): number => {
  const values = new Map(formatter.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return Date.parse(
    `${isoYear(values.get('year')!)}-${values.get('month')}-${values.get('day')}T` +
    `${values.get('hour')}:${values.get('minute')}:${values.get('second')}Z`
  );
};

const resolveWallTime = (
  civilDate: number,
  time: string,
  formatter: Intl.DateTimeFormat
): number | undefined => {
  const [hour, minute] = time.split(':').map(Number);
  const timestamp = civilDate + (hour * 60 + minute) * MINUTE_MS;
  const offsets = new Set([-DAY_MS, 0, DAY_MS, 2 * DAY_MS].map((shift) => {
    const probe = civilDate + shift;
    return wallClock(formatter, probe) - probe;
  }));

  // Choose the first occurrence of an ambiguous time during a clock rollback.
  return [...offsets]
    .map((offset) => timestamp - offset)
    .sort((left, right) => left - right)
    .find((instant) => wallClock(formatter, instant) === timestamp);
};

const findRouteOccurrence = (
  schedule: WeeklyRouteSchedule,
  from: Date,
  timeZone: string,
  fromCutoff: boolean
): RouteTimes => {
  const formatter = getClockFormatter(timeZone);
  const [year, month, date] = getBusinessDateKey(from, timeZone).split('-');
  const daysBefore = schedule.orderAcceptanceDaysBefore ?? 0;
  const firstDay = Date.parse(`${isoYear(year)}-${month}-${date}T00:00:00Z`);
  const firstDepartureDay = firstDay + (fromCutoff ? daysBefore * DAY_MS : 0);
  const earliestTime = from.getTime() + (fromCutoff ? 1 : 0);

  // Advance calendar dates using a UTC representation of the local date.
  // A clock gap can skip both a departure and a later departure's cutoff.
  for (let dayOffset = 0; dayOffset <= 21; dayOffset += 1) {
    const civilDate = firstDepartureDay + dayOffset * DAY_MS;
    const weekday = new Date(civilDate).getUTCDay() || 7;
    if (!schedule.weekdays.includes(weekday)) continue;

    const cutoffDate = civilDate - daysBefore * DAY_MS;
    const departure = resolveWallTime(civilDate, schedule.departureTime, formatter);
    const cutoff = resolveWallTime(cutoffDate, schedule.orderAcceptanceEndsTime, formatter);

    if (departure !== undefined && cutoff !== undefined && cutoff < departure &&
      (fromCutoff ? cutoff : departure) >= earliestTime) {
      return { departureAt: new Date(departure), orderAcceptanceEndsAt: new Date(cutoff) };
    }
  }

  throw new Error('No departure could be resolved for the weekly route schedule');
};

export const getNextScheduledRoute = (
  schedule: WeeklyRouteSchedule,
  from: Date,
  timeZone = BUSINESS_TIME_ZONE
): RouteTimes => findRouteOccurrence(schedule, from, timeZone, false);

export const getNextOrderableRoute = (
  schedule: WeeklyRouteSchedule,
  now: Date,
  timeZone = BUSINESS_TIME_ZONE
): RouteTimes | undefined => {
  if (schedule.orderAcceptanceDaysBefore) {
    return findRouteOccurrence(schedule, now, timeZone, true);
  }

  const next = getNextScheduledRoute(schedule, new Date(now.getTime() + 1), timeZone);
  return next.orderAcceptanceEndsAt > now ? next : undefined;
};

export const readRouteSchedule = (value: RouteModel['schedule']): WeeklyRouteSchedule =>
  typeof value === 'string' ? JSON.parse(value) as WeeklyRouteSchedule : value;

export const weeklyScheduleFromOccurrence = (
  departureAt: Date,
  orderAcceptanceEndsAt: Date,
  timeZone = BUSINESS_TIME_ZONE
): WeeklyRouteSchedule => {
  const formatter = getClockFormatter(timeZone);
  const toCivilMinute = (instant: Date) => Math.floor(wallClock(formatter, instant.getTime()) / MINUTE_MS) * MINUTE_MS;
  const departure = toCivilMinute(departureAt);
  const cutoff = orderAcceptanceEndsAt < departureAt
    ? Math.min(toCivilMinute(orderAcceptanceEndsAt), departure - MINUTE_MS)
    : departure - MINUTE_MS;
  const orderAcceptanceDaysBefore = Math.floor(departure / DAY_MS) - Math.floor(cutoff / DAY_MS);

  return {
    weekdays: [new Date(departure).getUTCDay() || 7],
    departureTime: new Date(departure).toISOString().slice(11, 16),
    orderAcceptanceEndsTime: new Date(cutoff).toISOString().slice(11, 16),
    ...(orderAcceptanceDaysBefore > 0 && { orderAcceptanceDaysBefore }),
  };
};
