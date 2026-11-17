import React, { useState } from 'react';
import type { DB } from '../lib/types';
import * as E from '../lib/engine';
import { PRAYERS, PRAYER_RU, fmtMin } from '../lib/prayer';
import { RU_WD_SHORT, addDays, diffDays, fmtDay, fmtDayShort, keyOf, monthNameNom, monthShort, parseHM, parseKey, weekday, minuteOfStudyDay } from '../lib/time';
import { today as todayOf, nowTs } from '../lib/store';
import { anchorText } from './Now';
import { IBack, IChevron } from './icons';

type V = 'day' | 'week' | 'month' | 'half' | 'year';

export function PlanScreen({ db }: { db: DB }) {
  const [v, setV] = useState<V>('day');
  return (
    <div>
      <div className="page-h"><div className="h1">План</div></div>
      <div className="seg" role="tablist">
        {([['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['half', 'Полгода'], ['year', 'Год']] as [V, string][]).map(([k, t]) =>
          <button key={k} className={v === k ? 'on' : ''} onClick={() => setV(k)}>{t}</button>)}
      </div>
      <div style={{ marginTop: 16 }}>
        {v === 'day' && <DayView db={db} />}
        {v === 'week' && <WeekView db={db} />}
        {v === 'month' && <MonthView db={db} />}
        {v === 'half' && <Gantt db={db} months={6} />}
        {v === 'year' && <Gantt db={db} months={12} />}
      </div>
    </div>
  );
}

function DayView({ db }: { db: DB }) {
  const t = todayOf(db);
  const [day, setDay] = useState(t);
  const nowMin = minuteOfStudyDay(nowTs(), parseHM(db.settings.boundary));
  const plan = E.dayPlan(db, day, day === t ? nowMin : undefined);
  const S = parseHM(db.settings.wake) - 30, EE = parseHM(db.settings.sleep) + 10, K = 1.15;
  const y = (m: number) => (m - S) * K;
  const uni = plan.kind === 'normal' || plan.kind === 'light' ? weekday(day) <= 4 : false;
  const warnings = plan.items.flatMap((i) => i.insts.filter((x) => x.conflict).map((x) => `${i.subject.ru}: ${x.conflict}`));
  return (
    <div>
      <div className="between" style={{ marginBottom: 12 }}>
        <button className="btn sm" aria-label="Назад" onClick={() => setDay(addDays(day, -1))}><IBack /></button>
        <div style={{ textAlign: 'center' }}><b>{RU_WD_SHORT[weekday(day)]}, {fmtDay(day)}</b><div className="muted" style={{ fontSize: 12 }}>{plan.kind === 'off' ? 'выходной' : plan.kind === 'exam' ? 'экзамены' : plan.kind === 'light' ? 'лёгкий день' : `${plan.items.length} дел · ${Math.round(plan.pct * 100)}%`}</div></div>
        <button className="btn sm" aria-label="Вперёд" onClick={() => setDay(addDays(day, 1))}><IChevron /></button>
      </div>
      {warnings.length > 0 && <div className="chip warn" style={{ whiteSpace: 'normal', marginBottom: 10 }}>⚠︎ {warnings.join('; ')}. Время можно поменять в «Настройках → Расписание».</div>}
      <div className="card" style={{ padding: '16px 10px 16px 6px' }}>
        <div className="tl" style={{ height: y(EE) }}>
          {Array.from({ length: Math.ceil((EE - S) / 60) + 1 }, (_, i) => Math.ceil(S / 60) * 60 + i * 60).filter((m) => m <= EE).map((m) => (
            <React.Fragment key={m}><div className="hl" style={{ top: y(m) }} /><div className="hr num" style={{ top: y(m) }}>{fmtMin(m)}</div></React.Fragment>
          ))}
          {uni && <div className="uni" style={{ top: y(7 * 60 + 30), height: y(13 * 60) - y(7 * 60 + 30) }}>университет</div>}
          {PRAYERS.map((p) => <div key={p} className="pl" style={{ top: y(plan.prayers[p]) }}><span className="num">{PRAYER_RU[p]} {fmtMin(plan.prayers[p])}</span></div>)}
          {plan.items.flatMap((i) => i.insts.map((inst, k) => (
            <div key={i.subject.id + k + (i.review ? 'r' : '')} className={`blk ${i.status === 'done' ? 'done' : ''} ${inst.conflict ? 'warn' : ''}`}
              style={{ top: y(inst.start), height: Math.max(22, (inst.end - inst.start) * K - 2), borderLeft: `4px solid ${i.subject.color}` }}>
              <span><b>{i.review ? 'Повтор заученного' : i.subject.ru}</b> <span className="muted">{i.label}</span></span>
              <span className="muted num" style={{ whiteSpace: 'nowrap' }}>{anchorText(inst)}</span>
            </div>
          )))}
          {day === t && nowMin > S && nowMin < EE && <div style={{ position: 'absolute', left: -8, right: 0, top: y(nowMin), borderTop: '2px solid var(--ink)' }} />}
        </div>
      </div>
      {plan.paused.length > 0 && <div className="paused" style={{ marginTop: 8 }}>На паузе: {plan.paused.map((s) => s.ru).join(', ')}</div>}
    </div>
  );
}

const pctColor = (p: number | null) => p == null ? 'transparent' : `color-mix(in srgb, var(--done) ${Math.round(12 + p * 80)}%, var(--card))`;

function WeekView({ db }: { db: DB }) {
  const t = todayOf(db);
  const [off, setOff] = useState(0);
  const start = addDays(t, -weekday(t) + off * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const plans = days.map((d) => E.dayPlan(db, d));
  const subjects = db.subjects.filter((s) => !s.deleted && !s.archived).sort((a, b) => a.order - b.order);
  return (
    <div>
      <div className="between" style={{ marginBottom: 12 }}>
        <button className="btn sm" aria-label="Прошлая неделя" onClick={() => setOff(off - 1)}><IBack /></button>
        <b>{fmtDayShort(days[0])} – {fmtDayShort(days[6])}</b>
        <button className="btn sm" aria-label="Следующая неделя" onClick={() => setOff(off + 1)}><IChevron /></button>
      </div>
      <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
        <div className="wk" style={{ gridTemplateColumns: `84px repeat(7, minmax(30px,1fr))` }}>
          <div />
          {days.map((d) => <div key={d} style={{ textAlign: 'center', fontWeight: d === t ? 700 : 500, color: d === t ? 'var(--accent)' : 'var(--muted)' }}>{RU_WD_SHORT[weekday(d)]}<br /><span className="num">{parseKey(d).d}</span></div>)}
          {subjects.map((s) => (
            <React.Fragment key={s.id}>
              <div style={{ alignSelf: 'center', fontWeight: 600, fontSize: 12.5 }}>{s.ru.replace('Урок: Китаб ат-таухид', 'Урок (ср)')}</div>
              {plans.map((p) => {
                const it = p.items.find((i) => i.subject.id === s.id && !i.review);
                const paused = p.paused.some((x) => x.id === s.id);
                if (p.day < db.settings.planStart) return <div key={p.day} />;
                if (!it) return <div key={p.day} className="c" style={{ background: paused ? 'var(--warn-soft)' : 'transparent', color: 'var(--muted)' }}>{paused ? 'п' : ''}</div>;
                const pct = it.planned ? Math.min(1, it.done / it.planned) : 0;
                const future = p.day > t;
                return <div key={p.day} className="c num" style={{ background: future ? 'var(--bg2)' : pctColor(pct), color: pct > 0.6 && !future ? '#fff' : 'var(--ink2)' }}>{future ? '·' : pct >= 1 ? '✓' : pct > 0 ? Math.round(pct * 100) : ''}</div>;
              })}
            </React.Fragment>
          ))}
          <div style={{ fontWeight: 700, fontSize: 12.5, alignSelf: 'center' }}>День</div>
          {plans.map((p) => p.day < db.settings.planStart ? <div key={p.day} /> : <div key={p.day} className="c num" style={{ background: p.items.length && p.day <= t ? pctColor(p.pct) : 'var(--bg2)', color: p.pct > 0.6 ? '#fff' : 'var(--ink2)' }}>{p.items.length ? (p.day <= t ? `${Math.round(p.pct * 100)}` : '·') : 'вых'}</div>)}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>✓ — норма выполнена · число — процент · п — пауза на экзамены</div>
    </div>
  );
}

function MonthView({ db }: { db: DB }) {
  const t = todayOf(db);
  const [off, setOff] = useState(0);
  const { y, m } = parseKey(t);
  const mm = ((m - 1 + off) % 12 + 12) % 12 + 1;
  const yy = y + Math.floor((m - 1 + off) / 12);
  const first = keyOf(yy, mm, 1);
  const pad0 = weekday(first);
  const len = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const cells = Array.from({ length: len }, (_, i) => keyOf(yy, mm, i + 1));
  return (
    <div>
      <div className="between" style={{ marginBottom: 12 }}>
        <button className="btn sm" aria-label="Прошлый месяц" onClick={() => setOff(off - 1)}><IBack /></button>
        <b>{monthNameNom(mm)} {yy}</b>
        <button className="btn sm" aria-label="Следующий месяц" onClick={() => setOff(off + 1)}><IChevron /></button>
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="cal">
          {RU_WD_SHORT.map((w) => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{w}</div>)}
          {Array.from({ length: pad0 }, (_, i) => <div key={'p' + i} />)}
          {cells.map((d) => {
            const p = E.dayPlan(db, d);
            const past = d <= t && d >= db.settings.planStart;
            const bg = p.kind === 'off' ? 'transparent' : p.kind === 'exam' ? 'var(--warn-soft)' : past && p.items.length ? pctColor(p.pct) : 'var(--bg2)';
            return (
              <div key={d} className="d num" style={{ background: bg, border: d === t ? '2px solid var(--accent)' : '1px solid transparent', color: past && p.pct > 0.6 ? '#fff' : 'var(--ink)' }}>
                {parseKey(d).d}
                <small>{p.kind === 'off' ? 'вых' : past && p.items.length ? `${Math.round(p.pct * 100)}%` : p.kind === 'exam' ? 'экз' : p.items.length ? p.items.length : ''}</small>
              </div>
            );
          })}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Прошедшие дни — процент выполнения, будущие — число дел.</div>
    </div>
  );
}

function Gantt({ db, months }: { db: DB; months: number }) {
  const t = todayOf(db);
  const { y, m } = parseKey(t);
  const start = keyOf(y, m, 1);
  const endM = ((m - 1 + months) % 12) + 1, endY = y + Math.floor((m - 1 + months) / 12);
  const end = keyOf(endY, endM, 1);
  const span = diffDays(start, end);
  const X = (d: string) => `${Math.max(0, Math.min(100, (diffDays(start, d) / span) * 100))}%`;
  const subjects = db.subjects.filter((s) => !s.deleted && !s.archived && s.mode === 'queue').sort((a, b) => a.order - b.order);
  const goal = E.countdownTarget(db, t);
  const ticks = Array.from({ length: months }, (_, i) => { const mm = ((m - 1 + i) % 12) + 1; const yy = y + Math.floor((m - 1 + i) / 12); return keyOf(yy, mm, 1); });

  return (
    <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
      <div className="gantt" style={{ minWidth: months > 6 ? 640 : 0 }}>
        <div className="gr" style={{ minHeight: 26 }}>
          <div />
          <div className="gt" style={{ height: 26 }}>
            {ticks.map((d) => <div key={d} className="gm" style={{ left: X(d), paddingLeft: 3 }}>{monthShort(parseKey(d).m)}</div>)}
          </div>
        </div>
        {subjects.map((s) => {
          let cursor = t;
          const bars = E.queue(db, s.id).map((r) => {
            const fin = E.finishedDay(db, r);
            if (fin) { const st = E.startedDay(db, r) ?? fin; return { r, a: st, b: fin, kind: 'done' as const }; }
            const fc = E.forecast(db, r, t);
            const b = fc.real ?? fc.ideal;
            const a = cursor;
            if (b) cursor = addDays(b, 1);
            return { r, a, b: b ?? addDays(end, 30), kind: b ? 'plan' as const : 'open' as const };
          });
          return (
            <div className="gr" key={s.id}>
              <div className="gl">{s.ru}</div>
              <div className="gt">
                {db.settings.exams.map((p) => <div key={p.id} className="gx" style={{ left: X(p.from), width: `calc(${X(addDays(p.to, 1))} - ${X(p.from)})` }} />)}
                {bars.filter((b) => b.b >= start && b.a <= end).map(({ r, a, b, kind }) => (
                  <div key={r.id} className="gb ar" title={r.title}
                    style={{ left: X(a), width: `max(6px, calc(${X(b)} - ${X(a)}))`, background: s.color, opacity: kind === 'done' ? 0.45 : kind === 'open' ? 0.55 : 1, backgroundImage: kind === 'open' ? 'repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 6px,transparent 6px 12px)' : undefined }}>
                    {r.title}
                  </div>
                ))}
                <div className="gg" style={{ left: X(t), borderLeftColor: 'var(--ink)', borderLeftWidth: 1.5 }} />
                {goal.day <= end && <div className="gg" style={{ left: X(goal.day) }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
        Полоски — книги по прогнозу. Тёмная линия — сегодня, золотая — цель «{goal.label}» ({fmtDay(goal.day, true)}). Жёлтая полоса — экзамены. Заштриховано — срок пока не посчитать (не указан объём или норма в минутах).
      </div>
    </div>
  );
}
