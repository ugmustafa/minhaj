import React, { useMemo, useState } from 'react';
import type { DB } from '../lib/types';
import * as E from '../lib/engine';
import { PRAYER_RU, PRAYER_GEN, PRAYERS, fmtMin } from '../lib/prayer';
import { RU_WD, fmtDay, hijri, minuteOfStudyDay, parseHM, tsOf, addDays, weekday } from '../lib/time';
import { setDayMode, today as todayOf } from '../lib/store';
import { useUI, useTimer, setTimer, primaryLabel, Dot } from './common';
import { ICheck, ITimer, IStop, IAsk, IMore, IWarn, IFeather, Star8 } from './icons';

const AFTER: Record<string, string> = { fajr: 'после Фаджра', dhuhr: 'после Зухра', asr: 'после Асра', maghrib: 'после Магриба', isha: 'после Иша', sunrise: 'после восхода' };
export function anchorText(inst: E.SlotInst): string {
  const a = inst.slot.anchor;
  const range = `${fmtMin(inst.start)}–${fmtMin(inst.end)}`;
  if (inst.makeup) return `добор · ${range}`;
  if (inst.moved) return `перенесено · ${range}`;
  if (a.kind === 'prayer') return `${a.offset >= 0 ? AFTER[a.prayer] : 'до ' + PRAYER_RU[a.prayer]} · ${range}`;
  return range;
}

export function kicker(db: DB, it: E.PlanItem): string {
  const r = it.resource;
  if (it.review) return 'Повтор заученного';
  if (!r) return '';
  const f = Math.floor(it.from);
  if (it.subject.mode === 'cycle') return 'Круг повторения';
  if (r.minutesPerDay) return 'Второй проход · чтение';
  switch (r.unit) {
    case 'qpage': return `Страница ${f} из 604`;
    case 'record': return `Запись ${f} из ${r.last}`;
    case 'video': return `Видео ${f} из ${r.last}`;
    case 'hadith': return `Хадис ${f} из ${r.last}`;
    case 'page': return r.last ? `Стр. ${f} из ${r.last}` : `Стр. ${f}`;
    default: return '';
  }
}

