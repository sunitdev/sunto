import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = (path, replace = (text) => text) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    replace(
      ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    ),
  ).toString('base64');
const datesURL = compile('../packages/app/src/storage/dates.ts');
const { parseTitle, stripTokens, nameQuery, suggestNames, completeName } =
  await import(
    compile('../packages/app/src/storage/quickAdd.ts', (text) =>
      text.replace("'./dates'", `'${datesURL}'`),
    )
  );
// Monday, 16 November 2026.
const today = '2026-11-16';
const lists = [
  {
    id: 'misc',
    title: 'Misc',
    sections: [
      { id: 'later', title: 'Later' },
      { id: 'plan', title: 'Planning' },
    ],
  },
  { id: 'home', title: 'Home', sections: [{ id: 'garden', title: 'Garden' }] },
  { id: 'office', title: 'Home Office' },
  { id: 'untitled', title: '' },
];
const parse = (text, current = '') => parseTitle(text, today, lists, current);
// A repeat's first day is the to-do's date.
const fields = (text) =>
  Object.fromEntries(
    parse(text).flatMap((t) =>
      t.kind === 'repeat'
        ? [
            ['repeat', t.value],
            ['date', t.day],
          ]
        : [[t.kind, t.value]],
    ),
  );
const marked = (text) => parse(text).map((t) => text.slice(t.start, t.end));

test('a date and a list are read from the title and taken out of it', () => {
  const text = 'Go to showroom today #Misc';
  assert.deepEqual(fields(text), { date: today, list: 'misc' });
  assert.deepEqual(marked(text), ['today', '#Misc']);
  assert.equal(stripTokens(text, parse(text)), 'Go to showroom');
});
test('relative days and weekdays count from today', () => {
  assert.equal(fields('Call Tomorrow').date, '2026-11-17');
  assert.equal(fields('Call tmrw').date, '2026-11-17');
  assert.equal(fields('Call sunday').date, '2026-11-22');
  // A weekday names the next one, unless "this" allows today.
  assert.equal(fields('Call monday').date, '2026-11-23');
  assert.equal(fields('Call this Monday').date, today);
  assert.deepEqual(marked('Call next Friday please'), ['next Friday']);
  assert.equal(fields('Call next friday').date, '2026-11-20');
  assert.equal(fields('Plan next week').date, '2026-11-23');
  assert.equal(fields('Plan in 3 days').date, '2026-11-19');
  assert.equal(fields('Plan in 2 weeks').date, '2026-11-30');
  assert.equal(fields('Plan in a month').date, '2026-12-16');
});
test('calendar dates read in either order, with or without a weekday', () => {
  assert.equal(fields('Party Sunday, 9 May 2027').date, '2027-05-09');
  assert.deepEqual(marked('Party Sunday, 9 May 2027'), ['Sunday, 9 May 2027']);
  assert.equal(fields('Party 9th May').date, '2027-05-09');
  const text = 'Party on Sunday, 9 May 2027 at the hall';
  assert.deepEqual(marked(text), ['on Sunday, 9 May 2027']);
  assert.equal(stripTokens(text, parse(text)), 'Party at the hall');
  assert.deepEqual(marked('Call on next Friday'), ['on next Friday']);
  assert.equal(fields('Party May 9th, 2027').date, '2027-05-09');
  assert.equal(fields('Party Dec 25').date, '2026-12-25');
  assert.equal(fields('Party 16 November').date, today);
  assert.equal(fields('Party 2027-01-31').date, '2027-01-31');
  // A day the month doesn't have isn't a date.
  assert.deepEqual(parse('Party 31 Feb 2027'), []);
  assert.equal(fields('Party 29 feb').date, '2028-02-29');
});
test('ordinary words are left alone', () => {
  for (const text of [
    'May I borrow it',
    'Mondays are hard',
    'Read todays paper',
    'Buy 2 sat nav',
    'Tag #misc2',
    'Email a#Misc',
    'Plan #Unknown project',
  ])
    assert.deepEqual(parse(text), [], text);
});
test('the longest list name matches, in any case, and #Inbox too', () => {
  assert.equal(fields('Desk #home office').list, 'office');
  assert.equal(fields('Desk #Home').list, 'home');
  assert.equal(fields('Desk #inbox').list, '');
  assert.deepEqual(marked('Desk #Home Office today'), [
    '#Home Office',
    'today',
  ]);
});
test('the last date and list typed win, and a list name is never a date', () => {
  const text = 'Call today #Misc then tomorrow #Home';
  assert.deepEqual(fields(text), { date: '2026-11-17', list: 'home' });
  assert.equal(stripTokens(text, parse(text)), 'Call today #Misc then');
  const named = parseTitle('Gym #Monday', today, [
    { id: 'm', title: 'Monday' },
  ]);
  assert.deepEqual(
    named.map((t) => t.kind),
    ['list'],
  );
});
test('a "#" before the caret starts a list name to complete', () => {
  assert.deepEqual(nameQuery('Desk #ho', 8), {
    mark: '#',
    start: 5,
    query: 'ho',
  });
  assert.deepEqual(nameQuery('Desk #', 6), { mark: '#', start: 5, query: '' });
  assert.deepEqual(nameQuery('Desk #home office', 17), {
    mark: '#',
    start: 5,
    query: 'home office',
  });
  assert.deepEqual(nameQuery('Desk #Home /pl', 14), {
    mark: '/',
    start: 11,
    query: 'pl',
  });
  assert.equal(nameQuery('Desk and/or', 11), undefined);
  assert.equal(nameQuery('Desk a#ho', 9), undefined);
  assert.equal(nameQuery('Desk', 4), undefined);
  // The "#" must be before the caret.
  assert.equal(nameQuery('Desk #ho', 4), undefined);
});
test('lists starting with the name come first, then a later word', () => {
  const titles = (q) => suggestNames(q, lists).map((l) => l.title);
  assert.deepEqual(titles(''), ['Misc', 'Home', 'Home Office']);
  assert.deepEqual(titles('ho'), ['Home', 'Home Office']);
  assert.deepEqual(titles('off'), ['Home Office']);
  assert.deepEqual(titles('HOME'), ['Home', 'Home Office']);
  // A whole name that nothing else continues needs no suggestion.
  assert.deepEqual(titles('misc'), []);
  assert.deepEqual(titles('misc today'), []);
  // A whole name and a space is finished, though a longer one continues it.
  assert.deepEqual(titles('home '), []);
  assert.deepEqual(titles('home o'), ['Home Office']);
});
test('completing a name replaces the rest of its word and adds a space', () => {
  assert.deepEqual(completeName('Desk #ho', 5, 8, 'Home Office'), {
    text: 'Desk #Home Office ',
    caret: 18,
  });
  assert.deepEqual(completeName('Desk #hom today', 5, 8, 'Home'), {
    text: 'Desk #Home today',
    caret: 11,
  });
});

