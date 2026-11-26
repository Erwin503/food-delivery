export const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE?.trim() || 'Europe/Moscow';

export interface BusinessDay {
  day: string;
  start: Date;
  end: Date;
  capturedAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: BUSINESS_TIME_ZONE,
});
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const getBusinessIsoWeekday = (date = new Date(Date.now())): number =>
  WEEKDAYS.indexOf(weekdayFormatter.format(date)) + 1;

const dateKey = (formatter: Intl.DateTimeFormat, timestamp: number): string => {
  const parts = formatter.formatToParts(timestamp);
  const year = parts.find((part) => part.type === 'year')!.value;
  const month = parts.find((part) => part.type === 'month')!.value;
  const day = parts.find((part) => part.type === 'day')!.value;
  return `${year}-${month}-${day}`;
};

const makeDateFormatter = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

const businessDateFormatter = makeDateFormatter(BUSINESS_TIME_ZONE);

export const getBusinessDateKey = (date: Date, timeZone = BUSINESS_TIME_ZONE): string =>
  dateKey(timeZone === BUSINESS_TIME_ZONE ? businessDateFormatter : makeDateFormatter(timeZone), date.getTime());

const findDayStart = (formatter: Intl.DateTimeFormat, day: string): Date => {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  let before = utcMidnight - 2 * DAY_MS;
  let after = utcMidnight + 2 * DAY_MS;

  // Find the first instant of the civil date even if the local midnight was skipped.
  while (after - before > 1) {
    const middle = before + Math.floor((after - before) / 2);
    if (dateKey(formatter, middle) < day) {
      before = middle;
    } else {
      after = middle;
    }
  }

  return new Date(after);
};

const buildBusinessDay = (formatter: Intl.DateTimeFormat, day: string, capturedAt: Date): BusinessDay => {
  const nextDate = new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

  return {
    day,
    start: findDayStart(formatter, day),
    end: findDayStart(formatter, nextDate),
    capturedAt,
  };
};

export const getBusinessDay = (
  capturedAt = new Date(Date.now()),
  timeZone = BUSINESS_TIME_ZONE
): BusinessDay => {
  const formatter = timeZone === BUSINESS_TIME_ZONE ? businessDateFormatter : makeDateFormatter(timeZone);
  return buildBusinessDay(formatter, dateKey(formatter, capturedAt.getTime()), capturedAt);
};

export const getBusinessDayForDate = (day: unknown): BusinessDay | undefined => {
  if (typeof day !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(day)) return;
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return;

  const formatter = businessDateFormatter;
  const result = buildBusinessDay(formatter, day, new Date(Date.now()));
  if (dateKey(formatter, result.start.getTime()) === day) return result;
};
