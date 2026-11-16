import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// The app's own model, standing in for another device in the folder.
const bundled = await build({
  entryPoints: [
    new URL('../../../packages/app/src/storage/model.ts', import.meta.url)
      .pathname,
  ],
  bundle: true,
  write: false,
  format: 'esm',
});
const model = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundled.outputFiles[0].text).toString('base64')
);

const temp = mkdtempSync(join(tmpdir(), 'sunto-mcp-'));
const folder = join(temp, 'Sunto');
const devices = join(folder, 'sunto-devices-v2');
mkdirSync(devices, { recursive: true });
let app = model.emptyState();
const writeApp = () =>
  writeFileSync(
    join(devices, `${app.device}.json`),
    JSON.stringify({ ...app, saved: Date.now() }),
  );
// What the app sees after its next sync of the folder.
const appSync = () => {
  const files = readdirSync(devices)
    .filter((f) => f.endsWith('.json') && f !== `${app.device}.json`)
    .map((f) => readFileSync(join(devices, f), 'utf8'));
  const result = model.reconcile(app, { files }, Date.now());
  assert.deepEqual(result.failures, []);
  app = result.state;
  return app;
};

async function connect(env) {
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [new URL('../dist/server.mjs', import.meta.url).pathname],
      env: {
        ...process.env,
        SUNTO_FOLDER: folder,
        SUNTO_MCP_HOME: join(temp, 'home'),
        ...env,
      },
    }),
  );
  return {
    client,
    async call(name, args = {}) {
      const r = await client.callTool({ name, arguments: args });
      if (r.isError) throw Error(r.content[0].text);
      return JSON.parse(r.content[0].text);
    },
  };
}

const project = crypto.randomUUID();
const area = crypto.randomUUID();
app = model.mutate(app, area, { kind: 'area', title: 'Home', created: 1 });
app = model.mutate(app, project, {
  kind: 'project',
  list: area,
  title: 'Garden',
  created: 2,
});
writeApp();
const sunto = await connect();
test.after(async () => {
  await sunto.client.close();
  rmSync(temp, { recursive: true, force: true });
});