export function NowScreen({ db, now }: { db: DB; now: number }) {
  const ui = useUI();
  const timer = useTimer();
  const day = todayOf(db);
  const nowMin = minuteOfStudyDay(now, parseHM(db.settings.boundary), db.settings.tzMin);
  const plan = useMemo(() => E.dayPlan(db, day, nowMin), [db, day, Math.floor(nowMin)]);
  const f = E.focus(plan, nowMin);
  const [answer, setAnswer] = useState<E.Focus | null>(null);
  const h = hijri(day);
  const cd = E.countdownTarget(db, day);
  const left = Math.max(0, tsOf(cd.day, 0, db.settings.tzMin) - now);
  const D = Math.floor(left / 86400000), H = Math.floor(left / 3600000) % 24, M = Math.floor(left / 60000) % 60, S = Math.floor(left / 1000) % 60;
  const np = E.nextPrayer(plan.prayers, nowMin);
  const it = f.item;
  const r = it?.resource ?? null;
  const fc = r && it && !it.review && it.subject.mode === 'queue' ? E.forecast(db, r, day) : null;
  const prog = r && r.last && it?.subject.mode === 'queue' ? Math.min(1, (E.position(db, r) - 1) / r.last) : null;
  const timerOn = timer && it && timer.subjectId === it.subject.id;
  const kind = plan.kind;

  // Вечерний итог
  const isha = plan.prayers.isha;
  const showEvening = nowMin >= isha + 10 && plan.items.length > 0 && !accepted(day);

  return (
    <div className="now-grid">
      <header className="top">
        <div className="date">
          <b>{RU_WD[weekday(day)]}, {fmtDay(day)}</b>
          <span className="ar">{h.text}</span>
        </div>
        <div className="cd" aria-label="Отсчёт">
          <div className="lbl">{cd.label}</div>
          <div className="val num">{D}<small>д</small>{String(H).padStart(2, '0')}<small>ч</small>{String(M).padStart(2, '0')}<small>м</small>{String(S).padStart(2, '0')}<small>с</small></div>
        </div>
      </header>

      <div className="colA">
        {showEvening ? <div className="ev-narrow"><Evening db={db} plan={plan} day={day} /></div> : null}
        {it && r ? (
          <section className="card focus" aria-label="Текущее дело">
            <span className="accentbar" style={{ background: it.subject.color }} />
            <span className="pattern" style={{ right: -50, top: -50 }}><Star8 size={230} /></span>
            <div className="meta">
              <span className={`chip ${f.state === 'catchup' ? 'gold' : ''}`}>
                {it.subject.ru} · {f.state === 'in' ? 'сейчас' : f.state === 'next' ? `через ${E.fmtDur(f.minutesTo)}` : f.state === 'catchup' ? 'можно добрать' : 'дальше'}
              </span>
              {f.inst && <span className="slot num">{anchorText(f.inst)}</span>}
            </div>
            {f.inst?.conflict && <div className="chip warn" style={{ marginTop: 10 }}><IWarn size={14} /> {f.inst.conflict}</div>}
            <div className="kicker">{kicker(db, it)}</div>
            <div className="book ar">{r.title}{r.author ? <small> · {r.author}</small> : null}</div>
            <div className="what num">{it.label}</div>
            <div className="sub">{subline(db, it, fc)}</div>
            {prog != null && <div className="bar"><i style={{ width: `${prog * 100}%`, background: it.subject.color }} /></div>}
            <div className="nx">
              <div><span>Дальше</span>{(() => { const n = nextAfter(plan, it, nowMin); return n ? <><b>{n.i.subject.ru}</b><em className="num">{fmtMin(n.inst.start)} · {n.i.label}</em></> : <><b>—</b><em>на сегодня всё</em></>; })()}</div>
              <div><span>{np ? `До ${PRAYER_GEN[np.key]}` : 'До сна'}</span><b className="num">{np ? E.fmtDur(np.at - nowMin) : E.fmtDur(parseHM(db.settings.sleep) - nowMin)}</b><em className="num">{np ? fmtMin(np.at) : db.settings.sleep}</em></div>
            </div>
            <div className="acts">
              <button className="btn primary" onClick={() => ui.quick(it)}><ICheck /> {primaryLabel(db, it)}</button>
              {(r.unit === 'record' || r.unit === 'video') && !it.review
                ? <button className="btn" aria-label="Половина" onClick={() => ui.openLog({ subject: it.subject, resource: r, preset: 0.5 })} style={{ minWidth: 56, fontSize: 20 }}>½</button>
                : <button className="btn" aria-label="Другое количество" onClick={() => ui.openLog({ subject: it.subject, resource: r, review: it.review })} style={{ minWidth: 56 }}><IMore /></button>}
              {timerOn
                ? <button className="btn soft timer" onClick={() => { const m = Math.max(1, Math.round((Date.now() - timer!.start) / 60000)); setTimer(null); ui.openLog({ subject: it.subject, resource: r, minutes: m, review: it.review }); }}><IStop /> <TimerText start={timer!.start} /></button>
                : <button className="btn" aria-label="Таймер" style={{ minWidth: 56 }} onClick={() => setTimer({ subjectId: it.subject.id, resourceId: r.id, start: Date.now() })}><ITimer /></button>}
            </div>
          </section>
        ) : (
          <section className="card focus calm">
            <span className="pattern" style={{ right: -40, top: -40 }}><Star8 size={200} /></span>
            <div className="ar" style={{ fontSize: 26, color: 'var(--accent)' }}>{f.state === 'done' ? 'الحمد لله' : 'بسم الله'}</div>
            <div className="big">{f.reason}</div>
            <div className="muted" style={{ fontSize: 14 }}>
              {f.state === 'done' ? tomorrowLine(db, day) : kind === 'off' ? 'Отдыхайте — завтра продолжим' : ''}
            </div>
          </section>
        )}
        <button className="ask" onClick={() => setAnswer(answer ? null : E.focus(plan, nowMin, true))}><IAsk size={18} /> Что делать сейчас?</button>
        {answer && <Answer db={db} f={answer} plan={plan} nowMin={nowMin} />}
      </div>

      <DayStrip db={db} plan={plan} nowMin={nowMin} />

      <div className="colB">
        {showEvening ? <div className="ev-wide"><Evening db={db} plan={plan} day={day} /></div> : null}
        <div className="today-h">
          <div className="row">
            <span className="h2">Сегодня</span>
            {kind === 'exam' && <span className="chip warn">экзамены</span>}
            {kind === 'light' && <span className="chip gold">лёгкий день</span>}
          </div>
          <div className="ring"><b className="num">{plan.doneCount} из {plan.totalCount}</b><span className="num">· {Math.round(plan.pct * 100)}%</span></div>
        </div>
        <div className="items">
          {plan.items.map((x) => {
            const cur = it === x;
            const conflict = x.insts.find((i) => i.conflict);
            return (
              <button key={x.subject.id + (x.review ? 'r' : '')} className={`it ${x.status} ${cur ? 'cur' : ''}`}
                onClick={() => x.resource && ui.openLog({ subject: x.subject, resource: x.resource, review: x.review })}
                aria-label={`${x.subject.ru}: ${x.label}`}>
                <div className="t">{x.review ? 'Повтор заученного' : x.subject.ru} <em className="num">{x.insts.some((i) => i.makeup) && x.status !== 'done' ? 'добор ' : ''}{fmtMin(x.start)}{conflict ? <span className="warnmark"> ⚠︎</span> : null}</em></div>
                <div className="d"><Dot s={cur && x.status !== 'done' ? 'cur' : x.status} />{x.status === 'part' ? `${E.fmtNum(x.done)} из ${E.fmtNum(x.planned)} · ` : ''}{x.label.replace(/^(запис[ьи] [\d–]+(?: \(2-я половина\))?) · стр\..*$/, '$1')}{x.addon > 0 ? ` (+${E.fmtNum(x.addon)})` : ''}</div>
              </button>
            );
          })}
        </div>
        {plan.paused.length > 0 && <div className="paused">На паузе до конца экзаменов: {plan.paused.map((s) => s.ru).join(', ')}</div>}
        {plan.items.length > 0 && (
          <button className="btn ghost sm" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }}
            onClick={() => setDayMode(day, kind === 'light' ? 'normal' : 'light')}>
            <IFeather size={18} /> {kind === 'light' ? 'Вернуть обычный день' : 'Лёгкий день (½ нормы)'}
          </button>
        )}
      </div>
    </div>
  );
}

