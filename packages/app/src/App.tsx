import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import * as store from './storage/store';
import { native, onOpen } from './storage/driver';
import { confirmAction, showToast, trashTodo, trashTodos } from './feedback';
import type { Task } from './storage/model';
import { dayKey } from './storage/dates';
import {
  completedTime,
  dayPlan,
  groupByList,
  groupGoal,
  groupTasks,
  organize,
  visibleTasks,
} from './storage/selectors';
import { useDailyTarget } from './hooks/useDailyTarget';
import { useCommandKey } from './hooks/useCommandKey';
import { useEditor } from './hooks/useEditor';
import { useGlide } from './hooks/useGlide';
import { usePhone } from './hooks/usePhone';
import { useSwipeBack } from './hooks/useSwipeBack';
import { useSync } from './hooks/useSync';
import { useTaskKeyboard } from './hooks/useTaskKeyboard';
import {
  dayName,
  empties,
  todoCount,
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
import { Footer, type Bulk } from './components/Footer';
import { GoalCard, Planner, PlanPrompt } from './components/Goal';
import {
  InboxIcon,
  SearchIcon,
  ToolbarIcon,
  ViewIcon,
} from './components/icons';
import { ListHeader } from './components/ListHeader';
import { MovePopover } from './components/MovePopover';
import { SearchField } from './components/SearchField';
import { Settings, Welcome } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { TaskList } from './components/TaskList';
import { Toast } from './components/Toast';

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
  // The screens opened before this one since leaving the lists, which back
  // returns to in turn, with a copy of each to show while swiping back. A
  // screen slides in from the right when opened, from the left when gone back
  // to, and is already in place once swiped back to.
  const [trail, setTrail] = useState<View[]>([]);
  const copies = useRef(new Map<View, HTMLElement>());
  const [arrival, setArrival] = useState<'push' | 'pop' | 'swipe'>('push');
  const mainRef = useRef<HTMLElement>(null);
  const { editing, setEditing, closeEditor, editorArea, footer, addButton } =
    useEditor();
  const [lingering, setLingering] = useState<Record<string, true>>({});
  // The selected to-do, and the to-dos picked with it on desktop by
  // Shift-click, Cmd-click or Shift with an arrow key. Shift picks from the
  // selected one. On the phone, Select in a to-do's menu starts picking, and
  // then tapping a to-do picks it or takes it out.
  const [selected, setAnchor] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  // Selecting one to-do drops any others picked.
  const setSelected = useCallback((id: string | null) => {
    setAnchor(id);
    setPicks([]);
    setSelecting(false);
  }, []);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
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
  // What Search and the Logbook were last searched for, each kept while
  // other views are open.
  const [queries, setQueries] = useState({ search: '', logbook: '' });
  const searchField = useRef<HTMLInputElement>(null);
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
  const searching =
    view === 'search' || view === 'logbook'
      ? (view as keyof typeof queries)
      : undefined;
  const query = searching ? queries[searching] : '';
  const tasks =
    view === 'settings'
      ? []
      : visibleTasks(library, view, {
          list: openList?.id ?? '',
          epic,
          today,
          query,
          editing,
          lingering,
        });
  // The native apps keep their to-dos in a sync folder, which they need first.
  const welcome = native && ready && !folder;
  // Today's Goal shows its to-dos once the day is planned, and glides them
  // to the end as they are completed and back when opened again.
  const planned = view === 'goal' && !planning && day.goal.length > 0;
  const scroll = useRef<HTMLDivElement>(null);
  useGlide(scroll, planned);
  const groups = (
    view === 'today' || view === 'search'
      ? groupByList(tasks, library)
      : planned
        ? groupGoal(tasks, library)
        : view === 'goal'
          ? []
          : groupTasks(tasks, view, project ? sectionsOf(project.id) : [])
  ).map((group) => ({
    ...group,
    label:
      view === 'logbook'
        ? dayName(completedTime(group.tasks[0]), false)
        : group.key === 'completed'
          ? 'Completed'
          : '',
  }));
  // The to-dos in display order, which sections change.
  const shown = groups.flatMap((g) => g.tasks);
  // The picked to-dos still shown, in display order, when there are several,
  // or while picking on the phone.
  const pickedTasks = shown.filter((t) => picks.includes(t.id));
  const choosing = phone && selecting;
  const bulk =
    choosing || (!phone && pickedTasks.length > 1) ? pickedTasks : [];
  const picked = bulk.map((t) => t.id);
  function startSelecting(task: Task) {
    if (editing) closeEditor();
    setAnchor(task.id);
    setPicks([task.id]);
    setSelecting(true);
  }
  function togglePick(id: string) {
    setPicks(
      picks.includes(id) ? picks.filter((p) => p !== id) : [...picks, id],
    );
  }
  function pick(ids: string[]) {
    if (ids.length < 2) setSelected(ids[0] ?? selected);
    else setPicks(ids);
  }
  // Shift-click picks the to-dos from the selected one to `id`; Cmd-click
  // adds `id` to those picked, or takes it out, and selects it.
  function selectTo(id: string, how?: 'range' | 'toggle') {
    const from = shown.findIndex((t) => t.id === selected);
    if (!how || from < 0) return setSelected(id);
    if (how === 'range') {
      const to = shown.findIndex((t) => t.id === id);
      return pick(
        shown
          .slice(Math.min(from, to), Math.max(from, to) + 1)
          .map((t) => t.id),
      );
    }
    const current = picked.length ? picked : [selected!];
    const next = current.includes(id)
      ? current.filter((p) => p !== id)
      : [...current, id];
    if (next.length < 2) return setSelected(next[0] ?? null);
    setAnchor(next.includes(id) ? id : next[next.length - 1]);
    setPicks(next);
  }
  useSync();
  // Selects the neighbouring to-do so repeated deletes keep working.
  function leave(task: Task) {
    leaveAll([task]);
  }
  function leaveAll(gone: Task[]) {
    const first = shown.indexOf(gone[0]);
    const last = shown.indexOf(gone[gone.length - 1]);
    const stays = (t?: Task) => t && !gone.includes(t);
    const next =
      shown.slice(last + 1).find(stays) ??
      shown.slice(0, Math.max(first, 0)).reverse().find(stays);
    setSelected(next?.id ?? null);
  }
  // In Trash, deleting is permanent, so it asks first; elsewhere it moves the
  // to-do to Trash, with a toast to undo it.
  function remove(task: Task) {
    if (view !== 'trash') {
      leave(task);
      trashTodo(task.id);
      return;
    }
    confirmAction({
      title: `Delete “${task.title || 'New To-Do'}” permanently?`,
      body: 'It will be deleted now, rather than three months after it was trashed. This can’t be undone.',
      action: 'Delete',
      run: () => {
        leave(task);
        void store.update(task.id, { deleted: true });
      },
    });
  }
  // Several to-dos go to Trash together, with one toast to undo it, or out of
  // it permanently after asking.
  function removeAll(gone: Task[]) {
    if (view !== 'trash') {
      leaveAll(gone);
      trashTodos(gone.map((t) => t.id));
      return;
    }
    confirmAction({
      title: `Delete ${todoCount(gone.length)} permanently?`,
      body: 'They will be deleted now, rather than three months after they were trashed. This can’t be undone.',
      action: 'Delete',
      run: () => {
        leaveAll(gone);
        void store.updateAll(gone.map((t) => [t.id, { deleted: true }]));
      },
    });
  }
  function putBackAll(back: Task[]) {
    leaveAll(back);
    void store.setTrashedAll(
      back.map((t) => t.id),
      false,
    );
  }
  function emptyTrash() {
    if (editing) closeEditor();
    const trashed = tasks;
    confirmAction({
      title: 'Empty the Trash?',
      body: `${trashed.length === 1 ? 'The to-do' : `All ${trashed.length} to-dos`} in the Trash will be deleted permanently. This can’t be undone.`,
      action: 'Empty Trash',
      run: () =>
        void store.updateAll(trashed.map((t) => [t.id, { deleted: true }])),
    });
  }
  function putBack(task: Task) {
    leave(task);
    void store.setTrashed(task.id, false);
  }
  useTaskKeyboard({
    tasks: shown,
    selected,
    picked: bulk,
    select: setSelected,
    pick,
    paused:
      !!editing ||
      !!menu ||
      !!moving ||
      !!dating ||
      (view === 'goal' && !!planning) ||
      welcome,
    remove,
    removeAll,
    edit: setEditing,
  });
  function openEditor(task: Task) {
    if (choosing) return togglePick(task.id);
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
      (view === 'inbox' ||
        view === 'today' ||
        view === 'search' ||
        !!openList) &&
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
    if (phone && !home && next !== view) remember();
    else if (home) setTrail([]);
    setArrival('push');
    setSelectedView(next);
    setHome(false);
  }
  function goHome(swiped = false) {
    if (editing) closeEditor();
    setSelected(null);
    setPlanning(null);
    setTrail([]);
    copies.current.clear();
    setArrival(swiped ? 'swipe' : 'push');
    setHome(true);
  }
  function remember() {
    setTrail([...trail, view]);
    if (mainRef.current)
      copies.current.set(view, mainRef.current.cloneNode(true) as HTMLElement);
  }
  // Back to the previous screen still there, or else the lists.
  const left = trail.filter((v) => isStatic(v) || lists[v]);
  const previous = left[left.length - 1] as View | undefined;
  function goBack(swiped = false) {
    if (!previous) return goHome(swiped);
    if (editing) closeEditor();
    setSelected(null);
    setPlanning(null);
    setTrail(trail.slice(0, trail.lastIndexOf(previous)));
    setArrival(swiped ? 'swipe' : 'pop');
    setSelectedView(previous);
  }
  // What a swipe back uncovers: the lists, or a copy of the previous screen.
  function behind() {
    if (!previous) return document.querySelector<HTMLElement>('.sidebar');
    const copy = copies.current.get(previous)?.cloneNode(true);
    if (!(copy instanceof HTMLElement)) return null;
    copy
      .querySelectorAll('.inbox-footer, .toast-region')
      .forEach((e) => e.remove());
    return copy;
  }
  useSwipeBack(() => goBack(true), behind, atHome || welcome);
  // Tapping the iPhone's widget opens Today's Goal.
  const opened = useEffectEvent((next: string) => {
    if (next === 'goal') showView('goal');
  });
  useEffect(() => onOpen(opened), []);
  async function addTask(section = '', near?: Task) {
    // New to-dos join the open project or area; elsewhere they go to the
    // Inbox. In Today they are due today, and in the goal they also join it.
    // In a project showing one epic, they join that epic. From the phone's
    // lists, they go to the Inbox. Added `near` another to-do, they join its
    // project or area and section instead.
    if (editing) closeEditor();
    const shown = atHome ? 'inbox' : view;
    const list = atHome ? undefined : near ? lists[near.list] : openList;
    const dated = shown === 'today' || shown === 'goal';
    if (!list && !dated) {
      if (atHome) setTrail([]);
      else if (view !== 'inbox') remember();
      setArrival('push');
      setSelectedView('inbox');
    }
    setHome(false);
    if (shown === 'goal') setPlanning(null);
    const id = await store.add(
      list?.id,
      near ? near.section : section,
      dated
        ? { date: today, planned: shown === 'goal' ? today : '' }
        : { epic: list && list === openList ? epic : '' },
    );
    if (store.getSnapshot().state.tasks[id]) setEditing(id);
  }
  // Cmd+N adds a to-do beside the one being edited or selected, if any, so
  // it joins that to-do's list and section; in the Logbook and Trash it goes
  // to the Inbox.
  function addHere() {
    setMenu(null);
    const near =
      view === 'logbook' || view === 'trash'
        ? undefined
        : shown.find((t) => t.id === (editing ?? selected));
    void addTask('', near);
  }
  useCommandKey('n', addHere, !ready || welcome);
  // Cmd+F searches the Logbook while it is open, and the open to-dos
  // elsewhere.
  function find() {
    setMenu(null);
    if (!searching) return showView('search');
    if (editing) closeEditor();
    searchField.current?.select();
  }
  useCommandKey('f', find, !ready || welcome);
  function addSection() {
    if (editing) closeEditor();
    if (project) void store.addList('section', project.id);
  }
  function startPlanning() {
    if (editing) closeEditor();
    setSelected(null);
    setPlanning(day.goal.map((t) => t.id));
  }
  // The goal's to-dos stay where they are, and Undo picks them again.
  function clearPlan() {
    if (editing) closeEditor();
    const picked = day.goal.map((t) => t.id);
    setPlanning(null);
    void store.setPlan(today, []);
    showToast('Today’s goal cleared', () => void store.setPlan(today, picked));
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
  function moveTo(list: string, section = '') {
    setMoving(null);
    if (editing) closeEditor((id) => void store.moveAll([id], list, section));
    else void store.moveAll(picked, list, section);
    if (choosing) setSelected(null);
  }
  async function addList(kind: 'project' | 'area') {
    if (editing) closeEditor();
    setSelected(null);
    const id = await store.addList(kind);
    if (store.getSnapshot().state.tasks[id]) showView(id);
  }
  function deleteList(id: string) {
    if (editing) closeEditor();
    if (selectedView === id) {
      setSelectedView('inbox');
      setHome(true);
    }
    void store.deleteList(id);
  }
  function askDeleteList(id: string) {
    const list = lists[id];
    if (!list) return;
    const kind = list.kind === 'area' ? 'area' : 'project';
    const count = todos.filter(
      (t) => t.list === id && !t.trashed && t.title.trim(),
    ).length;
    // An area's projects stay, without an area.
    const kept = projects.filter((p) => p.list === id).length;
    confirmAction({
      title: `Delete “${list.title || untitled(list)}”?`,
      body: [
        count === 0
          ? `This ${kind} has no to-dos.`
          : `Its ${count === 1 ? '1 to-do' : `${count} to-dos`} will be moved to the Trash.`,
        kept > 0 &&
          `Its ${kept === 1 ? 'project' : `${kept} projects`} will be kept, without an area.`,
        `The ${kind} itself can’t be restored.`,
      ]
        .filter(Boolean)
        .join(' '),
      action: `Delete ${kind === 'area' ? 'Area' : 'Project'}`,
      run: () => deleteList(id),
    });
  }
  const menuTask = menu && tasks.find((t) => t.id === menu.id);
  const menuSections = menuTask ? sectionsOf(menuTask.list) : [];
  // The pickers act on the edited to-do, or else the picked ones.
  const movingTasks = editing
    ? [state.tasks[editing]].filter(Boolean)
    : moving || dating
      ? bulk
      : [];
  const movingTask = editing ? movingTasks[0] : undefined;
  // Where the moving to-dos all are, if they share a list and section.
  const [firstMoving] = movingTasks;
  const movingFrom =
    firstMoving &&
    movingTasks.every(
      (t) =>
        library.listOf(t) === library.listOf(firstMoving) &&
        t.section === firstMoving.section,
    )
      ? {
          list: library.listOf(firstMoving),
          section: sectionsOf(library.listOf(firstMoving)).some(
            (s) => s.id === firstMoving.section,
          )
            ? firstMoving.section
            : '',
        }
      : undefined;
  // In a project with sections, the to-dos picked from it can change section
  // from their menu, which the phone can do without dragging.
  const bulkProject =
    bulk.length &&
    bulk.every((t) => library.listOf(t) === library.listOf(bulk[0]))
      ? library.listOf(bulk[0])
      : '';
  const bulkSections = bulkProject ? sectionsOf(bulkProject) : [];
  const bulkActions: Bulk | undefined =
    bulk.length || choosing
      ? {
          count: bulk.length,
          done: choosing ? () => setSelected(null) : undefined,
          inTrash: view === 'trash',
          move: view === 'logbook' ? undefined : setMoving,
          date: view === 'logbook' ? undefined : setDating,
          putBack: () => putBackAll(bulk),
          remove: () => removeAll(bulk),
        }
      : undefined;
  // On the phone, a to-do's menu starts picking several to-dos.
  const select =
    phone && menuTask
      ? [
          { label: 'Select', action: () => startSelecting(menuTask) },
          'divider' as const,
        ]
      : [];
  const menuList = menu && lists[menu.id];
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
    picked,
    editorRef: editorArea,
    library,
    closeEditor,
    onToggle: toggle,
    onEdit: openEditor,
    onSelect: selectTo,
    // A picked to-do's menu acts on all those picked, as does any to-do's
    // while picking on the phone, which picks it too.
    onMenu: (task: Task, x: number, y: number) => {
      if (editing) closeEditor();
      if (choosing) {
        if (!picks.includes(task.id)) setPicks([...picks, task.id]);
      } else if (!picked.includes(task.id)) setSelected(task.id);
      setMenu({ id: task.id, x, y });
    },
    onMove: (_task: Task, anchor: DOMRect) => setMoving(anchor),
    onDate: (_task: Task, anchor: DOMRect) => setDating(anchor),
    onEpic: (_task: Task, anchor: DOMRect) => setPicking(anchor),
  };
  return (
    <div
      className={`inbox-app${editing ? ' is-editing' : ''}${atHome ? ' is-home' : ''}${arrival === 'pop' ? ' is-returning' : arrival === 'swipe' ? ' is-swiped' : ''}${planning ? ' is-planning' : ''}${choosing ? ' is-selecting' : ''}`}
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
        ref={mainRef}
        className={`inbox-main view-${openList ? 'list' : view}${project?.kanban ? ' view-board' : ''}`}
      >
        {phone && (
          <button className="back-button" onClick={() => goBack()}>
            <ToolbarIcon d="M15 5l-7 7 7 7" />
            <span>
              {previous
                ? isStatic(previous)
                  ? titles[previous]
                  : lists[previous].title || untitled(lists[previous])
                : 'Lists'}
            </span>
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
            deleteList={() => askDeleteList(openList.id)}
          />
        ) : (
          <header key={`header-${view}`} className="inbox-header">
            <ViewIcon view={view as StaticView} />
            <h1>{titles[view as StaticView]}</h1>
          </header>
        )}
        {searching && (
          <SearchField
            key={`search-${view}`}
            query={query}
            setQuery={(next) => setQueries({ ...queries, [searching]: next })}
            label={
              searching === 'search' ? 'Search open to-dos' : 'Search Logbook'
            }
            inputRef={searchField}
            // Search starts in its field, unless returned to with results.
            autoFocus={searching === 'search' && !query}
          />
        )}
        {project && (
          <EpicBar
            key={`epics-${project.id}`}
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
        {/* Keyed by view, so each view starts at the top and fades in. */}
        <div key={`scroll-${view}`} ref={scroll} className="task-scroll">
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
                clear={day.goal.length > 0 ? clearPlan : undefined}
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
            <button className="empty-trash" onClick={emptyTrash}>
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
                {view === 'search' || query.trim() ? (
                  <SearchIcon empty />
                ) : (
                  <InboxIcon empty />
                )}
                <span>
                  {!ready
                    ? 'Loading tasks…'
                    : query.trim()
                      ? `No ${view === 'logbook' ? 'completed' : 'open'} to-dos match “${query.trim()}”`
                      : empties[view as StaticView]}
                </span>
              </div>
            )}
        </div>
        <div className="bottom-fade" aria-hidden="true" />
        <Toast />
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
          bulk={bulkActions}
        />
      </main>
      {moving && movingTasks.length > 0 && (
        <MovePopover
          current={movingFrom}
          library={library}
          anchor={moving}
          move={moveTo}
          close={closeMove}
        />
      )}
      {dating && movingTasks.length > 0 && (
        <DatePopover
          tasks={movingTasks}
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
      {menuTask &&
        (choosing || picked.includes(menuTask.id)) &&
        bulkActions && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            close={closeMenu}
            items={
              view === 'trash'
                ? [
                    { heading: todoCount(bulk.length, true) },
                    { label: 'Put Back', action: bulkActions.putBack },
                    'divider',
                    {
                      label: 'Delete Immediately…',
                      danger: true,
                      action: bulkActions.remove,
                    },
                  ]
                : [
                    { heading: todoCount(bulk.length, true) },
                    ...(view !== 'logbook'
                      ? [
                          {
                            label: 'Move…',
                            action: () =>
                              setMoving(new DOMRect(menu.x, menu.y, 0, 0)),
                          },
                          {
                            label: 'Set Date…',
                            action: () =>
                              setDating(new DOMRect(menu.x, menu.y, 0, 0)),
                          },
                          {
                            label: 'Complete',
                            action: () =>
                              bulk.forEach((t) => !t.completed && toggle(t)),
                          },
                          'divider' as const,
                        ]
                      : []),
                    ...(view !== 'logbook' && bulkSections.length
                      ? [
                          { heading: 'Section' },
                          {
                            label: 'No Section',
                            checked: bulk.every(
                              (t) =>
                                !bulkSections.some((s) => s.id === t.section),
                            ),
                            action: () =>
                              void store.moveAll(picked, bulkProject),
                          },
                          ...bulkSections.map((s) => ({
                            label: s.title || 'New Section',
                            checked: bulk.every((t) => t.section === s.id),
                            action: () =>
                              void store.moveAll(picked, bulkProject, s.id),
                          })),
                          'divider' as const,
                        ]
                      : []),
                    {
                      label: 'Move to Trash',
                      danger: true,
                      action: bulkActions.remove,
                    },
                  ]
            }
          />
        )}
      {menuTask && !choosing && !picked.includes(menuTask.id) && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          close={closeMenu}
          items={
            view === 'trash'
              ? [
                  ...select,
                  { label: 'Put Back', action: () => putBack(menuTask) },
                  'divider',
                  {
                    label: 'Delete Immediately…',
                    danger: true,
                    action: () => remove(menuTask),
                  },
                ]
              : [
                  ...select,
                  // In a project with sections, the to-do can change section
                  // without being dragged, which the phone can't do.
                  ...(view !== 'logbook' && menuSections.length
                    ? [
                        { heading: 'Section' },
                        {
                          label: 'No Section',
                          checked: !menuSections.some(
                            (s) => s.id === menuTask.section,
                          ),
                          action: () =>
                            void store.update(menuTask.id, { section: '' }),
                        },
                        ...menuSections.map((s) => ({
                          label: s.title || 'New Section',
                          checked: menuTask.section === s.id,
                          action: () =>
                            void store.update(menuTask.id, { section: s.id }),
                        })),
                        'divider' as const,
                      ]
                    : []),
                  {
                    label: 'Move to Trash',
                    danger: true,
                    action: () => remove(menuTask),
                  },
                ]
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
              danger: true,
              action: () => askDeleteList(menuList.id),
            },
          ]}
        />
      )}
      <ConfirmDialog />
      {welcome && <Welcome />}
    </div>
  );
}
