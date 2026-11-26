// An MCP server over stdio that lets agents read and change Sunto's to-dos
// through the iCloud Drive sync folder.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { State } from '../../../packages/app/src/storage/model';
import type { Changes } from '../../../packages/app/src/storage/ops';
import { organize } from '../../../packages/app/src/storage/selectors';
import { defaultPaths, transact } from './folder';
import * as sunto from './sunto';

const paths = defaultPaths();
const server = new McpServer(
  { name: 'sunto', version: '0.1.0' },
  {
    instructions: `Sunto is the user's to-do app (Inbox, Today, Today's Goal, Logbook, Trash, and projects in areas, with sections and epics). Call sunto_overview first: it gives today's date and the ids of every area, project, section and epic, which other tools take. Dates are the user's local days as YYYY-MM-DD. Changes reach the Mac app within about ten seconds and the iPhone once iCloud syncs. sunto_delete_todos and sunto_delete_list cannot be undone, so confirm with the user before calling them.`,
  },
);

const id = z.string().min(1).max(100);
const ids = z.array(id).min(1).max(200);
const day = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/)
  .describe("A local day as YYYY-MM-DD, or '' for none");
const repeat = z
  .object({
    freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z
      .number()
      .int()
      .min(1)
      .max(99)
      .default(1)
      .describe('Every n days, weeks, months or years'),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .optional()
      .describe('Weekly only: days to repeat on, 0 is Sunday'),
    monthDay: z
      .number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe('Monthly only: day of the month'),
  })
  .nullable()
  .describe(
    'How the to-do repeats once completed; it needs a date. null stops repeating',
  );
const todoFields = {
  notes: z.string().optional(),
  section: z
    .string()
    .optional()
    .describe("A section id of the to-do's project, or '' for none"),
  epic: z
    .string()
    .optional()
    .describe("An epic id of the to-do's project, or '' for none"),
  date: day
    .optional()
    .describe("The day it is due as YYYY-MM-DD, or '' for none"),
  repeat: repeat.optional(),
  plannedToday: z
    .boolean()
    .optional()
    .describe("Whether it is picked for Today's Goal"),
};

const text = (value: unknown, failures: string[] = []) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(
        failures.length
          ? {
              ...(value as object),
              warning: `${failures.length} sync file(s) could not be read: ${failures[0]}`,
            }
          : value,
        null,
        1,
      ),
    },
  ],
});
// Runs a tool, reporting its error to the agent rather than failing the call.
async function tool(
  edit: (state: State) => Changes,
  reply: (state: State) => unknown,
) {
  try {
    const { state, failures } = await transact(paths, edit);
    return text(reply(state), failures);
  } catch (e) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: e instanceof Error ? e.message : String(e),
        },
      ],
    };
  }
}
const read = (reply: (state: State) => unknown) => tool(() => [], reply);
const todos = (state: State, list: string[]) => {
  const lib = organize(state);
  return list.map((i) => sunto.describe(lib, sunto.todo(state, i)));
};
const readOnly = { readOnlyHint: true, openWorldHint: false };
const writes = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

server.registerTool(
  'sunto_overview',
  {
    title: 'Sunto overview',
    description:
      "Today's date, Inbox and Today counts, and every area and project with its sections, epics and to-do counts. Call this first to find the ids other tools take.",
    annotations: readOnly,
  },
  () => read(sunto.overview),
);

server.registerTool(
  'sunto_list_todos',
  {
    title: 'List to-dos',
    description:
      "The to-dos a view of the app shows, in its order. inbox: open to-dos in no list. today: open to-dos due today or overdue. goal: to-dos picked for Today's Goal. logbook: completed, newest first. trash: trashed. list: the open to-dos of the project or area `list`.",
    inputSchema: {
      view: z.enum(['inbox', 'today', 'goal', 'logbook', 'trash', 'list']),
      list: id.optional().describe('The project or area id, for the list view'),
      epic: id
        .optional()
        .describe('Only this epic of the project, for the list view'),
      limit: z.number().int().min(1).max(500).default(100),
    },
    annotations: readOnly,
  },
  ({ view, list, epic, limit }) =>
    read((state) => sunto.listTodos(state, view, { list, epic, limit })),
);

server.registerTool(
  'sunto_search',
  {
    title: 'Search to-dos',
    description:
      'To-dos, projects and areas whose title or notes contain the text, ignoring case.',
    inputSchema: {
      query: z.string().min(1),
      includeDone: z
        .boolean()
        .default(false)
        .describe('Also search completed and trashed to-dos'),
    },
    annotations: readOnly,
  },
  ({ query, includeDone }) =>
    read((state) => sunto.search(state, query, includeDone)),
);

server.registerTool(
  'sunto_get',
  {
    title: 'Get item',
    description: 'One to-do, project, area, section or epic by id.',
    inputSchema: { id },
    annotations: readOnly,
  },
  ({ id }) => read((state) => sunto.get(state, id)),
);

