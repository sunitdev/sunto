import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(
  new URL('../packages/app/src/storage/dates.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { addDays, daysBetween, nextDate, parseRepeat, formatRepeat } =
  await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );
test('days are counted across month and year ends', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-03-10', '2026-03-08'), -2);
  assert.equal(daysBetween('2026-03-28', '2026-04-02'), 5);
});
test('daily and yearly rules step by their interval, clamping leap days', () => {
  assert.equal(
    nextDate('2026-03-30', { freq: 'daily', interval: 3 }),
    '2026-04-02',
  );
  assert.equal(
    nextDate('2028-02-29', { freq: 'yearly', interval: 1 }),
    '2029-02-28',
  );
});
test('weekly rules move to the next chosen weekday in every nth week', () => {
  // 2026-03-09 is a Monday.
  const monThu = { freq: 'weekly', interval: 1, weekdays: [1, 4] };
  assert.equal(nextDate('2026-03-09', monThu), '2026-03-12');
  assert.equal(nextDate('2026-03-12', monThu), '2026-03-16');
  const fortnightly = { freq: 'weekly', interval: 2, weekdays: [1, 4] };
  assert.equal(nextDate('2026-03-12', fortnightly), '2026-03-23');
  assert.equal(
    nextDate('2026-03-11', { freq: 'weekly', interval: 1 }),
    '2026-03-18',
  );
});
test('monthly rules use their day, or the last day of shorter months', () => {
  const on31 = { freq: 'monthly', interval: 1, monthDay: 31 };
  assert.equal(nextDate('2026-01-31', on31), '2026-02-28');
  assert.equal(nextDate('2026-02-28', on31), '2026-03-31');
  assert.equal(
    nextDate('2026-03-05', { freq: 'monthly', interval: 1, monthDay: 20 }),
    '2026-03-20',
  );
  assert.equal(
    nextDate('2026-03-20', { freq: 'monthly', interval: 2 }),
    '2026-05-20',
  );
});
test('repeat rules round-trip, and malformed ones are ignored', () => {
  const rule = { freq: 'weekly', interval: 2, weekdays: [1, 4] };
  assert.deepEqual(parseRepeat(formatRepeat(rule)), rule);
  assert.equal(formatRepeat(null), '');
  assert.equal(parseRepeat(''), null);
  assert.equal(parseRepeat('{'), null);
  assert.equal(parseRepeat('{"freq":"hourly","interval":1}'), null);
  assert.deepEqual(
    parseRepeat('{"freq":"monthly","interval":0,"monthDay":40}'),
    {
      freq: 'monthly',
      interval: 1,
    },
  );
});
