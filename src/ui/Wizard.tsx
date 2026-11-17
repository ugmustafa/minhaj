import React, { useState } from 'react';
import type { DB } from '../lib/types';
import * as E from '../lib/engine';
import { RU_WD_SHORT } from '../lib/time';
import { setSettings, upsert, today as todayOf } from '../lib/store';
import { anchorText } from './Now';
import { IMinus, IPlus, ICheck } from './icons';

export function Wizard({ db }: { db: DB }) {
  const [step, setStep] = useState(0);
  const t = todayOf(db);
  const subjects = db.subjects.filter((s) => !s.deleted).sort((a, b) => a.order - b.order);
  return (
    <div className="wizard">
      <div className="steps"><i className="on" /><i className={step ? 'on' : ''} /></div>
      <div className="between">
        <div className="h1">{step === 0 ? 'Предметы и книги' : 'Время занятий'}</div>
        <span className="logo" style={{ fontSize: 28 }}>منهاج</span>
      </div>

      {step === 0 && (
        <>
          <div className="card list">
            {subjects.map((s) => {
              const r = s.mode === 'alternate' ? E.streams(db, s.id) : [E.active(db, s.id)].filter(Boolean) as NonNullable<ReturnType<typeof E.active>>[];
              return r.map((res) => {
                const pos = s.mode === 'cycle' ? E.murajaCursor(db, res).cursor : Math.floor(E.position(db, res));
                const nrm = E.norm(db, res);
                const noLogs = !(E.index(db).byRes.get(res.id)?.length);
                return (
                  <div className="li" key={res.id} style={{ alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }}>
                    <span className="dot" style={{ background: s.color, marginTop: 6 }} />
                    <div className="grow">
                      <div className="between"><div className="ttl">{s.ru}</div><div className="ar" style={{ fontSize: 19 }}>{res.title}</div></div>
                      <div className="between" style={{ marginTop: 6 }}>
                        <span className="sub num">сейчас: {E.UNIT_SHORT[res.unit]} {pos}{res.last ? ` из ${res.last}` : ''}</span>
                        {noLogs && (
                          <span className="row" style={{ gap: 6 }}>
                            <button className="btn sm" aria-label="раньше" onClick={() => upsert('resources', { ...res, first: Math.max(1, res.first - 1) })}><IMinus size={16} /></button>
                            <button className="btn sm" aria-label="дальше" onClick={() => upsert('resources', { ...res, first: res.first + 1 })}><IPlus size={16} /></button>
                          </span>
                        )}
                      </div>
                      <div className="sub num">норма: {E.fmtNum(nrm)} {res.minutesPerDay ? 'мин' : E.unitWord(res.unit, nrm)} в день</div>
                    </div>
                  </div>
                );
              });
            })}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>Всё взято из ваших ответов. Очереди книг, нормы и объёмы можно поменять позже в «Предметах».</div>
          <button className="btn primary" style={{ minHeight: 56 }} onClick={() => { setStep(1); window.scrollTo(0, 0); }}>Всё верно — дальше</button>
        </>
      )}

      {step === 1 && (
        <>
          <div className="card list">
            <div className="li"><div className="grow ttl">Подъём</div><input type="time" className="field" style={{ width: 120 }} value={db.settings.wake} onChange={(e) => setSettings({ wake: e.target.value })} /></div>
            <div className="li"><div className="grow ttl">Сон</div><input type="time" className="field" style={{ width: 120 }} value={db.settings.sleep} onChange={(e) => setSettings({ sleep: e.target.value })} /></div>
            <div className="li"><div className="grow ttl">Выходной</div>
              <div className="toggle">{RU_WD_SHORT.map((w, i) => <button key={w} className={db.settings.offDays.includes(i) ? 'on' : ''} onClick={() => setSettings({ offDays: db.settings.offDays.includes(i) ? db.settings.offDays.filter((x) => x !== i) : [...db.settings.offDays, i] })}>{w}</button>)}</div>
            </div>
          </div>
          <div className="h2">Занятия сегодня</div>
          <div className="card list">
            {E.dayPlan(db, t).items.flatMap((i) => i.insts.map((inst, k) => (
              <div className="li" key={i.subject.id + k + (i.review ? 'r' : '')}>
                <span className="dot" style={{ background: i.subject.color }} />
                <div className="grow"><div className="ttl">{i.review ? 'Повтор заученного' : i.subject.ru}</div><div className="sub num">{anchorText(inst)}</div></div>
              </div>
            )))}
          </div>
          <div className="row">
            <button className="btn" onClick={() => setStep(0)}>Назад</button>
            <button className="btn primary" style={{ flex: 1, minHeight: 56 }} onClick={() => { setSettings({ onboarded: true }); window.scrollTo(0, 0); }}><ICheck /> Начать</button>
          </div>
        </>
      )}
    </div>
  );
}