server.registerTool(
  'sunto_add_todos',
  {
    title: 'Add to-dos',
    description:
      'Adds one or more to-dos, to the Inbox unless a list is given. Returns them with their new ids.',
    inputSchema: {
      todos: z
        .array(
          z.object({
            title: z.string().min(1),
            list: id
              .optional()
              .describe('A project or area id; omit for the Inbox'),
            ...todoFields,
          }),
        )
        .min(1)
        .max(100),
    },
    annotations: writes,
  },
  ({ todos: inputs }) => {
    const created: string[] = [];
    return tool(
      (state) => sunto.addTodos(state, inputs, created),
      (state) => ({ added: todos(state, created) }),
    );
  },
);

server.registerTool(
  'sunto_update_todo',
  {
    title: 'Update to-do',
    description:
      "Changes a to-do's fields; omitted fields stay as they are. Giving another list moves it there, out of its section and epic unless new ones are given.",
    inputSchema: {
      id,
      title: z.string().min(1).optional(),
      list: z
        .string()
        .optional()
        .describe("A project or area id, or '' for the Inbox"),
      ...todoFields,
    },
    annotations: { ...writes, idempotentHint: true },
  },
  ({ id, ...input }) =>
    tool(
      (state) => sunto.updateTodo(state, id, input),
      (state) => ({ updated: todos(state, [id])[0] }),
    ),
);

server.registerTool(
  'sunto_complete_todos',
  {
    title: 'Complete to-dos',
    description:
      'Marks to-dos completed, sending them to the Logbook, or open again. Completing a repeating to-do adds its next occurrence, unless forever is true.',
    inputSchema: {
      ids,
      completed: z.boolean().default(true),
      forever: z
        .boolean()
        .default(false)
        .describe(
          'Completes repeating to-dos without adding their next occurrence, ending the series',
        ),
    },
    annotations: { ...writes, idempotentHint: true },
  },
  ({ ids, completed, forever }) =>
    tool(
      (state) => sunto.completeTodos(state, ids, completed, forever),
      (state) => ({ updated: todos(state, ids) }),
    ),
);

server.registerTool(
  'sunto_trash_todos',
  {
    title: 'Trash to-dos',
    description:
      'Moves to-dos to Trash, or puts them back with trashed: false. Trash is emptied after three months.',
    inputSchema: { ids, trashed: z.boolean().default(true) },
    annotations: { ...writes, idempotentHint: true },
  },
  ({ ids, trashed }) =>
    tool(
      (state) => sunto.trashTodos(state, ids, trashed),
      (state) => ({ updated: todos(state, ids) }),
    ),
);

server.registerTool(
  'sunto_delete_todos',
  {
    title: 'Delete to-dos for good',
    description:
      'Permanently deletes to-dos that are already in Trash. This cannot be undone; confirm with the user first.',
    inputSchema: { ids },
    annotations: { ...writes, destructiveHint: true, idempotentHint: true },
  },
  ({ ids }) =>
    tool(
      (state) => sunto.deleteTodos(state, ids),
      () => ({ deleted: ids }),
    ),
);

const listFields = {
  notes: z.string().optional(),
  icon: z.string().max(16).optional().describe("An emoji, or '' for none"),
  kanban: z
    .boolean()
    .optional()
    .describe('Projects only: show as a board of sections'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe('Epics only: #RRGGBB'),
};

server.registerTool(
  'sunto_add_list',
  {
    title: 'Add list',
    description:
      'Adds a project (optionally in an area), an area, or a section or epic of a project. Returns it with its new id.',
    inputSchema: {
      kind: z.enum(['project', 'area', 'section', 'epic']),
      title: z.string().min(1),
      parent: id
        .optional()
        .describe("A project's area id, or a section's or epic's project id"),
      ...listFields,
    },
    annotations: writes,
  },
  ({ kind, parent, ...input }) => {
    const created = crypto.randomUUID();
    return tool(
      (state) => sunto.addList(state, kind, parent, input, created),
      (state) => ({ added: sunto.get(state, created) }),
    );
  },
);

server.registerTool(
  'sunto_update_list',
  {
    title: 'Update list',
    description:
      'Changes a project, area, section or epic; omitted fields stay as they are.',
    inputSchema: {
      id,
      title: z.string().min(1).optional(),
      area: z
        .string()
        .optional()
        .describe("Projects only: an area id, or '' for none"),
      ...listFields,
    },
    annotations: { ...writes, idempotentHint: true },
  },
  ({ id, ...input }) =>
    tool(
      (state) => sunto.updateList(state, id, input),
      (state) => ({ updated: sunto.get(state, id) }),
    ),
);

server.registerTool(
  'sunto_delete_list',
  {
    title: 'Delete list',
    description:
      "Permanently deletes a project, area, section or epic. A project's or area's to-dos move to Trash and an area's projects are kept; a section's or epic's to-dos stay in the project. This cannot be undone; confirm with the user first.",
    inputSchema: { id },
    annotations: { ...writes, destructiveHint: true },
  },
  ({ id }) =>
    tool(
      (state) => sunto.deleteList(state, id),
      () => ({ deleted: id }),
    ),
);

await server.connect(new StdioServerTransport());
