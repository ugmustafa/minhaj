import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { init, useDB, today as todayOf, nowTs } from './lib/store';
import * as E from './lib/engine';
import { minuteOfStudyDay, parseHM } from './lib/time';
import { UIProvider, useNow } from './ui/common';
import { NowScreen } from './ui/Now';
import { SubjectsScreen } from './ui/Subjects';
import { PlanScreen } from './ui/Plan';
import { SummaryScreen } from './ui/Summary';
import { SettingsScreen } from './ui/Settings';
import { Wizard } from './ui/Wizard';
import { INow, IBooks, IPlan, IStats, ISettings } from './ui/icons';

type Tab = 'now' | 'subjects' | 'plan' | 'summary' | 'settings';
const TABS: { k: Tab; ru: string; I: (p: { size?: number }) => JSX.Element }[] = [
  { k: 'now', ru: 'Сейчас', I: INow },
  { k: 'subjects', ru: 'Предметы', I: IBooks },
  { k: 'plan', ru: 'План', I: IPlan },
  { k: 'summary', ru: 'Итоги', I: IStats },
  { k: 'settings', ru: 'Настройки', I: ISettings },
];

// В адресе: #now, #subjects-nahw, #plan, #summary, #options (имя «settings» занято на claude.ai)
const toHash = (t: Tab) => (t === 'settings' ? 'options' : t);
function readHash(): { tab: Tab; sid?: string } {
  const h = location.hash.replace('#', '');
  const [head, ...rest] = h.split(/[-/]/);
  const tab = head === 'options' ? 'settings' : head;
  return { tab: (TABS.some((t) => t.k === tab) ? tab : 'now') as Tab, sid: rest.join('-') || undefined };
}

function App() {
  const db = useDB();
  const now = useNow(1000);
  const [{ tab, sid }, setRoute] = useState(readHash());
  useEffect(() => { const f = () => { setRoute(readHash()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = (t: Tab, s?: string) => { location.hash = s ? `${toHash(t)}-${s}` : toHash(t); window.scrollTo(0, 0); };

  // Тема: авто — тёмная после Иша и до Фаджра
  useEffect(() => {
    if (!db) return;
    let dark = db.settings.theme === 'dark';
    if (db.settings.theme === 'auto') {
      const day = todayOf(db);
      const pt = E.prayersFor(db, day);
      const m = minuteOfStudyDay(now, parseHM(db.settings.boundary));
      dark = m >= pt.isha || m < pt.fajr || m >= 1440;
    }
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0F1513' : '#F4F1E8');
  }, [db, Math.floor(now / 60000)]);

  if (!db) return null;
  if (!db.settings.onboarded) return <div className="shell" style={{ paddingLeft: 'calc(var(--sal) + 16px)' }}><Wizard db={db} /></div>;

  const nav = (cls: string) => (
    <nav className={cls} aria-label="Разделы">
      {cls === 'side' && <div className="logo">منهاج</div>}
      {TABS.map(({ k, ru, I }) => (
        <button key={k} className={`tab ${tab === k ? 'on' : ''}`} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}><I /><span>{ru}</span></button>
      ))}
    </nav>
  );

  return (
    <>
      {nav('side')}
      <main className="shell">
        {tab === 'now' && <NowScreen db={db} now={now} />}
        {tab === 'subjects' && <SubjectsScreen db={db} sid={sid ?? 'hifz'} setSid={(s) => go('subjects', s)} />}
        {tab === 'plan' && <PlanScreen db={db} />}
        {tab === 'summary' && <SummaryScreen db={db} />}
        {tab === 'settings' && <SettingsScreen db={db} goSubjects={() => go('subjects')} />}
      </main>
      {nav('tabbar')}
    </>
  );
}

init().then(() => {
  createRoot(document.getElementById('root')!).render(<UIProvider><App /></UIProvider>);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  // новая версия приложения встала — сразу перезагружаемся, чтобы не открывать дважды
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const check = () => reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => undefined);
  });
}
void nowTs;