function subline(db: DB, it: E.PlanItem, fc: E.Forecast | null): string {
  const r = it.resource!;
  if (it.subject.mode === 'cycle') {
    const c = E.cycleForecast(db, r, todayOf(db));
    return `круг по ${c.learned} стр. · закончится ≈ ${c.day ? fmtDay(c.day) : '—'}`;
  }
  const parts: string[] = [];
  if (it.addon > 0) parts.push(`с добором +${E.fmtNum(it.addon)}`);
  const rem = E.remaining(db, r);
  if (rem != null) parts.push(`осталось ${E.fmtNum(rem)} ${E.unitWord(r.unit, rem)}`);
  if (fc?.ideal) parts.push(`закончите ≈ ${fmtDay(fc.real ?? fc.ideal)}`);
  if (it.review) return 'матн и хадисы — 30 минут';
  return parts.join(' · ');
}

function nextAfter(plan: E.DayPlan, cur: E.PlanItem, nowMin: number) {
  const insts = plan.items.filter((i) => i !== cur && i.status !== 'done').flatMap((i) => i.insts.map((inst) => ({ i, inst }))).sort((a, b) => a.inst.start - b.inst.start);
  return insts.find(({ inst }) => inst.start > nowMin) ?? null;
}

function tomorrowLine(db: DB, day: string): string {
  for (let i = 1; i < 4; i++) {
    const p = E.dayPlan(db, addDays(day, i));
    if (p.items.length) return `${i === 1 ? 'Завтра' : fmtDay(p.day)}: первое дело — ${p.items[0].subject.ru} в ${fmtMin(p.items[0].start)}`;
  }
  return '';
}

function TimerText({ start }: { start: number }) {
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
  return <span className="num">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}

function Answer({ db, f, plan, nowMin }: { db: DB; f: E.Focus; plan: E.DayPlan; nowMin: number }) {
  const ui = useUI();
  const np = E.nextPrayer(plan.prayers, nowMin);
  return (
    <div className="answer" role="status">
      {f.item ? <><b>{f.item.subject.ru}</b> — {f.item.label}. </> : null}
      {f.reason}{np && f.state !== 'prayer' ? `. До ${PRAYER_GEN[np.key]} — ${E.fmtDur(np.at - nowMin)}` : ''}.
      {f.item?.resource && f.state !== 'prayer' && (
        <div style={{ marginTop: 10 }}>
          <button className="btn sm primary" onClick={() => ui.openLog({ subject: f.item!.subject, resource: f.item!.resource!, review: f.item!.review })}>Отметить</button>
        </div>
      )}
    </div>
  );
}

