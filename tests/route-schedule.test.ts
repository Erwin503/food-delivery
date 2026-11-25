import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextOrderableRoute, getNextScheduledRoute } from '../src/utils/routeSchedule';

const schedule = {
  weekdays: [1, 2, 3, 5],
  departureTime: '13:00',
  orderAcceptanceEndsTime: '11:00',
};

test('A weekly schedule starts on the next selected local weekday', () => {
  const thursdayUtc = new Date('2026-11-25T21:30:00Z');
  const occurrence = getNextScheduledRoute(schedule, thursdayUtc, 'Europe/Moscow');

  assert.equal(occurrence.departureAt.toISOString(), '2026-11-27T10:00:00.000Z');
  assert.equal(occurrence.orderAcceptanceEndsAt.toISOString(), '2026-11-27T08:00:00.000Z');
  assert.equal(
    getNextScheduledRoute(schedule, new Date(occurrence.departureAt.getTime() + 1), 'Europe/Moscow')
      .departureAt.toISOString(),
    '2026-11-30T10:00:00.000Z'
  );
});

test('Schedule times follow the local clock across daylight saving transitions', () => {
  const sunday = { weekdays: [7], departureTime: '13:00', orderAcceptanceEndsTime: '11:00' };
  const before = getNextScheduledRoute(sunday, new Date('2026-03-01T00:00:00Z'), 'America/New_York');
  const after = getNextScheduledRoute(sunday, new Date('2026-03-08T00:00:00Z'), 'America/New_York');

  assert.equal(before.departureAt.toISOString(), '2026-03-01T18:00:00.000Z');
  assert.equal(after.departureAt.toISOString(), '2026-03-08T17:00:00.000Z');
  assert.equal(after.orderAcceptanceEndsAt.toISOString(), '2026-03-08T15:00:00.000Z');
});

test('A nonexistent clock time is skipped and a repeated clock time occurs once', () => {
  const sunday = { weekdays: [7], departureTime: '02:30', orderAcceptanceEndsTime: '01:00' };
  const afterGap = getNextScheduledRoute(sunday, new Date('2026-03-08T00:00:00Z'), 'America/New_York');

  assert.equal(afterGap.departureAt.toISOString(), '2026-03-15T06:30:00.000Z');

  const duringFold = { ...sunday, departureTime: '01:30' };
  const first = getNextScheduledRoute(duringFold, new Date('2026-11-01T00:00:00Z'), 'America/New_York');
  const following = getNextScheduledRoute(duringFold, new Date('2026-11-01T05:30:00.001Z'), 'America/New_York');

  assert.equal(first.departureAt.toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(following.departureAt.toISOString(), '2026-11-08T06:30:00.000Z');
});

test('Earlier acceptance uses the local calendar and both dates use their own daylight saving offsets', () => {
  const sunday = {
    weekdays: [7],
    departureTime: '13:00',
    orderAcceptanceEndsTime: '23:00',
    orderAcceptanceDaysBefore: 1,
  };
  const occurrence = getNextScheduledRoute(sunday, new Date('2026-03-07T14:00:00Z'), 'America/New_York');

  assert.equal(occurrence.departureAt.toISOString(), '2026-03-08T17:00:00.000Z');
  assert.equal(occurrence.orderAcceptanceEndsAt.toISOString(), '2026-03-08T04:00:00.000Z');
});

test('A clock gap can affect two departures when the cutoff is a week earlier', () => {
  const sunday = {
    weekdays: [7],
    departureTime: '02:30',
    orderAcceptanceEndsTime: '02:00',
    orderAcceptanceDaysBefore: 7,
  };
  const occurrence = getNextScheduledRoute(sunday, new Date('2026-03-02T12:00:00Z'), 'America/New_York');

  assert.equal(occurrence.departureAt.toISOString(), '2026-03-22T06:30:00.000Z');
  assert.equal(occurrence.orderAcceptanceEndsAt.toISOString(), '2026-03-15T06:00:00.000Z');
});

test('A daily route with an earlier cutoff moves to the next bookable ride at that cutoff', () => {
  const daily = {
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    departureTime: '13:00',
    orderAcceptanceEndsTime: '11:00',
    orderAcceptanceDaysBefore: 1,
  };
  const cutoff = new Date('2026-11-27T08:00:00Z');
  const justBefore = new Date(cutoff.getTime() - 1);

  assert.equal(getNextOrderableRoute(daily, justBefore, 'Europe/Moscow')?.departureAt.toISOString(),
    '2026-11-28T10:00:00.000Z');
  assert.equal(getNextOrderableRoute(daily, cutoff, 'Europe/Moscow')?.departureAt.toISOString(),
    '2026-11-29T10:00:00.000Z');
  assert.equal(getNextScheduledRoute(daily, cutoff, 'Europe/Moscow').departureAt.toISOString(),
    '2026-11-27T10:00:00.000Z');
});

test('The first bookable departure is based on the local calendar across a spring clock change', () => {
  const sunday = {
    weekdays: [7],
    departureTime: '13:00',
    orderAcceptanceEndsTime: '23:45',
    orderAcceptanceDaysBefore: 2,
  };
  const friday = new Date('2026-03-07T04:30:00Z');
  const occurrence = getNextOrderableRoute(sunday, friday, 'America/New_York');

  assert.equal(occurrence?.departureAt.toISOString(), '2026-03-08T17:00:00.000Z');
  assert.equal(occurrence?.orderAcceptanceEndsAt.toISOString(), '2026-03-07T04:45:00.000Z');
});
