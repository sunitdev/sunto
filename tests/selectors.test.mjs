import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(
  new URL('../packages/app/src/storage/selectors.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { organize, visibleTasks, groupTasks, groupByList, dayPlan } =
  await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );
const DAY = 86400000;
const record = (id, fields = {}) => ({
  id,
  kind: 'task',
  list: '',
  section: '',
  epic: '',
  kanban: false,
  icon: '',
  color: '',
  deletedFrom: '',
  date: '',
  repeat: '',
  planned: '',
  title: id,
  notes: '',
  completed: false,
  completedAt: 0,
  trashed: false,
  trashedAt: 0,
  deleted: false,
  created: 1,
  stamps: {},
  ...fields,
});
const library = (...records) =>
  organize({ tasks: Object.fromEntries(records.map((r) => [r.id, r])) });
const show = (lib, view, options = {}) =>
  visibleTasks(lib, view, {
    list: '',
    today: '2026-03-10',
    editing: null,
    lingering: {},
    phone: false,
    ...options,
  }).map((t) => t.id);
test('organize sorts areas oldest first and projects newest first, skipping deleted records', () => {
  const lib = library(
    record('a2', { kind: 'area', created: 2 }),
    record('a1', { kind: 'area', created: 1 }),
    record('p1', { kind: 'project', created: 1 }),
    record('p2', { kind: 'project', created: 2 }),
    record('gone', { kind: 'project', created: 3, deleted: true }),
    record('t'),
  );
  assert.deepEqual(
    lib.areas.map((a) => a.id),
    ['a1', 'a2'],
  );
  assert.deepEqual(
    lib.projects.map((p) => p.id),
    ['p2', 'p1'],
  );
  assert.deepEqual(Object.keys(lib.lists).sort(), ['a1', 'a2', 'p1', 'p2']);
  assert.deepEqual(
    lib.todos.map((t) => t.id),
    ['t'],
  );
});
test('membership falls back to the Inbox or no area when the list is gone', () => {
  const lib = library(
    record('area', { kind: 'area' }),
    record('p', { kind: 'project', list: 'area' }),
    record('orphan', { kind: 'project', list: 'missing' }),
    record('in-p', { list: 'p' }),
    record('lost', { list: 'missing' }),
  );
  assert.equal(lib.areaOf(lib.lists.p), 'area');
  assert.equal(lib.areaOf(lib.lists.orphan), '');
  assert.equal(lib.listOf(lib.todos.find((t) => t.id === 'in-p')), 'p');
  assert.equal(lib.listOf(lib.todos.find((t) => t.id === 'lost')), '');
});
test('progress and Inbox count ignore trashed to-dos', () => {
  const lib = library(
    record('p', { kind: 'project' }),
    record('done', { list: 'p', completed: true }),
    record('open', { list: 'p' }),
    record('trashed', { list: 'p', trashed: true }),
    record('inbox'),
    record('blank', { title: '  ' }),
    record('inbox-done', { completed: true }),
    record('inbox-trashed', { trashed: true }),
  );
  assert.equal(lib.progress('p'), 0.5);
  assert.equal(lib.progress('empty'), 0);
  assert.equal(lib.inboxCount, 1);
});
test('the Inbox hides completed to-dos unless lingering, edited, or on the phone', () => {
  const lib = library(
    record('old', { created: 1 }),
    record('new', { created: 2 }),
    record('done', { created: 3, completed: true }),
    record('trashed', { trashed: true }),
    record('in-p', { list: 'p' }),
    record('p', { kind: 'project' }),
  );
  assert.deepEqual(show(lib, 'inbox'), ['new', 'old']);
  assert.deepEqual(show(lib, 'inbox', { lingering: { done: true } }), [
    'done',
    'new',
    'old',
  ]);
  assert.deepEqual(show(lib, 'inbox', { editing: 'done' }), [
    'done',
    'new',
    'old',
  ]);
  assert.deepEqual(show(lib, 'inbox', { phone: true }), ['done', 'new', 'old']);
  assert.deepEqual(show(lib, 'p', { list: 'p' }), ['in-p']);
});
test('the Logbook and Trash sort by completion and trash time', () => {
  const lib = library(
    record('early', { completed: true, completedAt: 10 }),
    record('late', { completed: true, completedAt: 20 }),
    record('lingering', { completed: true, completedAt: 30 }),
    record('t1', { trashed: true, trashedAt: 1 }),
    record('t2', { trashed: true, trashedAt: 2, completed: true }),
  );
  assert.deepEqual(show(lib, 'logbook', { lingering: { lingering: true } }), [
    'late',
    'early',
  ]);
  assert.deepEqual(show(lib, 'trash'), ['t2', 't1']);
});
test('the Logbook groups by completion day; other views have one group', () => {
  const today = new Date(2026, 10, 15, 12).getTime();
  const tasks = [
    record('a', { completed: true, completedAt: today }),
    record('b', { completed: true, completedAt: today - 60000 }),
    record('c', { completed: true, completedAt: today - DAY }),
  ];
  assert.deepEqual(
    groupTasks(tasks, 'logbook').map((g) => g.tasks.map((t) => t.id)),
    [['a', 'b'], ['c']],
  );
  assert.deepEqual(
    groupTasks(tasks, 'inbox').map((g) => g.key),
    ['inbox'],
  );
  assert.deepEqual(groupTasks([], 'inbox'), []);
});
test('epics belong to their project, and a project can show one epic alone', () => {
  const lib = library(
    record('p', { kind: 'project' }),
    record('q', { kind: 'project' }),
    record('later', { kind: 'epic', list: 'p', created: 2 }),
    record('first', { kind: 'epic', list: 'p', created: 1 }),
    record('other', { kind: 'epic', list: 'q' }),
    record('gone', { kind: 'epic', list: 'p', deleted: true }),
    record('a', { list: 'p', epic: 'first', created: 3 }),
    record('b', { list: 'p', epic: 'later', created: 2 }),
    record('stale', { list: 'p', epic: 'gone', created: 1 }),
    record('moved', { list: 'q', epic: 'first' }),
  );
  assert.deepEqual(
    lib.epicsOf('p').map((e) => e.id),
    ['first', 'later'],
  );
  assert.equal(
    lib.epicOf(record('x', { list: 'p', epic: 'first' })).id,
    'first',
  );
  assert.equal(lib.epicOf(record('x', { list: 'p', epic: 'gone' })), undefined);
  assert.equal(
    lib.epicOf(record('x', { list: 'q', epic: 'first' })),
    undefined,
  );
  assert.deepEqual(lib.todos.map((t) => t.id).sort(), [
    'a',
    'b',
    'moved',
    'stale',
  ]);
  assert.deepEqual(show(lib, 'p', { list: 'p' }), ['a', 'b', 'stale']);
  assert.deepEqual(show(lib, 'p', { list: 'p', epic: 'first' }), ['a']);
  assert.deepEqual(show(lib, 'p', { list: 'p', epic: 'first', editing: 'b' }), [
    'a',
    'b',
  ]);
});
test('sections belong to their project in the order they were added', () => {
  const lib = library(
    record('p', { kind: 'project' }),
    record('later', { kind: 'section', list: 'p', created: 2 }),
    record('first', { kind: 'section', list: 'p', created: 1 }),
    record('other', { kind: 'section', list: 'q' }),
    record('gone', { kind: 'section', list: 'p', deleted: true }),
    record('t', { list: 'p' }),
  );
  assert.deepEqual(
    lib.sectionsOf('p').map((s) => s.id),
    ['first', 'later'],
  );
  assert.deepEqual(Object.keys(lib.lists), ['p']);
  assert.deepEqual(
    lib.todos.map((t) => t.id),
    ['t'],
  );
});
test('a project groups by section after to-dos in none, keeping empty sections', () => {
  const sections = [
    record('s1', { kind: 'section', list: 'p' }),
    record('s2', { kind: 'section', list: 'p' }),
  ];
  const tasks = [
    record('a', { list: 'p', section: 's2' }),
    record('b', { list: 'p' }),
    record('c', { list: 'p', section: 'stale' }),
  ];
  const groups = groupTasks(tasks, 'p', sections);
  assert.deepEqual(
    groups.map((g) => [g.key, g.section?.id, g.tasks.map((t) => t.id)]),
    [
      ['none', undefined, ['b', 'c']],
      ['s1', 's1', []],
      ['s2', 's2', ['a']],
    ],
  );
  assert.deepEqual(
    groupTasks([tasks[0]], 'p', sections).map((g) => g.key),
    ['s1', 's2'],
  );
});
test('Today shows to-dos due today or overdue, and the goal keeps its completed ones', () => {
  const lib = library(
    record('overdue', { date: '2026-03-08', created: 1 }),
    record('due', { date: '2026-03-10', created: 2 }),
    record('later', { date: '2026-03-11' }),
    record('none'),
    record('done', { date: '2026-03-10', completed: true }),
    record('trashed', { date: '2026-03-09', trashed: true }),
    record('blank', { date: '2026-03-09', title: ' ' }),
    record('picked', { planned: '2026-03-10', completed: true }),
    record('stale', { planned: '2026-03-09' }),
  );
  assert.deepEqual(show(lib, 'today'), ['due', 'blank', 'overdue']);
  assert.deepEqual(show(lib, 'today', { lingering: { done: true } }), [
    'due',
    'blank',
    'done',
    'overdue',
  ]);
  assert.deepEqual(show(lib, 'goal'), ['picked']);
  const day = dayPlan(lib, '2026-03-10');
  assert.deepEqual(
    day.due.map((t) => t.id),
    ['overdue', 'due'],
  );
  assert.deepEqual(
    day.goal.map((t) => t.id),
    ['picked'],
  );
});
test('Today groups to-dos by list in sidebar order, skipping empty lists', () => {
  const lib = library(
    record('area', { kind: 'area' }),
    record('in-area', { kind: 'project', list: 'area', created: 2 }),
    record('loose', { kind: 'project', created: 1 }),
    record('empty', { kind: 'project', created: 3 }),
    record('a', { list: 'in-area' }),
    record('b', { list: 'area' }),
    record('c'),
    record('d', { list: 'loose' }),
  );
  assert.deepEqual(lib.order, ['', 'empty', 'loose', 'area', 'in-area']);
  const groups = groupByList(lib.todos, lib);
  assert.deepEqual(
    groups.map((g) => [g.list, g.tasks.map((t) => t.id)]),
    [
      ['', ['c']],
      ['loose', ['d']],
      ['area', ['b']],
      ['in-area', ['a']],
    ],
  );
});