/* ---------- полоса дня ---------- */
export function DayStrip({ db, plan, nowMin }: { db: DB; plan: E.DayPlan; nowMin: number }) {
  const S = parseHM(db.settings.wake), EE = parseHM(db.settings.sleep);
  const U0 = 7 * 60 + 30, U1 = 13 * 60, K = 0.3;
  const uni = plan.kind !== 'off' && weekday(plan.day) <= 4 && plan.kind !== 'exam';
  const X = (m: number) => (!uni ? m - S : m <= U0 ? m - S : m <= U1 ? (U0 - S) + (m - U0) * K : (U0 - S) + (U1 - U0) * K + (m - U1));
  const T = X(EE);
  const P = (m: number) => `${Math.max(0, Math.min(100, (X(m) / T) * 100))}%`;
  const W = (a: number, b: number) => `${Math.max(0.6, ((X(b) - X(a)) / T) * 100)}%`;
  const segs = plan.items.flatMap((i) => i.insts.map((inst) => ({ i, inst })));
  return (
    <section className="card strip" aria-label="Полоса дня">
      <div className="track">
        <div className="base" />
        {uni && <i className="sg uni" style={{ left: P(U0), width: W(U0, U1) }} />}
        {segs.map(({ i, inst }, k) => {
          const cur = inst.start <= nowMin && inst.end > nowMin && i.status !== 'done';
          return <i key={k} className={`sg ${cur ? 'cur' : i.status}`} style={{ left: P(inst.start), width: W(inst.start, inst.end) }} />;
        })}
        {PRAYERS.map((p) => <i key={p} className="pr" style={{ left: P(plan.prayers[p]) }} />)}
        {nowMin >= S && nowMin <= EE && <i className="nowl" style={{ left: P(nowMin) }} />}
      </div>
      <div className="lbls">
        {PRAYERS.map((p) => <div key={p} style={{ left: P(plan.prayers[p]) }}><b>{PRAYER_RU[p]}</b><span className="num">{fmtMin(plan.prayers[p])}</span></div>)}
      </div>
    </section>
  );
}

/* ---------- вечерний итог ---------- */
const accKey = (d: string) => `minhaj-evening-${d}`;
function accepted(day: string) { try { return localStorage.getItem(accKey(day)) === '1'; } catch { return false; } }

function Evening({ db, plan, day }: { db: DB; plan: E.DayPlan; day: string }) {
  const [, force] = useState(0);
  const open = plan.items.filter((i) => i.status !== 'done' && !i.review);
  const tomorrow = (() => { for (let i = 1; i < 4; i++) { const p = E.dayPlan(db, addDays(day, i)); if (p.items.length) return p; } return null; })();
  const lines: string[] = [];
  lines.push(`Сделано ${plan.doneCount} из ${plan.totalCount} (${Math.round(plan.pct * 100)}%).`);
  if (open.length) lines.push(`Перенесётся понемногу на следующие дни: ${open.map((i) => i.subject.ru).join(', ')}.`);
  if (tomorrow) {
    const adds = tomorrow.items.filter((i) => i.addon > 0);
    lines.push(`${tomorrow.day === addDays(day, 1) ? 'Завтра' : fmtDay(tomorrow.day)}: ${tomorrow.items.length} дел, первое — ${tomorrow.items[0].subject.ru} в ${fmtMin(tomorrow.items[0].start)}.`);
    if (adds.length) lines.push(`Добор: ${adds.map((i) => `${i.subject.ru} +${E.fmtNum(i.addon)}`).join(', ')}.`);
  }
  return (
    <section className="card" style={{ padding: 16 }}>
      <div className="between"><span className="h2">Итог дня</span><span className="ar" style={{ color: 'var(--accent)', fontSize: 18 }}>تقبل الله</span></div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, lineHeight: 1.45 }}>
        {lines.slice(0, 5).map((l, i) => <div key={i}>{l}</div>)}
      </div>
      <button className="btn soft" style={{ width: '100%', marginTop: 12 }} onClick={() => { try { localStorage.setItem(accKey(day), '1'); } catch { /**/ } force((x) => x + 1); }}>Принять</button>
    </section>
  );
}
