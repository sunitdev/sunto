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