test('the overview shows the lists other devices made', async () => {
  const o = await sunto.call('sunto_overview');
  assert.match(o.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(o.areas[0].title, 'Home');
  assert.equal(o.areas[0].projects[0].id, project);
  const { tools } = await sunto.client.listTools();
  assert.equal(tools.length, 12);
});

test('added to-dos reach the app through the folder, and invalid ones are refused', async () => {
  await assert.rejects(
    sunto.call('sunto_add_todos', { todos: [{ title: 'x', list: 'missing' }] }),
    /No project or area with id missing/,
  );
  await assert.rejects(
    sunto.call('sunto_add_todos', {
      todos: [{ title: 'x', repeat: { freq: 'daily' } }],
    }),
    /needs a date/,
  );
  const { added } = await sunto.call('sunto_add_todos', {
    todos: [
      {
        title: 'Water plants',
        list: project,
        date: '2026-11-16',
        repeat: { freq: 'weekly', interval: 1 },
      },
      { title: 'Buy milk', plannedToday: true },
    ],
  });
  assert.equal(added[0].list, 'Garden');
  assert.deepEqual(added[0].repeat, { freq: 'weekly', interval: 1 });
  assert.equal(added[1].list, 'Inbox');
  const seen = appSync();
  assert.equal(seen.tasks[added[0].id].title, 'Water plants');
  assert.equal(seen.tasks[added[1].id].planned, added[1].planned);
  const inbox = await sunto.call('sunto_list_todos', { view: 'inbox' });
  assert.deepEqual(
    inbox.todos.map((t) => t.title),
    ['Buy milk'],
  );
});

test('edits made in the app win over older ones, and the server builds on them', async () => {
  const [plants] = (await sunto.call('sunto_search', { query: 'plants' }))
    .todos;
  app = model.mutate(app, plants.id, { notes: 'Use rainwater' });
  writeApp();
  assert.equal(
    (await sunto.call('sunto_get', { id: plants.id })).notes,
    'Use rainwater',
  );
  await sunto.call('sunto_update_todo', {
    id: plants.id,
    title: 'Water the plants',
  });
  const seen = appSync().tasks[plants.id];
  assert.equal(seen.title, 'Water the plants');
  assert.equal(seen.notes, 'Use rainwater');
});

test('moving a to-do past the day of its goal takes it out of the goal', async () => {
  const [milk] = (await sunto.call('sunto_search', { query: 'milk' })).todos;
  const goal = async () =>
    (await sunto.call('sunto_list_todos', { view: 'goal' })).todos.map(
      (t) => t.title,
    );
  await sunto.call('sunto_update_todo', { id: milk.id, date: milk.planned });
  assert.deepEqual(await goal(), ['Buy milk']);
  await sunto.call('sunto_update_todo', { id: milk.id, date: '2999-01-01' });
  assert.deepEqual(await goal(), []);
  assert.equal(appSync().tasks[milk.id].planned, '');
});

test('completing a repeating to-do adds the next one', async () => {
  const [plants] = (await sunto.call('sunto_search', { query: 'plants' }))
    .todos;
  await sunto.call('sunto_complete_todos', { ids: [plants.id] });
  const open = await sunto.call('sunto_list_todos', {
    view: 'list',
    list: project,
  });
  assert.deepEqual(
    open.todos.map((t) => [t.title, t.date]),
    [['Water the plants', '2026-11-23']],
  );
  const done = await sunto.call('sunto_list_todos', { view: 'logbook' });
  assert.equal(done.todos[0].id, plants.id);
});

test('to-dos are deleted only from Trash, and deleting a list trashes its to-dos', async () => {
  const [milk] = (await sunto.call('sunto_search', { query: 'milk' })).todos;
  await assert.rejects(
    sunto.call('sunto_delete_todos', { ids: [milk.id] }),
    /not in Trash/,
  );
  await sunto.call('sunto_trash_todos', { ids: [milk.id] });
  await sunto.call('sunto_delete_todos', { ids: [milk.id] });
  await assert.rejects(
    sunto.call('sunto_get', { id: milk.id }),
    /Nothing with id/,
  );
  await sunto.call('sunto_delete_list', { id: project });
  const trash = await sunto.call('sunto_list_todos', { view: 'trash' });
  // The completed one and its next occurrence.
  assert.deepEqual(
    trash.todos.map((t) => [t.title, t.deletedFrom]),
    [
      ['Water the plants', 'Garden'],
      ['Water the plants', 'Garden'],
    ],
  );
  // The app drops the tombstone once every device has it.
  const gone = appSync().tasks[project];
  assert.ok(!gone || gone.deleted);
});

test('lists can be added, changed and moved between areas', async () => {
  const { added } = await sunto.call('sunto_add_list', {
    kind: 'project',
    title: 'Trip',
    parent: area,
    icon: '✈️',
  });
  const { added: epic } = await sunto.call('sunto_add_list', {
    kind: 'epic',
    title: 'Flights',
    parent: added.id,
  });
  assert.equal(epic.color, '#EF4444');
  await assert.rejects(
    sunto.call('sunto_update_list', { id: epic.id, kanban: true }),
    /Only a project can be a board/,
  );
  await sunto.call('sunto_update_list', {
    id: added.id,
    area: '',
    kanban: true,
  });
  const o = await sunto.call('sunto_overview');
  assert.equal(o.projects[0].title, 'Trip');
  assert.equal(o.projects[0].kanban, true);
  assert.equal(o.projects[0].epics[0].title, 'Flights');
});

test('files iCloud has not downloaded yet stop the server until they arrive', async () => {
  const placeholder = join(devices, '.other.json.icloud');
  writeFileSync(placeholder, '');
  await assert.rejects(sunto.call('sunto_overview'), /still downloading/);
  rmSync(placeholder);
  await sunto.call('sunto_overview');
});

test('a missing sync folder is reported', async () => {
  const other = await connect({ SUNTO_FOLDER: join(temp, 'nowhere') });
  await assert.rejects(other.call('sunto_overview'), /No Sunto sync folder/);
  await other.client.close();
});
