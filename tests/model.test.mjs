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
const { emptyState, mutate, merge, restore } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);
const change = (s) => Object.values(s.changes).at(-1);
test('concurrent different-field edits converge in any order and duplicates are harmless', () => {
  const initial = mutate(emptyState(), 'task', {
    title: 'Original',
    notes: '',
    completed: false,
    created: 1,
  });
  const a = mutate({ ...initial, device: 'device-a' }, 'task', {
    title: 'Edited',
  });
  const b = mutate({ ...initial, device: 'device-b' }, 'task', {
    notes: 'Offline notes',
  });
  const ab = merge(a, change(b));
  const ba = merge(b, change(a));
  assert.deepEqual(ab.tasks, ba.tasks);
  assert.equal(ab.tasks.task.title, 'Edited');
  assert.equal(ab.tasks.task.notes, 'Offline notes');
  assert.equal(merge(ab, change(b)), ab);
});
test('concurrent same-field edits use deterministic device tie-break, logical clocks advance', () => {
  const s = mutate(emptyState(), 'task', { title: 'Original' });
  const a = mutate({ ...s, device: 'a' }, 'task', { title: 'A' });
  const b = mutate({ ...s, device: 'b' }, 'task', { title: 'B' });
  assert.equal(merge(a, change(b)).tasks.task.title, 'B');
  assert.deepEqual(merge(a, change(b)).tasks, merge(b, change(a)).tasks);
  assert.equal(mutate(merge(a, change(b)), 'task', { notes: 'Next' }).clock, 3);
});
test('tombstones survive late edits and out-of-order replay after restart', () => {
  const first = mutate(emptyState(), 'task', {
    title: 'Delete me',
    created: 1,
  });
  const deleted = mutate(first, 'task', { deleted: true });
  const offline = mutate({ ...first, device: 'offline' }, 'task', {
    title: 'Late edit',
  });
  const combined = merge(deleted, change(offline));
  assert.equal(combined.tasks.task.deleted, true);
  const reversed = {
    ...combined,
    changes: Object.fromEntries(Object.entries(combined.changes).reverse()),
  };
  assert.deepEqual(restore(JSON.stringify(reversed)).tasks, combined.tasks);
});
test('malformed and future changes are rejected without changing state', () => {
  const s = emptyState();
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
  assert.deepEqual(s.tasks, {});
});
test('native JSON key ordering does not turn duplicate changes into conflicts', () => {
  const s = mutate(emptyState(), 'task', { notes: 'N', title: 'T' });
  const c = change(s);
  const reordered = {
    patch: { title: 'T', notes: 'N' },
    task: c.task,
    revision: c.revision,
    id: c.id,
    device: c.device,
    version: 1,
  };
  assert.equal(merge(s, reordered), s);
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
