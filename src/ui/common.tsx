import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { DB, Resource, Subject, LogEntry } from '../lib/types';
import * as E from '../lib/engine';
import { addLog, undoGroup, nowTs, getDB, today } from '../lib/store';
import { addDays, fmtDayShort } from '../lib/time';
import { ICheck, IMinus, IPlus } from './icons';

/* ---------- часы ---------- */
export function useNow(intervalMs = 1000): number {
  const [t, setT] = useState(nowTs());
  useEffect(() => { const id = window.setInterval(() => setT(nowTs()), intervalMs); return () => window.clearInterval(id); }, [intervalMs]);
  return t;
}

/* ---------- таймер занятия ---------- */
export interface TimerState { subjectId: string; resourceId: string; start: number }
const TKEY = 'minhaj-timer';
export function getTimer(): TimerState | null { try { return JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch { return null; } }
export function setTimer(t: TimerState | null) { try { t ? localStorage.setItem(TKEY, JSON.stringify(t)) : localStorage.removeItem(TKEY); } catch { /**/ } window.dispatchEvent(new Event('minhaj-timer')); }
export function useTimer(): TimerState | null {
  const [t, set] = useState(getTimer());
  useEffect(() => { const f = () => set(getTimer()); window.addEventListener('minhaj-timer', f); return () => window.removeEventListener('minhaj-timer', f); }, []);
  return t;
}

/* ---------- UI-контекст: тост, лист отметки, поздравление ---------- */
interface SheetReq { subject: Subject; resource: Resource; review?: boolean; minutes?: number; preset?: number }
interface Ctx {
  toast: (text: string, group?: string) => void;
  openLog: (r: SheetReq) => void;
  quick: (item: E.PlanItem) => void;
  celebrate: (title: string, next?: string) => void;
}
const UICtx = createContext<Ctx>(null as unknown as Ctx);
export const useUI = () => useContext(UICtx);

/** Сколько отмечать основной кнопкой. */
export function primaryAmount(db: DB, item: { subject: Subject; resource: Resource | null; planned: number; done: number }): number {
  const r = item.resource!;
  if (item.subject.mode === 'cycle') return Math.max(1, Math.round(item.planned - item.done) || E.norm(db, r));
  if (r.unit === 'page') return Math.max(1, Math.ceil(item.planned - item.done) || E.norm(db, r));
  return 1;
}

export function primaryLabel(db: DB, item: { subject: Subject; resource: Resource | null; review?: boolean; planned: number; done: number }): string {
  if (item.review) return 'Повторил';
  const r = item.resource;
  if (!r) return 'Отметить';
  if (r.minutesPerDay) return 'Отметить занятие';
  if (item.subject.mode === 'weekly') return 'Урок пройден';
  if (item.subject.mode === 'cycle') {
    const n = primaryAmount(db, item);
    return n % 2 === 0 ? `Повторил ${n / 2} ${E.plural(n / 2, 'лист', 'листа', 'листов')}` : `Повторил ${n} стр.`;
  }
  switch (r.unit) {
    case 'qpage': return 'Выучил страницу';
    case 'page': return `Прочитал ${primaryAmount(db, item)} стр.`;
    case 'record': return 'Прослушал';
    case 'video': return 'Посмотрел';
    case 'lesson': return 'Урок пройден';
    case 'hadith': return 'Выучил хадис';
    case 'chunk': return 'Выучил отрывок';
  }
}

function describe(db: DB, logs: LogEntry[]): string {
  const l = logs[0];
  const s = E.subjectById(db, l.subjectId);
  if (l.kind === 'review') return `${s.ru}: повтор отмечен`;
  const r = E.resourceById(db, l.resourceId)!;
  const total = logs.reduce((a, x) => a + x.units, 0);
  return `${s.ru}: +${E.fmtNum(total)} ${E.unitWord(r.unit, total)}`;
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toastS, setToast] = useState<{ text: string; group?: string; id: number } | null>(null);
  const [sheet, setSheet] = useState<SheetReq | null>(null);
  const [cong, setCong] = useState<{ title: string; next?: string } | null>(null);
  const timer = useRef<number>();

  const api = useMemo<Ctx>(() => {
    const toast = (text: string, group?: string) => {
      window.clearTimeout(timer.current);
      setToast({ text, group, id: Date.now() });
      timer.current = window.setTimeout(() => setToast(null), 10000);
    };
    const celebrate = (title: string, next?: string) => setCong({ title, next });
    const afterLog = (before: DB, created: LogEntry[]) => {
      toast(describe(getDB(), created), created[0]?.group);
      // книга пройдена?
      for (const l of created) {
        const r = E.resourceById(before, l.resourceId);
        if (r && !E.isFinished(before, r) && E.isFinished(getDB(), r)) {
          const next = E.active(getDB(), r.subjectId);
          celebrate(r.title, next ? next.title : undefined);
        }
      }
    };
    return {
      toast, celebrate,
      openLog: (r) => setSheet(r),
      quick: (item) => {
        const db = getDB();
        if (!item.resource && !item.review) return;
        if (item.review) { afterLog(db, addLog({ resourceId: item.resource?.id ?? item.subject.id, subjectId: item.subject.id, units: 0, kind: 'review' })); return; }
        if (item.subject.mode === 'weekly') { setSheet({ subject: item.subject, resource: item.resource! }); return; }
        if (item.resource!.minutesPerDay) { setSheet({ subject: item.subject, resource: item.resource!, minutes: item.resource!.minutesPerDay }); return; }
        afterLog(db, addLog({ resourceId: item.resource!.id, units: primaryAmount(db, item) }));
      },
    };
  }, []);

  return (
    <UICtx.Provider value={api}>
      {children}
      {sheet && <LogSheet req={sheet} onClose={() => setSheet(null)} onSaved={(before, created) => {
        setSheet(null);
        toastAfter(api, before, created);
      }} />}
      {toastS && (
        <div className="toast" role="status" key={toastS.id}>
          <span>{toastS.text}</span>
          {toastS.group && <button onClick={() => { undoGroup(toastS.group!); setToast({ text: 'Отметка отменена', id: Date.now() }); window.setTimeout(() => setToast(null), 2500); }}>Отменить</button>}
        </div>
      )}
      {cong && (
        <div className="congrats" onClick={() => setCong(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700, letterSpacing: '.6px' }}>КНИГА ПРОЙДЕНА</div>
            <div className="ar" style={{ fontSize: 30 }}>{cong.title}</div>
            <div className="ar" style={{ fontSize: 20, color: 'var(--accent)' }}>بارك الله فيك</div>
            {cong.next && <div className="muted" style={{ fontSize: 14 }}>Дальше: <span className="ar" style={{ fontSize: 18, color: 'var(--ink)' }}>{cong.next}</span></div>}
            <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={() => setCong(null)}>Продолжить</button>
          </div>
        </div>
      )}
    </UICtx.Provider>
  );
}

