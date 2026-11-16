import { useCallback, useState, useSyncExternalStore } from 'react';
import * as store from './storage/store';
import { native } from './storage/driver';
import type { Task } from './storage/model';
import { dayKey } from './storage/dates';
import {
  completedTime,
  dayPlan,
  groupByList,
  groupTasks,
  organize,
  visibleTasks,
} from './storage/selectors';
import { useDailyTarget } from './hooks/useDailyTarget';
import { useEditor } from './hooks/useEditor';
import { usePhone } from './hooks/usePhone';
import { useSync } from './hooks/useSync';
import { useTaskKeyboard } from './hooks/useTaskKeyboard';
import {
  dayName,
  empties,
  isStatic,
  titles,
  untitled,
  type StaticView,
  type View,
} from './views';
import { AreaProjects } from './components/AreaProjects';
import { Board } from './components/Board';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenu } from './components/ContextMenu';
import { DatePopover } from './components/DatePopover';
import { EpicBar } from './components/EpicBar';
import { Footer } from './components/Footer';
import { GoalCard, Planner, PlanPrompt } from './components/Goal';
import { InboxIcon, ToolbarIcon, ViewIcon } from './components/icons';
import { ListHeader } from './components/ListHeader';
import { MovePopover } from './components/MovePopover';
import { Settings, Welcome } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { TaskList } from './components/TaskList';

