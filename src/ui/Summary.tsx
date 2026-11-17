import React from 'react';
import type { DB } from '../lib/types';
import * as E from '../lib/engine';
import { RU_WD_SHORT, addDays, fmtDay, parseKey, weekday, keyOf } from '../lib/time';
import { today as todayOf } from '../lib/store';
import { Dot } from './common';

export function SummaryScreen({ db }: { db: DB }) {
  const t = todayOf(db);
  const plan = E.dayPlan(db, t);
  const st = E.streak(db, t);
  const { y } = parseKey(t);
  const yearT = E.totals(db, keyOf(y, 1, 1), t);
  const wStart = addDays(t, -weekday(t));
  const week = Array.from({ length: 7 }, (_, i) => E.dayPlan(db, addDays(wStart, i)));
  const weekT = E.totals(db, wStart, t);
  const subjects = db.subjects.filter((s) => !s.deleted && !s.archived).sort((a, b) => a.order - b.order);

  const weekRows = subjects.map((s) => {
    let planned = 0, done = 0;
    for (const p of week) { if (p.day > t || p.day < db.settings.planStart) continue; const it = p.items.find((i) => i.subject.id === s.id && !i.review); if (it) { planned += it.planned; done += it.done; } }
    return { s, planned, done };
  }).filter((r) => r.planned > 0 || r.done > 0);
  const behind = weekRows.filter((r) => r.planned > 0 && r.done / r.planned < 0.7).sort((a, b) => a.done / a.planned - b.done / b.planned)[0];

  return (
    <div>
      <div className="page-h"><div className="h1">Итоги</div></div>
      <div className="stats">
        <div className="stat"><b className="num">{st.days}</b><span>{E.plural(st.days, 'день', 'дня', 'дней')} подряд</span></div>
        <div className="stat"><b className="num">{Math.round(plan.pct * 100)}%</b><span>сегодня</span></div>
        <div className="stat"><b className="num">{E.fmtNum(Math.round(weekT.minutes / 6) / 10)}</b><span>ч за неделю</span></div>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div>
          <div className="h2" style={{ margin: '0 2px 8px' }}>Сегодня · {fmtDay(t)}</div>
          <div className="card list">
            {plan.items.length === 0 && <div className="li muted">{plan.kind === 'off' ? 'Выходной' : 'Занятий нет'}</div>}
            {plan.items.map((i) => (
              <div className="li" key={i.subject.id + (i.review ? 'r' : '')}>
                <Dot s={i.status} />
                <div className="grow"><div className="ttl">{i.review ? 'Повтор заученного' : i.subject.ru}</div><div className="sub">{i.label}</div></div>
                <div className="num" style={{ fontWeight: 600 }}>{i.review ? (i.done ? '✓' : '—') : `${E.fmtNum(i.done)}/${E.fmtNum(i.planned)}`}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="h2" style={{ margin: '0 2px 8px' }}>Неделя</div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, alignItems: 'end', height: 120 }}>
              {week.map((p) => {
                const tracked = p.day >= db.settings.planStart && p.day <= t;
                const h = p.items.length && tracked ? Math.max(4, p.pct * 100) : 4;
                return (
                  <div key={p.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                    <span className="num" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{p.items.length && tracked ? Math.round(p.pct * 100) : ''}</span>
                    <div style={{ width: '70%', height: `${h}%`, borderRadius: 6, background: p.items.length ? (tracked ? 'var(--accent)' : 'var(--bg2)') : 'transparent', border: p.items.length ? 0 : '1px dashed var(--line)', opacity: p.day === t ? 1 : 0.85 }} />
                    <span style={{ fontSize: 11, fontWeight: p.day === t ? 700 : 500 }}>{RU_WD_SHORT[weekday(p.day)]}</span>
                  </div>
                );
              })}
            </div>
            <div className="list" style={{ marginTop: 10 }}>
              {weekRows.map(({ s, planned, done }) => (
                <div className="li" key={s.id} style={{ padding: '6px 0', minHeight: 40 }}>
                  <span className="dot" style={{ background: s.color }} />
                  <div className="grow" style={{ fontSize: 14 }}>{s.ru}</div>
                  <div className="num muted" style={{ fontSize: 13 }}>{E.fmtNum(done)} из {E.fmtNum(planned)}</div>
                </div>
              ))}
            </div>
            {behind && <div className="answer" style={{ marginTop: 10 }}>Больше всего отстаёт <b>{behind.s.ru}</b>. Недобор сам разложится на ближайшие дни небольшими добавками.</div>}
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="h2">{y} год</div>
        <div className="stats">
          <div className="stat"><b className="num">{E.fmtNum(yearT.quran)}</b><span>стр. Корана выучено</span></div>
          <div className="stat"><b className="num">{E.fmtNum(yearT.pages)}</b><span>стр. прочитано</span></div>
          <div className="stat"><b className="num">{E.fmtNum(Math.round(yearT.minutes / 60))}</b><span>часов учёбы</span></div>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Часы считаются по таймеру, а если он не включался — по обычной длительности занятия.</div>
      </div>
    </div>
  );
}
