import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getPlatform } from './platform';
import './styles.css';

function App() {
  const [page, setPage] = useState('Overview');
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const platform = getPlatform();
  function changeTheme(value: typeof theme) {
    setTheme(value);
    document.documentElement.dataset.theme = value;
  }
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Sunto home" onClick={() => setPage('Overview')}><span className="brand-mark">s</span>sunto<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="avatar">S</span><div>Your workspace<small>Personal space</small></div><span className="workspace-dot" /></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation">{['Overview', 'Appearance', 'About'].map((item, i) => <button key={item} className={page === item ? 'nav-item active' : 'nav-item'} aria-current={page === item ? 'page' : undefined} onClick={() => setPage(item)}><span aria-hidden="true">{['◫', '◐', '◎'][i]}</span>{item}</button>)}</nav>
      <div className="sidebar-bottom"><span className="status-dot"/> A little space for big ideas.<small>SUNTO / 0.1.0</small></div>
    </aside>
    <main>
      <header><span>Your workspace <span className="breadcrumb">/ {page}</span></span><span className="platform-badge">{platform === 'macos' ? 'macOS' : platform === 'ios' ? 'iOS' : 'Web preview'}</span></header>
      <div className="content">
        <div className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</div>
        <h1>{page === 'Overview' ? 'A fresh start.' : page === 'Appearance' ? 'Make it yours.' : 'Meet Sunto.'}</h1>
        <p className="intro">{page === 'Overview' ? 'Your next idea has a home. Start small, find your rhythm, and build something that matters.' : page === 'Appearance' ? 'A comfortable space, in any light.' : 'One familiar space, wherever you are.'}</p>
        {page === 'Overview' ? <>
          <section className="hero"><div className="hero-copy"><span className="pill">YOUR SPACE, REIMAGINED</span><h2>Good things begin<br/>with a little space.</h2><p>Desktop or on the go.<br/>Sunto goes with you.</p><button className="primary" onClick={() => setPage('Appearance')}>Make yourself at home <span aria-hidden="true">↗</span></button></div><div className="art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="sun"/><div className="hill hill-back"/><div className="hill hill-front"/><span className="art-star">✳</span></div></section>
          <div className="section-heading"><h2>A place to begin</h2><span>THE POSSIBILITIES ARE OPEN</span></div>
          <div className="cards"><article><span className="card-icon">◫</span><h3>Room to grow</h3><p>A quiet foundation for whatever you build next.</p></article><article><span className="card-icon">↗</span><h3>Take it with you</h3><p>A familiar experience on your Mac and iPhone.</p></article><article><span className="card-icon">◐</span><h3>Find your light</h3><p>Light and dark appearances that follow your day.</p><button className="text-button" onClick={() => setPage('Appearance')}>Choose appearance →</button></article></div>
        </> : page === 'Appearance' ? <section className="settings-panel"><h2>Appearance</h2><p>Follow your device, or choose your own.</p><div className="theme-options" role="group" aria-label="Appearance">{(['auto', 'light', 'dark'] as const).map(value => <button key={value} aria-pressed={theme === value} onClick={() => changeTheme(value)}>{value === 'auto' ? 'System' : value === 'light' ? 'Light' : 'Dark'}</button>)}</div><p className="hint">This demo preference lasts for the current session.</p></section> : <section className="settings-panel"><span className="brand-mark">s</span><h2>Sunto 0.1.0</h2><p>A starting point for your next idea.</p><p>Made for macOS and iOS.</p></section>}
        <footer><span>A little more clarity. A little more possibility.</span><span>Made for your everyday.</span></footer>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