export function App() {
  const { state, ready, error, folder } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const phone = usePhone();
  const [selectedView, setSelectedView] = useState<View>('inbox');
  // The phone shows one screen at a time, starting with its lists.
  const [home, setHome] = useState(true);
  const atHome = phone && home;
  const { editing, setEditing, closeEditor, editorArea, footer, addButton } =
    useEditor();
  const [lingering, setLingering] = useState<Record<string, true>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // The edited to-do's list, date and epic pickers, and the bounds of the
  // button opening each.
  const [moving, setMoving] = useState<DOMRect | null>(null);
  const [dating, setDating] = useState<DOMRect | null>(null);
  const [picking, setPicking] = useState<DOMRect | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeMove = useCallback(() => setMoving(null), []);
  const closeDate = useCallback(() => setDating(null), []);
  const closeEpic = useCallback(() => setPicking(null), []);
  // The pickers close with the editor, so they can't reopen with the next one.
  const [movingFor, setMovingFor] = useState(editing);
  if (movingFor !== editing) {
    setMovingFor(editing);
    setMoving(null);
    setDating(null);
    setPicking(null);
  }
  // The epic each project shows alone, if any.
  const [epicFilter, setEpicFilter] = useState<Record<string, string>>({});
  // The to-dos picked while planning the day, before they are saved.
  const [planning, setPlanning] = useState<string[] | null>(null);
  const [target, setTarget] = useDailyTarget();
  const today = dayKey();
  const library = organize(state);
  const { projects, lists, todos, sectionsOf, epicsOf, areaOf, progress } =
    library;
  const day = dayPlan(library, today);
  const view: View =
    isStatic(selectedView) || lists[selectedView] ? selectedView : 'inbox';
  const openList = isStatic(view) ? undefined : lists[view];
  const project = openList?.kind === 'project' ? openList : undefined;
  const epic =
    project && epicsOf(project.id).some((e) => e.id === epicFilter[project.id])
      ? epicFilter[project.id]
      : '';
  const tasks =
    view === 'settings'
      ? []
      : visibleTasks(library, view, {
          list: openList?.id ?? '',
          epic,
          today,
          editing,
          lingering,
        });
  // The native apps keep their to-dos in a sync folder, which they need first.
  const welcome = native && ready && !folder;
  // Today's Goal shows its to-dos once the day is planned.
  const planned = view === 'goal' && !planning && day.goal.length > 0;
  const groups = (
    view === 'today' || planned
      ? groupByList(tasks, library)
      : view === 'goal'
        ? []
        : groupTasks(tasks, view, project ? sectionsOf(project.id) : [])
  ).map((group) => ({
    ...group,
    label:
      view === 'logbook' ? dayName(completedTime(group.tasks[0]), false) : '',
  }));
  // The to-dos in display order, which sections change.
  const shown = groups.flatMap((g) => g.tasks);
  useSync();
  // Selects the neighbouring to-do so repeated deletes keep working.
  function leave(task: Task) {
    const i = shown.findIndex((t) => t.id === task.id);
    setSelected((shown[i + 1] ?? shown[i - 1])?.id ?? null);
  }
  // In Trash, deleting is permanent; elsewhere it moves the to-do to Trash.
  function remove(task: Task) {
    leave(task);
    void (view === 'trash'
      ? store.update(task.id, { deleted: true })
      : store.setTrashed(task.id, true));
  }
  function putBack(task: Task) {
    leave(task);
    void store.setTrashed(task.id, false);
  }
  useTaskKeyboard({
    tasks: shown,
    selected,
    select: setSelected,
    paused: !!editing || !!menu || (view === 'goal' && !!planning) || welcome,
    remove,
    edit: setEditing,
  });
  function openEditor(task: Task) {
    if (editing) closeEditor();
    setSelected(task.id);
    setEditing(task.id);
  }
  function toggle(task: Task) {
    const completed = !task.completed;
    void store.setCompleted(task.id, completed);
    // Completed to-dos stay briefly in their list before moving to the Logbook.
    const linger =
      completed &&
      (view === 'inbox' || view === 'today' || !!openList) &&
      !task.trashed;
    setLinger(task.id, linger);
    if (linger) setTimeout(() => setLinger(task.id, false), 900);
  }
  function setLinger(id: string, on: boolean) {
    setLingering((current) => {
      const next = { ...current };
      if (on) next[id] = true;
      else delete next[id];
      return next;
    });
  }
  function showView(next: View) {
    if (editing) closeEditor();
    setSelected(null);
    setSelectedView(next);
    setHome(false);
  }
  function goHome() {
    if (editing) closeEditor();
    setSelected(null);
    setPlanning(null);
    setHome(true);
  }
  async function addTask(section = '') {
    // New to-dos join the open project or area; elsewhere they go to the
    // Inbox. In Today they are due today, and in the goal they also join it.
    // In a project showing one epic, they join that epic. From the phone's
    // lists, they go to the Inbox.
    if (editing) closeEditor();
    const shown = atHome ? 'inbox' : view;
    const list = atHome ? undefined : openList;
    const dated = shown === 'today' || shown === 'goal';
    if (!list && !dated) setSelectedView('inbox');
    setHome(false);
    if (shown === 'goal') setPlanning(null);
    const id = await store.add(
      list?.id,
      section,
      dated
        ? { date: today, planned: shown === 'goal' ? today : '' }
        : { epic: list ? epic : '' },
    );
    if (store.getSnapshot().state.tasks[id]) setEditing(id);
  }
  function addSection() {
    if (editing) closeEditor();
    if (project) void store.addList('section', project.id);
  }
  function startPlanning() {
    if (editing) closeEditor();
    setSelected(null);
    setPlanning(day.goal.map((t) => t.id));
  }
  function finishPlanning() {
    if (planning) void store.setPlan(today, planning);
    setPlanning(null);
  }
  function filterEpic(next: string) {
    if (!project) return;
    if (editing) closeEditor();
    setEpicFilter({ ...epicFilter, [project.id]: next });
  }
  async function newEpic(task: Task) {
    const id = await store.addEpic(task.list);
    if (store.getSnapshot().state.tasks[id])
      void store.update(task.id, { epic: id });
  }
  function moveTo(list: string) {
    setMoving(null);
    closeEditor((id) => void store.move(id, list));
  }
  async function addList(kind: 'project' | 'area') {
    if (editing) closeEditor();
    setSelected(null);
    const id = await store.addList(kind);
    if (store.getSnapshot().state.tasks[id]) showView(id);
  }
  function deleteList(id: string) {
    setConfirmDelete(null);
    if (editing) closeEditor();
    if (selectedView === id) {
      setSelectedView('inbox');
      setHome(true);
    }
    void store.deleteList(id);
  }
  const menuTask = menu && tasks.find((t) => t.id === menu.id);
  const movingTask = editing ? state.tasks[editing] : undefined;
  const menuList = menu && lists[menu.id];
  const deleting = confirmDelete ? lists[confirmDelete] : undefined;
  const deletingCount = deleting
    ? todos.filter(
        (t) => t.list === deleting.id && !t.trashed && t.title.trim(),
      ).length
    : 0;
  const deletingKind = deleting?.kind === 'area' ? 'area' : 'project';
  // An area's projects stay, without an area.
  const keptProjects = deleting
    ? projects.filter((p) => p.list === deleting.id).length
    : 0;
  const areaProjects =
    openList?.kind === 'area'
      ? projects.filter((p) => areaOf(p) === openList.id)
      : [];
  const itemProps = {
    view,
    today,
    phone,
    editing,
    selected,
    editorRef: editorArea,
    library,
    closeEditor,
    onToggle: toggle,
    onEdit: openEditor,
    onSelect: setSelected,
    onMenu: (task: Task, x: number, y: number) => {
      if (editing) closeEditor();
      setSelected(task.id);
      setMenu({ id: task.id, x, y });
    },
    onMove: (_task: Task, anchor: DOMRect) => setMoving(anchor),
    onDate: (_task: Task, anchor: DOMRect) => setDating(anchor),
    onEpic: (_task: Task, anchor: DOMRect) => setPicking(anchor),
  };
  return (
    <div
      className={`inbox-app${editing ? ' is-editing' : ''}${atHome ? ' is-home' : ''}${planning ? ' is-planning' : ''}`}
    >
      <Sidebar
        library={library}
        day={day}
        today={today}
        view={view}
        show={showView}
        openMenu={setMenu}
        addList={(kind) => void addList(kind)}
      />
      <main
        className={`inbox-main view-${openList ? 'list' : view}${project?.kanban ? ' view-board' : ''}`}
      >
        {phone && (
          <button className="back-button" onClick={goHome}>
            <ToolbarIcon d="M15 5l-7 7 7 7" />
            Lists
          </button>
        )}
        {openList ? (
          <ListHeader
            key={openList.id}
            list={openList}
            progress={progress(openList.id)}
            areas={phone ? library.areas : undefined}
            area={areaOf(openList)}
            addSection={addSection}
            deleteList={() => setConfirmDelete(openList.id)}
          />
        ) : (
          <header className="inbox-header">
            <ViewIcon view={view as StaticView} />
            <h1>{titles[view as StaticView]}</h1>
          </header>
        )}
        {project && (
          <EpicBar
            project={project}
            library={library}
            filter={epic}
            setFilter={filterEpic}
          />
        )}
        {error && (
          <div className="save-error" role="alert">
            {error} <button onClick={() => void store.retry()}>Retry</button>
          </div>
        )}
        <div className="task-scroll">
          {view === 'settings' && (
            <Settings folder={folder} target={target} setTarget={setTarget} />
          )}
          {areaProjects.length > 0 && (
            <AreaProjects
              projects={areaProjects}
              progress={progress}
              show={showView}
              openMenu={setMenu}
            />
          )}
          {view === 'goal' &&
            (planning ? (
              <Planner
                library={library}
                due={day.due}
                today={today}
                picked={planning}
                target={target}
                setTarget={setTarget}
                toggle={(id) =>
                  setPlanning(
                    planning.includes(id)
                      ? planning.filter((p) => p !== id)
                      : [...planning, id],
                  )
                }
                cancel={() => setPlanning(null)}
                finish={finishPlanning}
              />
            ) : planned ? (
              <GoalCard goal={day.goal} edit={startPlanning} />
            ) : (
              <PlanPrompt
                due={day.due.length}
                target={target}
                start={startPlanning}
              />
            ))}
          {view === 'trash' && tasks.length > 0 && (
            <button
              className="empty-trash"
              onClick={() => {
                if (editing) closeEditor();
                void store.updateAll(
                  tasks.map((t) => [t.id, { deleted: true }]),
                );
              }}
            >
              Empty Trash
            </button>
          )}
          {project?.kanban ? (
            <Board
              project={project.id}
              groups={groups}
              addTask={(section) => void addTask(section)}
              addSection={addSection}
              {...itemProps}
            />
          ) : (
            <TaskList
              groups={groups}
              label={`${openList ? openList.title || untitled(openList) : titles[view as StaticView]} tasks`}
              addTask={project && ((section) => void addTask(section))}
              showList={showView}
              {...itemProps}
            />
          )}
          {tasks.length === 0 &&
            !openList &&
            view !== 'goal' &&
            view !== 'settings' && (
              <div className="empty-state">
                <InboxIcon empty />
                <span>
                  {ready ? empties[view as StaticView] : 'Loading tasks…'}
                </span>
              </div>
            )}
        </div>
        <div className="bottom-fade" aria-hidden="true" />
        <Footer
          footerRef={footer}
          addButtonRef={addButton}
          editing={!!editing}
          phone={phone}
          inTrash={view === 'trash'}
          ready={ready}
          add={
            view === 'settings' && !atHome ? undefined : () => void addTask()
          }
          addSection={project && addSection}
          move={setMoving}
          closeEditor={closeEditor}
        />
      </main>
      {moving && movingTask && (
        <MovePopover
          task={movingTask}
          library={library}
          anchor={moving}
          move={moveTo}
          close={closeMove}
        />
      )}
      {dating && movingTask && (
        <DatePopover
          task={movingTask}
          today={today}
          anchor={dating}
          close={closeDate}
        />
      )}
      {picking && movingTask && (
        <ContextMenu
          x={picking.left}
          y={picking.bottom + 4}
          close={closeEpic}
          items={[
            { heading: 'Epic' },
            {
              label: 'No Epic',
              checked: !library.epicOf(movingTask),
              action: () => void store.update(movingTask.id, { epic: '' }),
            },
            ...epicsOf(movingTask.list).map((e) => ({
              label: e.title || 'New Epic',
              dot: e.color,
              checked: movingTask.epic === e.id,
              action: () => void store.update(movingTask.id, { epic: e.id }),
            })),
            'divider',
            { label: 'New Epic…', action: () => void newEpic(movingTask) },
          ]}
        />
      )}
      {menuTask && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          close={closeMenu}
          items={
            view === 'trash'
              ? [
                  { label: 'Put Back', action: () => putBack(menuTask) },
                  {
                    label: 'Delete Immediately',
                    action: () => remove(menuTask),
                  },
                ]
              : [{ label: 'Delete', action: () => remove(menuTask) }]
          }
        />
      )}
      {menuList && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          close={closeMenu}
          items={[
            {
              label: `Delete ${menuList.kind === 'area' ? 'Area' : 'Project'}…`,
              action: () => setConfirmDelete(menuList.id),
            },
          ]}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title || untitled(deleting)}”?`}
          body={[
            deletingCount === 0
              ? `This ${deletingKind} has no to-dos.`
              : `Its ${deletingCount === 1 ? '1 to-do' : `${deletingCount} to-dos`} will be moved to the Trash.`,
            keptProjects > 0 &&
              `Its ${keptProjects === 1 ? 'project' : `${keptProjects} projects`} will be kept, without an area.`,
            `The ${deletingKind} itself can’t be restored.`,
          ]
            .filter(Boolean)
            .join(' ')}
          action={`Delete ${deletingKind === 'area' ? 'Area' : 'Project'}`}
          confirm={() => deleteList(deleting.id)}
          cancel={() => setConfirmDelete(null)}
        />
      )}
      {welcome && <Welcome />}
    </div>
  );
}
