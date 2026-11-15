import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Task = Readonly<{ id: number; title: string; completed: boolean }>;

const tasks: readonly Task[] = [
  { id: 1, title: 'Renew car insurance', completed: false },
  { id: 2, title: 'Call the plumber about the bathroom tap', completed: false },
  { id: 3, title: 'Order new running shoes', completed: false },
  { id: 4, title: 'Buy a birthday card', completed: true },
  { id: 5, title: 'Read through the lease agreement', completed: false },
];

function InboxIcon() {
  return <svg className="inbox-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 13l2.6-7.2A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13" />
    <path d="M3 13h5.2a1 1 0 0 1 1 .8 3 3 0 0 0 5.6 0 1 1 0 0 1 1-.8H21v4.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" />
  </svg>;
}

function TaskRow({ task }: { task: Task }) {
  return <li className={`task-row${task.completed ? ' task-row--completed' : ''}`}>
    <span className="task-check" aria-hidden="true"><span className="task-box">
      {task.completed && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>}
    </span></span>
    <span className="task-title">{task.title}</span>
    <span className="sr-only">{task.completed ? 'Completed' : 'Not completed'}</span>
  </li>;
}

function DesktopSidebar() {
  const openCount = tasks.filter(task => !task.completed).length;
  return <aside className="sidebar" aria-label="Inbox navigation">
    <div className="sidebar-inbox" aria-current="page">
      <InboxIcon />
      <span className="sidebar-title">Inbox</span>
      <span className="sidebar-count" aria-label={`${openCount} incomplete tasks`}>{openCount}</span>
    </div>
  </aside>;
}

function App() {
  return <div className="inbox-app">
    <DesktopSidebar />
    <main className="inbox-main">
      <header className="inbox-header"><InboxIcon /><h1>Inbox</h1></header>
      <div className="task-scroll"><ul className="task-list" aria-label="Inbox tasks">{tasks.map(task => <TaskRow key={task.id} task={task} />)}</ul></div>
      <div className="bottom-fade" aria-hidden="true" />
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