function toastAfter(api: Ctx, before: DB, created: LogEntry[]) {
  if (!created.length) return;
  api.toast(describe(getDB(), created), created[0].group);
  for (const l of created) {
    const r = E.resourceById(before, l.resourceId);
    if (r && !E.isFinished(before, r) && E.isFinished(getDB(), r)) {
      const next = E.active(getDB(), r.subjectId);
      api.celebrate(r.title, next ? next.title : undefined);
    }
  }
}

/* ---------- лист отметки ---------- */
function LogSheet({ req, onClose, onSaved }: { req: SheetReq; onClose: () => void; onSaved: (before: DB, created: LogEntry[]) => void }) {
  const db = getDB();
  const { subject, resource: r } = req;
  const pos = Math.floor(E.position(db, r));
  const isPages = r.unit === 'page' || r.unit === 'qpage' || subject.mode === 'cycle';
  const byMinutes = !!r.minutesPerDay;
  const planItem = E.dayPlan(db, today(db)).items.find((i) => i.subject.id === subject.id && !i.review);
  const def = req.preset ?? (byMinutes ? 10 : isPages ? Math.max(1, Math.ceil((planItem?.planned ?? E.norm(db, r)) - (planItem?.done ?? 0))) : 1);
  const [mode, setMode] = useState<'count' | 'upto'>(subject.mode === 'weekly' ? 'upto' : 'count');
  const [n, setN] = useState<number>(def);
  const [upto, setUpto] = useState<number>(subject.mode === 'weekly' ? pos + 4 : pos + def - 1);
  const [mins, setMins] = useState<number | undefined>(req.minutes);
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'today' | 'yest'>('today');
  const step = isPages ? 1 : 0.5;
  const amount = mode === 'upto' ? Math.max(0, upto - pos + 1) : n;

  const save = () => {
    const before = getDB();
    const d = day === 'today' ? today(before) : addDays(today(before), -1);
    const created = req.review
      ? addLog({ resourceId: r.id, subjectId: subject.id, units: 0, kind: 'review', note: note || undefined, minutes: mins }, d)
      : addLog({ resourceId: r.id, units: amount, minutes: mins, note: note || undefined }, d);
    onSaved(before, created);
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Отметка">
        <div className="grab" />
        <div className="between">
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{subject.ru}</div>
            <div className="muted" style={{ fontSize: 13 }}>{byMinutes ? `сейчас на стр. ${pos}` : `сейчас: ${E.UNIT_SHORT[r.unit]} ${pos}`}</div>
          </div>
          <div className="ar" style={{ fontSize: 24 }}>{r.title}</div>
        </div>

        {!req.review && isPages && (
          <div className="seg" style={{ marginTop: 14 }}>
            <button className={mode === 'count' ? 'on' : ''} onClick={() => setMode('count')}>Сколько страниц</button>
            <button className={mode === 'upto' ? 'on' : ''} onClick={() => setMode('upto')}>Дошёл до стр.</button>
          </div>
        )}

        {!req.review && (
          <div className="stepper">
            <button className="btn" aria-label="меньше" onClick={() => mode === 'upto' ? setUpto(Math.max(pos - 1, upto - 1)) : setN(Math.max(step, +(n - step).toFixed(1)))}><IMinus /></button>
            <div className="v num">{mode === 'upto' ? upto : E.fmtNum(n)}</div>
            <button className="btn" aria-label="больше" onClick={() => mode === 'upto' ? setUpto(upto + 1) : setN(+(n + step).toFixed(1))}><IPlus /></button>
          </div>
        )}
        {!req.review && (
          <div className="muted" style={{ textAlign: 'center', fontSize: 13, marginTop: 4 }}>
            {mode === 'upto' ? `это ${amount} стр.` : E.unitWord(r.unit, n)}
          </div>
        )}
        {!req.review && (
          <div className="quick" style={{ gridTemplateColumns: `repeat(${isPages ? 4 : 3},1fr)` }}>
            {(isPages ? [1, 5, 10, 20] : [0.5, 1, 2]).map((q) => (
              <button key={q} className={`btn sm ${mode === 'count' && n === q ? 'soft' : ''}`} onClick={() => { setMode('count'); setN(q); }}>{isPages ? `${q} стр.` : q === 0.5 ? '½' : `${q}`}</button>
            ))}
          </div>
        )}

        <div className="label">Время занятия</div>
        <div className="toggle">
          {[15, 30, 45, 60, 90].map((m) => (
            <button key={m} className={mins === m ? 'on' : ''} onClick={() => setMins(mins === m ? undefined : m)}>{m} мин</button>
          ))}
        </div>

        <div className="label">Заметка (необязательно)</div>
        <input className="field" placeholder="вопрос к шейху, фаида, непонятное место…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />

        <div className="seg" style={{ marginTop: 14 }}>
          <button className={day === 'today' ? 'on' : ''} onClick={() => setDay('today')}>Сегодня</button>
          <button className={day === 'yest' ? 'on' : ''} onClick={() => setDay('yest')}>Вчера · {fmtDayShort(addDays(today(db), -1))}</button>
        </div>

        <button className="btn primary" style={{ width: '100%', marginTop: 16, minHeight: 56 }} onClick={save} disabled={!req.review && amount <= 0}>
          <ICheck /> Сохранить
        </button>
      </div>
    </div>
  );
}

/* ---------- мелочи ---------- */
export function Dot({ s }: { s: E.Status | 'cur' }) { return <i className={`dot ${s}`} />; }

export function Sheet({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={label}>
        <div className="grab" />{children}
      </div>
    </div>
  );
}