const rule = (text) => JSON.parse(fields(text).repeat);
test('repeats read from "every", starting on their first day', () => {
  assert.deepEqual(rule('Water plants every day'), {
    freq: 'daily',
    interval: 1,
  });
  assert.equal(fields('Water plants every day').date, today);
  assert.deepEqual(rule('Bins every other week'), {
    freq: 'weekly',
    interval: 2,
    weekdays: [1],
  });
  assert.deepEqual(rule('Rent every 3 months'), {
    freq: 'monthly',
    interval: 3,
    monthDay: 16,
  });
  assert.deepEqual(rule('Taxes every year'), { freq: 'yearly', interval: 1 });
  // Weekdays start on the first of them from today, which may be today.
  const gym = 'Gym every Tuesday and Thursday';
  assert.deepEqual(rule(gym), {
    freq: 'weekly',
    interval: 1,
    weekdays: [2, 4],
  });
  assert.equal(fields(gym).date, '2026-11-17');
  assert.deepEqual(marked(gym), ['every Tuesday and Thursday']);
  assert.equal(fields('Standup every Monday').date, today);
  assert.deepEqual(rule('Standup every weekday').weekdays, [1, 2, 3, 4, 5]);
  assert.deepEqual(rule('Pay every 15th'), {
    freq: 'monthly',
    interval: 1,
    monthDay: 15,
  });
  assert.equal(fields('Pay every 15th').date, '2026-12-15');
});
test('a date typed with a repeat starts it, and repeats on its day', () => {
  const text = 'Review every month from 3 Dec';
  assert.equal(fields(text).date, '2026-12-03');
  assert.deepEqual(rule(text), { freq: 'monthly', interval: 1, monthDay: 3 });
  assert.deepEqual(marked(text), ['every month', '3 Dec']);
  assert.equal(stripTokens(text, parse(text)), 'Review from');
  // Without "every", the words stay.
  assert.deepEqual(parse('Write weekly report'), []);
});
test("sections are the named list's, or else the to-do's own list's", () => {
  assert.deepEqual(fields('Seeds #Home /garden'), {
    list: 'home',
    section: 'garden',
  });
  // The section can come before the list.
  assert.equal(fields('Seeds /Garden #Home').section, 'garden');
  assert.equal(
    parseTitle('Seeds /Later', today, lists, 'misc')[0].value,
    'later',
  );
  assert.deepEqual(parse('Seeds /Later'), []);
  assert.deepEqual(parse('Seeds /Later #Home'), [
    { kind: 'list', start: 13, end: 18, value: 'home' },
  ]);
  assert.deepEqual(parse('Read and/or #Home'), [
    { kind: 'list', start: 12, end: 17, value: 'home' },
  ]);
  assert.equal(
    stripTokens('Seeds #Home /Garden', parse('Seeds #Home /Garden')),
    'Seeds',
  );
});
