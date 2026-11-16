import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(
  new URL('../packages/app/src/storage/model.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  emptyState,
  mutate,
  merge,
  mergeSnapshot,
  reconcile,
  restore,
  retireAfter,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);
const now = Date.UTC(2026, 10, 16);
// A device's file in the sync folder.
const file = (s, saved = now) => JSON.stringify({ ...s, saved });
const device = (name) => ({ ...emptyState(), device: name });
// One sync of `s` against the files of `others`.
const sync = (s, ...others) =>
  reconcile(s, { files: others.map((o) => file(o)) }, now).state;
test('concurrent different-field edits converge in any order and repeats are harmless', () => {
  const initial = mutate(device('device-a'), 'task', {
    title: 'Original',
    notes: '',
    completed: false,
    created: 1,
  });
  const b0 = sync(device('device-b'), initial);
  const a = mutate(initial, 'task', { title: 'Edited' });
  const b = mutate(b0, 'task', { notes: 'Offline notes' });
  const ab = mergeSnapshot(a, JSON.parse(file(b)));
  const ba = mergeSnapshot(b, JSON.parse(file(a)));
  assert.deepEqual(ab.tasks, ba.tasks);
  assert.equal(ab.tasks.task.title, 'Edited');
  assert.equal(ab.tasks.task.notes, 'Offline notes');
  assert.deepEqual(mergeSnapshot(ab, JSON.parse(file(b))).tasks, ab.tasks);
});
test('concurrent same-field edits use deterministic device tie-break, logical clocks advance', () => {
  const s = mutate(device('a'), 'task', { title: 'Original' });
  const a = mutate(s, 'task', { title: 'A' });
  const b = mutate(sync(device('b'), s), 'task', { title: 'B' });
  assert.equal(sync(a, b).tasks.task.title, 'B');
  assert.deepEqual(sync(a, b).tasks, sync(b, a).tasks);
  assert.equal(mutate(sync(a, b), 'task', { notes: 'Next' }).clock, 3);
});
test('deletion wins over a concurrent edit and keeps only its tombstone', () => {
  const first = mutate(device('a'), 'task', { title: 'Delete me', created: 1 });
  const offline = mutate(sync(device('b'), first), 'task', {
    title: 'Late edit',
    notes: 'Private notes',
  });
  const deleted = mutate(first, 'task', { deleted: true });
  // B has not seen the deletion, so A keeps a tombstone without the content.
  const merged = sync(deleted, offline);
  assert.equal(merged.tasks.task.deleted, true);
  assert.equal(merged.tasks.task.title, '');
  assert.deepEqual(Object.keys(merged.tasks.task.stamps), ['deleted']);
  // B's edit loses, and A already has the tombstone, so B drops the record.
  assert.equal(sync(offline, deleted).tasks.task, undefined);
  assert.equal(
    mutate(deleted, 'task', { title: 'Again' }).tasks.task.title,
    '',
  );
});
test('a device file stays the size of the data, however many edits were made', () => {
  let s = mutate(device('a'), 'task', { title: 'Draft 0', created: 1 });
  const once = file(s).length;
  for (let i = 1; i <= 1000; i++)
    s = mutate(s, 'task', { title: `Draft ${i % 10}` });
  assert.ok(file(s).length < once + 10);
  assert.equal(s.changes, undefined);
});
test('saved state round-trips, and a version 1 database migrates in any change order', () => {
  const s = mutate(
    mutate(device('a'), 'task', { title: 'T', created: 1 }),
    'gone',
    {
      title: 'G',
    },
  );
  assert.deepEqual(restore(JSON.stringify(s)), s);
  const changes = [
    {
      version: 1,
      id: 'c1',
      device: 'mac',
      task: 'task',
      revision: 1,
      patch: { title: 'Old', created: 1 },
    },
    {
      version: 1,
      id: 'c2',
      device: 'phone',
      task: 'task',
      revision: 2,
      patch: { title: 'New' },
    },
    {
      version: 1,
      id: 'c3',
      device: 'mac',
      task: 'task',
      revision: 3,
      patch: { notes: 'N' },
    },
    {
      version: 1,
      id: 'c4',
      device: 'mac',
      task: 'gone',
      revision: 4,
      patch: { title: 'X' },
    },
    {
      version: 1,
      id: 'c5',
      device: 'phone',
      task: 'gone',
      revision: 5,
      patch: { deleted: true },
    },
  ];
  const v1 = (list) =>
    JSON.stringify({
      version: 1,
      device: 'mac',
      clock: 5,
      tasks: {},
      changes: Object.fromEntries(list.map((c) => [c.id, c])),
    });
  const migrated = restore(v1(changes));
  assert.deepEqual(restore(v1(changes.toReversed())), migrated);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.device, 'mac');
  assert.equal(migrated.clock, 5);
  assert.equal(migrated.tasks.task.title, 'New');
  assert.equal(migrated.tasks.task.notes, 'N');
  assert.equal(migrated.tasks.gone.deleted, true);
  assert.throws(() => restore(JSON.stringify({ version: 3, device: 'x' })));
});
test('legacy change files are imported once and listed for removal', () => {
  const a = mutate(device('a'), 'mine', { title: 'Mine' });
  const legacy = [
    {
      version: 1,
      id: 'l1',
      device: 'old',
      task: 'theirs',
      revision: 7,
      patch: { title: 'Theirs' },
    },
    {
      version: 1,
      id: 'l2',
      device: 'a',
      task: 'mine',
      revision: 1,
      patch: { title: 'Mine' },
    },
  ].map((c) => JSON.stringify(c));
  const result = reconcile(a, { legacy: [...legacy, '{"version":1}'] }, now);
  assert.equal(result.state.tasks.theirs.title, 'Theirs');
  assert.equal(result.state.clock, 7);
  assert.deepEqual(result.imported, ['l1', 'l2']);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(
    reconcile(result.state, { legacy }, now).state,
    result.state,
  );
});
test('tombstones are removed once every device has them, and are not brought back', () => {
  const a0 = mutate(device('a'), 'task', { title: 'Delete me', created: 1 });
  const b0 = sync(device('b'), a0);
  const a1 = mutate(a0, 'task', { deleted: true });
  // B has not read A's deletion yet, so A keeps the tombstone.
  const a2 = sync(a1, b0);
  assert.equal(a2.tasks.task.deleted, true);
  // A third device that hasn't seen the deletion makes B keep it too.
  const c0 = sync(device('c'), a0);
  assert.equal(sync(b0, a2, c0).tasks.task.deleted, true);
  // A has the tombstone, so B needs none, and then A sees B has dropped it.
  const b1 = sync(b0, a2);
  assert.equal(b1.tasks.task, undefined);
  const a3 = sync(a2, b1);
  assert.equal(a3.tasks.task, undefined);
  // B's old live copy can't bring it back.
  assert.equal(sync(a3, b0).tasks.task, undefined);
  assert.equal(sync(sync(device('c'), b0), a3).tasks.task, undefined);
  // A device that never had the record ignores the tombstone's removal.
  assert.equal(sync(device('d'), a3).tasks.task, undefined);
});
test('tombstones stay while files are still downloading, unreadable or legacy', () => {
  const a = mutate(mutate(device('a'), 'task', { title: 'T' }), 'task', {
    deleted: true,
  });
  const legacy = JSON.stringify({
    version: 1,
    id: 'l',
    device: 'old',
    task: 'x',
    revision: 1,
    patch: { title: 'X' },
  });
  for (const folder of [
    { pending: true },
    { files: ['{}'] },
    { legacy: [legacy] },
  ])
    assert.equal(reconcile(a, folder, now).state.tasks.task.deleted, true);
  assert.equal(reconcile(a, {}, now).state.tasks.task, undefined);
});
test('devices silent for 90 days are retired without losing their data or resurrecting deletions', () => {
  const a0 = mutate(device('a'), 'task', { title: 'Shared', created: 1 });
  const laptop = mutate(sync(device('laptop'), a0), 'own', {
    title: 'Only on laptop',
  });
  const a1 = mutate(sync(a0, laptop), 'task', { deleted: true });
  const old = now - retireAfter - 1;
  const result = reconcile(a1, { files: [file(laptop, old)] }, now);
  assert.deepEqual(result.retired, ['laptop']);
  assert.equal(result.state.tasks.task, undefined);
  assert.equal(result.state.tasks.own.title, 'Only on laptop');
  assert.deepEqual(
    reconcile(a1, { files: [file(laptop, old)], pending: true }, now).retired,
    [],
  );
  // The laptop returns: its stale copy goes, and its offline work stays.
  const back = mutate(laptop, 'new', { title: 'Written offline' });
  const merged = sync(back, result.state);
  assert.equal(merged.tasks.task, undefined);
  assert.equal(merged.tasks.new.title, 'Written offline');
  assert.equal(sync(result.state, back).tasks.new.title, 'Written offline');
  assert.equal(sync(result.state, back).tasks.task, undefined);
});
test('malformed changes and files are rejected without changing state', () => {
  const s = mutate(device('a'), 'task', { title: 'Kept' });
  for (const c of [
    null,
    { version: 2 },
    {
      version: 1,
      id: 'id',
      device: 'd',
      task: 't',
      revision: 1,
      patch: { title: 5 },
    },
  ])
    assert.throws(() => merge(s, c));
  const valid = JSON.parse(file(mutate(device('b'), 'x', { title: 'X' })));
  for (const f of [
    { ...valid, version: 1 },
    { ...valid, device: '__proto__' },
    { ...valid, seen: { c: 0 } },
    { ...valid, tasks: { x: { ...valid.tasks.x, id: 'y' } } },
    { ...valid, tasks: { x: { ...valid.tasks.x, title: 5 } } },
    {
      ...valid,
      tasks: { x: { ...valid.tasks.x, stamps: { title: [99, 'b'] } } },
    },
    {
      ...valid,
      tasks: { x: { ...valid.tasks.x, stamps: { bogus: [1, 'b'] } } },
    },
  ])
    assert.throws(() => mergeSnapshot(s, f));
  assert.equal(mergeSnapshot(s, valid).tasks.x.title, 'X');
  assert.deepEqual(Object.keys(s.tasks), ['task']);
});
test('completion and trash fields validate their types and default for older tasks', () => {
  const legacy = mutate(emptyState(), 'task', { title: 'Old', created: 1 });
  assert.equal(legacy.tasks.task.completedAt, 0);
  assert.equal(legacy.tasks.task.trashed, false);
  const trashed = mutate(legacy, 'task', {
    completed: true,
    completedAt: 5,
    trashed: true,
    trashedAt: 6,
  });
  assert.equal(trashed.tasks.task.completedAt, 5);
  assert.equal(trashed.tasks.task.trashed, true);
  for (const patch of [
    { completedAt: true },
    { trashed: 1 },
    { trashedAt: '6' },
  ])
    assert.throws(() =>
      merge(legacy, {
        version: 1,
        id: 'id',
        device: 'd',
        task: 'task',
        revision: 9,
        patch,
      }),
    );
});
test('list fields validate their types and default older records to Inbox to-dos', () => {
  const legacy = mutate(emptyState(), 'task', { title: 'Old', created: 1 });
  assert.equal(legacy.tasks.task.kind, 'task');
  assert.equal(legacy.tasks.task.list, '');
  const project = mutate(legacy, 'project', { kind: 'project', icon: '🚀' });
  const moved = mutate(project, 'task', { list: 'project' });
  assert.equal(moved.tasks.project.kind, 'project');
  assert.equal(moved.tasks.task.list, 'project');
  assert.equal(moved.tasks.task.section, '');
  assert.equal(moved.tasks.project.kanban, false);
  const section = mutate(moved, 'section', {
    kind: 'section',
    list: 'project',
  });
  const sorted = mutate(
    mutate(section, 'task', { section: 'section' }),
    'project',
    {
      kanban: true,
    },
  );
  assert.equal(sorted.tasks.section.kind, 'section');
  assert.equal(sorted.tasks.task.section, 'section');
  assert.equal(sorted.tasks.project.kanban, true);
  const epic = mutate(sorted, 'epic', {
    kind: 'epic',
    list: 'project',
    color: '#0EA5E9',
  });
  const tagged = mutate(epic, 'task', { epic: 'epic' });
  assert.equal(tagged.tasks.epic.kind, 'epic');
  assert.equal(tagged.tasks.epic.color, '#0EA5E9');
  assert.equal(tagged.tasks.task.epic, 'epic');
  assert.equal(legacy.tasks.task.epic, '');
  assert.equal(legacy.tasks.task.color, '');
  for (const patch of [
    { kind: 'folder' },
    { list: null },
    { icon: 1 },
    { deletedFrom: false },
    { section: 1 },
    { kanban: 'yes' },
    { kind: 'tag' },
    { epic: 2 },
    { color: 'red' },
    { color: '#fff' },
    { color: '#12345g' },
  ])
    assert.throws(() =>
      merge(legacy, {
        version: 1,
        id: 'id',
        device: 'd',
        task: 'task',
        revision: 9,
        patch,
      }),
    );
});
