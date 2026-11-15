import { useCallback, useState, useSyncExternalStore } from 'react';
import * as store from './storage/store';
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
import { Footer } from './components/Footer';
import { GoalCard, Planner, PlanPrompt } from './components/Goal';
import { InboxIcon, ViewIcon } from './components/icons';
import { ListHeader } from './components/ListHeader';
import { MovePopover } from './components/MovePopover';
import { Sidebar } from './components/Sidebar';
import { StoragePanel } from './components/StoragePanel';
import { TaskList } from './components/TaskList';

export function App() {
  const { state, ready, error, syncStatus, folder } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const phone = usePhone();
  const [selectedView, setSelectedView] = useState<View>('inbox');
  const { editing, setEditing, closeEditor, editorArea, footer, addButton } =
    useEditor();
  const [lingering, setLingering] = useState<Record<string, true>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [settings, setSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // The edited to-do's list and date pickers, and the bounds of the button
  // opening each.
  const [moving, setMoving] = useState<DOMRect | null>(null);
  const [dating, setDating] = useState<DOMRect | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeMove = useCallback(() => setMoving(null), []);
  const closeDate = useCallback(() => setDating(null), []);
  // The pickers close with the editor, so they can't reopen with the next one.
  const [movingFor, setMovingFor] = useState(editing);
  if (movingFor !== editing) {
    setMovingFor(editing);
    setMoving(null);
    setDating(null);
  }
  // The to-dos picked while planning the day, before they are saved.
  const [planning, setPlanning] = useState<string[] | null>(null);
  const [target, setTarget] = useDailyTarget();
  const today = dayKey();
  const library = organize(state);
  const { projects, lists, todos, sectionsOf, areaOf, progress } = library;
  const day = dayPlan(library, today);
  // The phone layout has no navigation, so it always shows the Inbox.
  const view: View =
    phone || !(isStatic(selectedView) || lists[selectedView])
      ? 'inbox'
      : selectedView;
  const openList = isStatic(view) ? undefined : lists[view];
  const tasks = visibleTasks(library, view, {
    list: openList?.id ?? '',
    today,
    editing,
    lingering,
    phone,
  });
  const project = openList?.kind === 'project' ? openList : undefined;
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
    paused: !!editing || !!menu || (view === 'goal' && !!planning),
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
  }
  async function addTask(section = '') {
    // New to-dos join the open project or area; elsewhere they go to the
    // Inbox. In Today they are due today, and in the goal they also join it.
    if (editing) closeEditor();
    const dated = view === 'today' || view === 'goal';
    if (!openList && !dated) setSelectedView('inbox');
    if (view === 'goal') setPlanning(null);
    const id = await store.add(
      openList?.id,
      section,
      dated ? { date: today, planned: view === 'goal' ? today : '' } : {},
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
  function moveTo(list: string) {
    setMoving(null);
    closeEditor((id) => void store.move(id, list));
  }
  async function addList(kind: 'project' | 'area') {
    if (editing) closeEditor();
    setSelected(null);
    const id = await store.addList(kind);
    if (store.getSnapshot().state.tasks[id]) setSelectedView(id);
  }
  function deleteProject(id: string) {
    setConfirmDelete(null);
    if (editing) closeEditor();
    if (selectedView === id) setSelectedView('inbox');
    void store.deleteProject(id);
  }
  const menuTask = menu && tasks.find((t) => t.id === menu.id);
  const movingTask = editing ? state.tasks[editing] : undefined;
  const menuProject =
    menu && lists[menu.id]?.kind === 'project' && lists[menu.id];
  const deleting = confirmDelete ? lists[confirmDelete] : undefined;
  const deletingCount = deleting
    ? todos.filter(
        (t) => t.list === deleting.id && !t.trashed && t.title.trim(),
      ).length
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
  };
  const settingsToggle = (
    <button
      className="settings-toggle"
      aria-label="Storage settings"
      onClick={() => setSettings(!settings)}
    >
      ···
    </button>
  );
  return (
    <div className={`inbox-app${editing ? ' is-editing' : ''}`}>
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
        {openList ? (
          <ListHeader
            key={openList.id}
            list={openList}
            progress={progress(openList.id)}
            addSection={addSection}
            deleteProject={() => setConfirmDelete(openList.id)}
          >
            {settingsToggle}
          </ListHeader>
        ) : (
          <header className="inbox-header">
            <ViewIcon view={view as StaticView} />
            <h1>{titles[view as StaticView]}</h1>
            {settingsToggle}
          </header>
        )}
        {error && (
          <div className="save-error" role="alert">
            {error} <button onClick={() => void store.retry()}>Retry</button>
          </div>
        )}
        {settings && (
          <StoragePanel
            syncStatus={syncStatus}
            folder={folder}
            close={() => setSettings(false)}
          />
        )}
        <div className="task-scroll">
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
          {tasks.length === 0 && !openList && view !== 'goal' && (
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
          add={() => void addTask()}
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
      {menuProject && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          close={closeMenu}
          items={[
            {
              label: 'Delete Project…',
              action: () => setConfirmDelete(menuProject.id),
            },
          ]}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title || untitled(deleting)}”?`}
          body={
            deletingCount === 0
              ? 'This project has no to-dos. The project can’t be restored.'
              : `Its ${deletingCount === 1 ? '1 to-do' : `${deletingCount} to-dos`} will be moved to the Trash. The project itself can’t be restored.`
          }
          action="Delete Project"
          confirm={() => deleteProject(deleting.id)}
          cancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
