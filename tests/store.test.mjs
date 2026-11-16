import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = (text) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString('base64');
const modelURL = compile(
  readFileSync(
    new URL('../packages/app/src/storage/model.ts', import.meta.url),
    'utf8',
  ),
);
const datesURL = compile(
  readFileSync(
    new URL('../packages/app/src/storage/dates.ts', import.meta.url),
    'utf8',
  ),
);
test('failed local saves retain edits for retry, and export happens only after a successful save', async () => {
  let saved;
  let fail = false;
  let exports = 0;
  globalThis.suntoTestRequest = async (command, data) => {
    if (command === 'load') return { data: saved };
    if (command === 'save') {
      if (fail) throw Error('Disk full');
      saved = data;
      return {};
    }
    if (command === 'choose') return { folder: 'Sunto' };
    if (command === 'pull') return { files: [] };
    if (command === 'push') {
      exports++;
      assert.equal(JSON.parse(saved).version, 2);
      return {};
    }
    return {};
  };
  const driverURL = compile(
    'export const native = true; export const request = (command, data) => globalThis.suntoTestRequest(command, data);',
  );
  const source = readFileSync(
    new URL('../packages/app/src/storage/store.ts', import.meta.url),
    'utf8',
  )
    .replace(/(['"])\.\/model\1/, JSON.stringify(modelURL))
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL))
    .replace(/(['"])\.\/dates\1/, JSON.stringify(datesURL));
  const store = await import(compile(source));
  await store.start();
  await store.chooseFolder();
  const before = exports;
  fail = true;
  const id = await store.add();
  await store.update(id, { title: 'Must survive a failed save' });
  assert.equal(
    store.getSnapshot().state.tasks[id].title,
    'Must survive a failed save',
  );
  assert.match(store.getSnapshot().error, /Disk full/);
  await store.sync();
  assert.equal(exports, before);
  fail = false;
  await store.retry();
  assert.equal(store.getSnapshot().error, '');
  assert.equal(JSON.parse(saved).tasks[id].title, 'Must survive a failed save');
  assert.equal(exports, before + 1);
  delete globalThis.suntoTestRequest;
});
test('sync merges other devices and legacy files, then removes legacy files only after saving', async () => {
  let saved;
  const calls = [];
  const other = {
    version: 2,
    device: '8a3c9d8e-1111-4b6a-9d3e-000000000001',
    clock: 3,
    saved: Date.now(),
    seen: {},
    tasks: {
      remote: {
        id: 'remote',
        title: 'From the phone',
        stamps: { title: [3, '8a3c9d8e-1111-4b6a-9d3e-000000000001'] },
      },
    },
  };
  const legacy = {
    version: 1,
    id: '0e1a1add-90ad-4ef8-87b2-14f53112ac9c',
    device: '1582a77a-e9ae-4db8-86ac-9a6133020af5',
    task: 'old',
    revision: 21,
    patch: { title: 'Project 1', kind: 'project' },
  };
  globalThis.suntoTestRequest = async (command, data) => {
    calls.push(command);
    if (command === 'load') return { data: saved };
    if (command === 'save') saved = data;
    if (command === 'choose') return { folder: 'Sunto' };
    if (command === 'pull')
      return {
        files: [JSON.stringify(other)],
        legacy: [JSON.stringify(legacy)],
      };
    if (command === 'push') {
      const push = JSON.parse(data);
      const snapshot = JSON.parse(push.snapshot);
      assert.equal(push.device, snapshot.device);
      assert.deepEqual(push.legacy, [legacy.id]);
      assert.deepEqual(push.retired, []);
      assert.equal(snapshot.tasks.remote.title, 'From the phone');
      assert.equal(snapshot.tasks.old.title, 'Project 1');
      assert.equal(typeof snapshot.saved, 'number');
      assert.deepEqual(JSON.parse(saved).tasks, snapshot.tasks);
    }
    return {};
  };
  const driverURL = compile(
    'export const native = true; export const request = (command, data) => globalThis.suntoTestRequest(command, data);',
  );
  const source = readFileSync(
    new URL('../packages/app/src/storage/store.ts', import.meta.url),
    'utf8',
  )
    .replace(/(['"])\.\/model\1/, JSON.stringify(modelURL))
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL))
    .replace(/(['"])\.\/dates\1/, JSON.stringify(datesURL));
  const store = await import(compile(source + '\n// sync test instance'));
  await store.start();
  await store.chooseFolder();
  assert.deepEqual(calls.slice(-4), ['save', 'pull', 'save', 'push']);
  const { state } = store.getSnapshot();
  assert.equal(state.tasks.remote.title, 'From the phone');
  assert.equal(state.tasks.old.kind, 'project');
  assert.equal(state.seen[other.device], 3);
  assert.equal(state.clock, 21);
  delete globalThis.suntoTestRequest;
});
test('trash purges to-dos trashed more than three months ago', async () => {
  let saved;
  globalThis.suntoTestRequest = async (command, data) => {
    if (command === 'save') saved = data;
    return command === 'load' ? { data: saved } : {};
  };
  const driverURL = compile(
    'export const native = false; export const request = (command, data) => globalThis.suntoTestRequest(command, data);',
  );
  const source = readFileSync(
    new URL('../packages/app/src/storage/store.ts', import.meta.url),
    'utf8',
  )
    .replace(/(['"])\.\/model\1/, JSON.stringify(modelURL))
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL))
    .replace(/(['"])\.\/dates\1/, JSON.stringify(datesURL));
  const store = await import(compile(source + '\n// purge test instance'));
  await store.start();
  const old = await store.add();
  const recent = await store.add();
  const kept = await store.add();
  const fourMonthsAgo = new Date();
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
  await store.update(old, { trashed: true, trashedAt: +fourMonthsAgo });
  await store.update(recent, { trashed: true, trashedAt: Date.now() - 1000 });
  await store.purgeTrash();
  const { tasks } = store.getSnapshot().state;
  assert.equal(tasks[old].deleted, true);
  assert.equal(tasks[recent].deleted, false);
  assert.equal(tasks[kept].deleted, false);
  assert.equal(JSON.parse(saved).tasks[old].deleted, true);
});
test('deleting a project trashes its to-dos, and Put Back returns them to the Inbox', async () => {
  let saved;
  globalThis.suntoTestRequest = async (command, data) => {
    if (command === 'save') saved = data;
    return command === 'load' ? { data: saved } : {};
  };
  const driverURL = compile(
    'export const native = false; export const request = (command, data) => globalThis.suntoTestRequest(command, data);',
  );
  const source = readFileSync(
    new URL('../packages/app/src/storage/store.ts', import.meta.url),
    'utf8',
  )
    .replace(/(['"])\.\/model\1/, JSON.stringify(modelURL))
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL))
    .replace(/(['"])\.\/dates\1/, JSON.stringify(datesURL));
  const store = await import(compile(source + '\n// project test instance'));
  await store.start();
  const project = await store.addList('project');
  await store.update(project, { title: 'Trip' });
  const open = await store.add(project);
  const trashed = await store.add(project);
  const blank = await store.add(project);
  const inbox = await store.add();
  await store.update(open, { title: 'Book flights' });
  await store.update(trashed, {
    title: 'Old idea',
    trashed: true,
    trashedAt: 5,
  });
  const section = await store.addList('section', project);
  await store.update(open, { section });
  await store.deleteList(project);
  let { tasks } = store.getSnapshot().state;
  assert.equal(tasks[project].deleted, true);
  assert.equal(tasks[section].deleted, true);
  assert.equal(tasks[open].section, '');
  assert.equal(tasks[open].trashed, true);
  assert.equal(tasks[open].list, '');
  assert.equal(tasks[open].deletedFrom, 'Trip');
  assert.equal(tasks[trashed].trashedAt, 5);
  assert.equal(tasks[blank].deleted, true);
  assert.equal(tasks[inbox].trashed, false);
  await store.setTrashed(open, false);
  ({ tasks } = store.getSnapshot().state);
  assert.equal(tasks[open].trashed, false);
  assert.equal(tasks[open].deletedFrom, '');
});
test('deleting a section keeps its to-dos in the project, and moving a to-do leaves its section', async () => {
  let saved;
  globalThis.suntoTestRequest = async (command, data) => {
    if (command === 'save') saved = data;
    return command === 'load' ? { data: saved } : {};
  };
  const driverURL = compile(
    'export const native = false; export const request = (command, data) => globalThis.suntoTestRequest(command, data);',
  );
  const source = readFileSync(
    new URL('../packages/app/src/storage/store.ts', import.meta.url),
    'utf8',
  )
    .replace(/(['"])\.\/model\1/, JSON.stringify(modelURL))
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL))
    .replace(/(['"])\.\/dates\1/, JSON.stringify(datesURL));
  const store = await import(compile(source + '\n// section test instance'));
  await store.start();
  const project = await store.addList('project');
  const section = await store.addList('section', project);
  const kept = await store.add(project, section);
  const moved = await store.add(project, section);
  let { tasks } = store.getSnapshot().state;
  assert.equal(tasks[section].kind, 'section');
  assert.equal(tasks[section].list, project);
  assert.equal(tasks[kept].section, section);
  await store.move(moved, '');
  await store.deleteSection(section);
  ({ tasks } = store.getSnapshot().state);
  assert.equal(tasks[section].deleted, true);
  assert.equal(tasks[kept].list, project);
  assert.equal(tasks[kept].section, '');
  assert.equal(tasks[moved].list, '');
  assert.equal(tasks[moved].section, '');
});
test('completing a repeating to-do adds the next one, and the day plan replaces the last', async () => {
  let saved;
  globalThis.suntoTestRequest = async (command, data) => {
    if (command === 'save') saved = data;
    return command === 'load' ? { data: saved } : {};
  };
  const driverURL = compile(
    'export const native = false; export const request = (command, data) => globalThis.suntoTestRequest(command, data);',
  );
  const source = readFileSync(
    new URL('../packages/app/src/storage/store.ts', import.meta.url),
    'utf8',
  )
    .replace(/(['"])\.\/model\1/, JSON.stringify(modelURL))
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL))
    .replace(/(['"])\.\/dates\1/, JSON.stringify(datesURL));
  const store = await import(compile(source + '\n// repeat test instance'));
  await store.start();
  const repeat = JSON.stringify({ freq: 'daily', interval: 2 });
  const water = await store.add('', '', {
    title: 'Water the plants',
    date: '2026-03-10',
    repeat,
    planned: '2026-03-10',
  });
  const once = await store.add('', '', { title: 'Once', date: '2026-03-10' });
  await store.setCompleted(water, true);
  await store.setCompleted(once, true);
  let { tasks } = store.getSnapshot().state;
  assert.equal(tasks[water].completed, true);
  assert.equal(tasks[water].repeat, '');
  const next = Object.values(tasks).filter(
    (t) => t.title === 'Water the plants' && !t.completed,
  );
  assert.equal(next.length, 1);
  assert.equal(next[0].date, '2026-03-12');
  assert.equal(next[0].repeat, repeat);
  assert.equal(next[0].planned, '');
  assert.equal(next[0].created, tasks[water].created);
  assert.equal(
    Object.values(tasks).filter((t) => t.title === 'Once').length,
    1,
  );
  await store.setPlan('2026-03-12', [next[0].id]);
  await store.setPlan('2026-03-10', [once]);
  ({ tasks } = store.getSnapshot().state);
  assert.equal(tasks[water].planned, '');
  assert.equal(tasks[once].planned, '2026-03-10');
  assert.equal(tasks[next[0].id].planned, '2026-03-12');
});
test('epics take colours in turn, and a to-do leaves its epic when deleted, moved or its project is deleted', async () => {
  let saved;
  globalThis.suntoTestRequest = async (command, data) => {
    if (command === 'save') saved = data;
    return command === 'load' ? { data: saved } : {};
  };
  const driverURL = compile(
    'export const native = false; export const request = (command, data) => globalThis.suntoTestRequest(command, data);',
  );
  const source = readFileSync(
    new URL('../packages/app/src/storage/store.ts', import.meta.url),
    'utf8',
  )
    .replace(/(['"])\.\/model\1/, JSON.stringify(modelURL))
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL))
    .replace(/(['"])\.\/dates\1/, JSON.stringify(datesURL));
  const store = await import(compile(source + '\n// epic test instance'));
  await store.start();
  const project = await store.addList('project');
  const first = await store.addEpic(project);
  const second = await store.addEpic(project);
  const kept = await store.add(project, '', { epic: first });
  const moved = await store.add(project, '', { epic: first });
  const repeating = await store.add(project, '', {
    title: 'Water plants',
    epic: second,
    date: '2026-03-10',
    repeat: JSON.stringify({ freq: 'daily', interval: 1 }),
  });
  let { tasks } = store.getSnapshot().state;
  assert.equal(tasks[first].kind, 'epic');
  assert.equal(tasks[first].list, project);
  assert.equal(tasks[first].color, store.epicColors[0]);
  assert.equal(tasks[second].color, store.epicColors[1]);
  await store.setCompleted(repeating, true);
  ({ tasks } = store.getSnapshot().state);
  const next = Object.values(tasks).find(
    (t) => t.id !== repeating && t.title === 'Water plants',
  );
  assert.equal(next.epic, second);
  await store.move(moved, '');
  await store.deleteEpic(first);
  ({ tasks } = store.getSnapshot().state);
  assert.equal(tasks[first].deleted, true);
  assert.equal(tasks[kept].epic, '');
  assert.equal(tasks[kept].list, project);
  assert.equal(tasks[moved].epic, '');
  await store.update(kept, { title: 'Kept', epic: second });
  await store.deleteList(project);
  ({ tasks } = store.getSnapshot().state);
  assert.equal(tasks[second].deleted, true);
  assert.equal(tasks[kept].trashed, true);
  assert.equal(tasks[kept].epic, '');
});
