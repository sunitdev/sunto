import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as store from '../storage/store';
import type { Fields, Task } from '../storage/model';
import { rescheduling } from '../storage/ops';
import {
  completeName,
  nameQuery,
  parseTitle,
  stripTokens,
  suggestNames,
  type Token,
} from '../storage/quickAdd';
import type { Library } from '../storage/selectors';
import { useDraft } from '../hooks/useDraft';
import { dueLabel, untitled } from '../views';
import { Check } from './Check';
import { ListSuggestions, type Choice } from './ListSuggestions';
import {
  CalendarIcon,
  EpicDot,
  ListIcon,
  RepeatIcon,
  TagIcon,
  TrayIcon,
} from './icons';

// `list` is the to-do's project or area, shown on a button that opens
// `onMove` with the button's bounds; in a project, another shows its `epic`
// and opens `onEpic`, and a third shows its date and opens `onDate`.
// A new to-do's title can also set its date, repeat, list and section as it
// is typed; the buttons show the date and list, and closing the editor
// applies them all. Typing "#" or "/" there suggests the lists or sections
// it could name.
export function Editor({
  task,
  today,
  library,
  list: current,
  progress,
  epic,
  close,
  onToggle,
  onMove,
  onDate,
  onEpic,
}: {
  task: Task;
  today: string;
  library: Library;
  list?: Task;
  progress: number;
  epic?: Task;
  close: () => void;
  onToggle: (task: Task) => void;
  onMove?: (anchor: DOMRect) => void;
  onDate?: (anchor: DOMRect) => void;
  onEpic?: (anchor: DOMRect) => void;
}) {
  // Only a to-do opened without a title reads its title, and a date or
  // repeat picked meanwhile replaces the one typed.
  const [opened] = useState(task);
  const lists = library.order.flatMap((id) => library.lists[id] ?? []);
  const named = lists.map((l) => ({
    id: l.id,
    title: l.title,
    sections: l.kind === 'project' ? library.sectionsOf(l.id) : [],
  }));
  const tokensOf = (text: string) =>
    opened.title
      ? []
      : parseTitle(text, today, named, library.listOf(task)).filter(
          (t) =>
            t.kind === 'list' ||
            t.kind === 'section' ||
            (task.date === opened.date && task.repeat === opened.repeat),
        );
  function finish(text: string): Partial<Fields> | undefined {
    const tokens = tokensOf(text);
    const title = stripTokens(text, tokens);
    // A title of only tokens stays as typed.
    if (!tokens.length || !title) return;
    const typed = typedIn(tokens);
    let patch: Partial<Fields> = { title };
    if (typed.list !== undefined && typed.list !== task.list)
      patch = { ...patch, list: typed.list, section: '', epic: '' };
    if (typed.section && typed.section !== task.section)
      patch.section = typed.section;
    if (typed.repeat) patch.repeat = typed.repeat;
    if (typed.date !== undefined && typed.date !== task.date)
      patch = rescheduling(task, { ...patch, date: typed.date });
    return patch;
  }
  const { draft, latest, change, flush } = useDraft(task, finish);
  const { title, notes } = draft;
  const tokens = tokensOf(title);
  const typed = typedIn(tokens);
  const list = typed.list === undefined ? current : library.lists[typed.list];
  const listLabel = list ? list.title || untitled(list) : 'Inbox';
  const date = typed.date ?? task.date;
  const repeats = !!(typed.repeat || task.repeat);
  const due = date ? dueLabel(date, today) : undefined;
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // A textarea focuses with the caret at its start; editing picks up at the end.
  useEffect(() => {
    const el = titleRef.current;
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);
  // The caret while the title has focus, and where to move it once a picked
  // list's name is in the title.
  const [caret, setCaret] = useState<number | null>(task.title.length);
  const caretTo = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caretTo.current === null) return;
    titleRef.current?.setSelectionRange(caretTo.current, caretTo.current);
    caretTo.current = null;
  });
  // A "#" or "/" stops suggesting once a name is picked for it or Escape is
  // pressed.
  const [dismissed, setDismissed] = useState(-1);
  const typing =
    caret === null || opened.title ? undefined : nameQuery(title, caret);
  // Sections are those of the list named, or else the to-do's.
  const project = typed.list ?? library.listOf(task);
  const choices: Choice[] =
    !typing || typing.start === dismissed
      ? []
      : typing.mark === '#'
        ? suggestNames<Choice>(typing.query, [
            ...lists.map((l) => ({ id: l.id, title: l.title, list: l })),
            { id: '', title: 'Inbox' },
          ])
        : suggestNames<Choice>(
            typing.query,
            library
              .sectionsOf(project)
              .map((s) => ({ id: s.id, title: s.title, section: s })),
          );
  // The highlighted choice, which starts at the first as the name changes.
  const at = typing ? `${typing.start}:${typing.query}` : '';
  const [active, setActive] = useState({ at, i: 0 });
  const index = active.at === at ? Math.min(active.i, choices.length - 1) : 0;
  const suggestions = useId();
  function pick(choice: Choice) {
    if (!typing || caret === null) return;
    const next = completeName(title, typing.start, caret, choice.title);
    change('title', next.text);
    setDismissed(typing.start);
    setCaret(next.caret);
    caretTo.current = next.caret;
  }
  function done() {
    flush();
    if (!latest.current.title.trim())
      void store.update(task.id, { deleted: true });
    close();
  }
  return (
    <div className="task-editor">
      <div className="task-row">
        <Check task={task} onToggle={onToggle} />
        {/* A textarea, so a long title wraps; Enter finishes instead of
            adding a line, and pasted line breaks become spaces. */}
        <div className="editor-title-field">
          {tokens.length > 0 && <TitleMarks text={title} tokens={tokens} />}
          <textarea
            ref={titleRef}
            autoFocus
            className="editor-title"
            aria-label="To-do title"
            placeholder="New To-Do"
            rows={1}
            enterKeyHint="done"
            aria-autocomplete="list"
            aria-controls={choices.length ? suggestions : undefined}
            aria-activedescendant={
              choices.length ? `${suggestions}-${index}` : undefined
            }
            value={title}
            onChange={(e) => {
              change('title', e.target.value.replace(/\r?\n/g, ' '));
              setCaret(e.target.selectionStart);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onFocus={(e) => setCaret(e.currentTarget.selectionStart)}
            onBlur={() => setCaret(null)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              // While names are suggested, the arrows move between them,
              // Enter and Tab pick one, and Escape hides them.
              if (typing && choices.length) {
                const step =
                  e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
                if (step) {
                  e.preventDefault();
                  setActive({
                    at,
                    i: (index + step + choices.length) % choices.length,
                  });
                  return;
                }
                if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                  e.preventDefault();
                  pick(choices[index]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setDismissed(typing.start);
                  return;
                }
              }
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                done();
              }
            }}
          />
          {choices.length > 0 && (
            <ListSuggestions
              id={suggestions}
              field={titleRef}
              choices={choices}
              active={index}
              label={typing?.mark === '/' ? 'Sections' : 'Lists'}
              library={library}
              setActive={(i) => setActive({ at, i })}
              pick={pick}
            />
          )}
        </div>
      </div>
      <textarea
        className="editor-notes"
        aria-label="Notes"
        placeholder="Notes"
        rows={3}
        value={notes}
        onChange={(e) => change('notes', e.target.value)}
        onKeyDown={(e) => {
          if (!e.nativeEvent.isComposing && e.key === 'Escape') done();
        }}
      />
      {(onMove || onDate) && (
        <div className="editor-foot">
          <div className="editor-pills">
            {onMove && (
              <button
                className={`move-pill${typed.list !== undefined ? ' is-typed' : ''}`}
                aria-label={`Move to another list. Currently in ${listLabel}`}
                aria-haspopup="dialog"
                onClick={(e) => onMove(e.currentTarget.getBoundingClientRect())}
              >
                {list ? (
                  <ListIcon
                    list={list}
                    progress={
                      list === current ? progress : library.progress(list.id)
                    }
                  />
                ) : (
                  <TrayIcon />
                )}
                <span>{listLabel}</span>
              </button>
            )}
            {onEpic && list === current && (
              <button
                className={`epic-pill${epic ? ' has-epic' : ''}`}
                aria-label={
                  epic
                    ? `Epic: ${epic.title || 'New Epic'}. Change epic`
                    : 'Assign an epic'
                }
                aria-haspopup="menu"
                onClick={(e) => onEpic(e.currentTarget.getBoundingClientRect())}
              >
                {epic ? <EpicDot color={epic.color} /> : <TagIcon />}
                <span>{epic ? epic.title || 'New Epic' : 'Epic'}</span>
              </button>
            )}
            {onDate && (
              <button
                className={`date-pill${due?.overdue && !task.completed ? ' is-overdue' : ''}${typed.date !== undefined ? ' is-typed' : ''}`}
                aria-label={
                  due
                    ? `Date: ${due.long}${repeats ? ', repeating' : ''}. Change date`
                    : 'Set a date'
                }
                aria-haspopup="dialog"
                onClick={(e) => onDate(e.currentTarget.getBoundingClientRect())}
              >
                <CalendarIcon />
                <span>{due ? due.long : 'When'}</span>
                {repeats && <RepeatIcon />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// The title's text with its tokens marked, laid out behind the title field
// so the marks fall under the words.
function TitleMarks({ text, tokens }: { text: string; tokens: Token[] }) {
  return (
    <div className="editor-title-marks" aria-hidden="true">
      {tokens.map((t, i) => (
        <Fragment key={t.start}>
          {text.slice(i ? tokens[i - 1].end : 0, t.start)}
          <mark className={`is-${t.kind}`}>{text.slice(t.start, t.end)}</mark>
        </Fragment>
      ))}
      {text.slice(tokens[tokens.length - 1].end)}
    </div>
  );
}
// The fields `tokens` set: a repeat's first day is its date.
function typedIn(tokens: Token[]) {
  const of = (kind: Token['kind']) => tokens.find((t) => t.kind === kind);
  const repeat = of('repeat');
  return {
    list: of('list')?.value,
    section: of('section')?.value,
    repeat: repeat?.value,
    date: repeat?.day ?? of('date')?.value,
  };
}
