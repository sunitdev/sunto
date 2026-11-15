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
    if (command === 'exchange') {
      exports++;
      assert.equal(JSON.parse(saved).version, 1);
      return { files: JSON.parse(data).map((c) => JSON.stringify(c)) };
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
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL));
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
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL));
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
    .replace(/(['"])\.\/driver\1/, JSON.stringify(driverURL));
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
  await store.deleteProject(project);
  let { tasks } = store.getSnapshot().state;
  assert.equal(tasks[project].deleted, true);
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
