import React, { useRef, useState } from 'react';
import type { DB, Slot, Anchor, DayModeKind } from '../lib/types';
import * as E from '../lib/engine';
import { PRAYERS, PRAYER_RU, fmtMin } from '../lib/prayer';
import { RU_WD_SHORT, fmtDay } from '../lib/time';
import { setSettings, setDayMode, upsert, exportJSON, importJSON, resetAll, today as todayOf, uuid } from '../lib/store';
import { Sheet, useUI } from './common';
import { anchorText } from './Now';
import { ICheck, IMinus, IPlus, ITrash, IChevron } from './icons';

const CITIES = [
  { city: 'Медина', lat: 24.4672, lng: 39.6111 },
  { city: 'Мекка', lat: 21.4225, lng: 39.8262 },
  { city: 'Эр-Рияд', lat: 24.7136, lng: 46.6753 },
  { city: 'Джидда', lat: 21.4858, lng: 39.1925 },
];

export function SettingsScreen({ db, goSubjects }: { db: DB; goSubjects: () => void }) {
  const ui = useUI();
  const st = db.settings;
  const t = todayOf(db);
  const [edit, setEdit] = useState<Slot | null>(null);
  const [exam, setExam] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mode = E.dayKind(db, t);
  const plan = E.dayPlan(db, t);
  const slotRows = db.slots.filter((s) => !s.deleted).map((s) => ({ s, subj: E.subjectById(db, s.subjectId), start: E.slotStart(db, s, t) })).sort((a, b) => a.start - b.start);

  const doExport = async () => {
    const text = exportJSON();
    const name = `minhaj-${t}.json`;
    const file = new File([text], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (nav.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Минхадж — копия' }); return; } catch { /* отменено */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    ui.toast('Копия сохранена в «Файлы»');
  };

  return (
    <div>
      <div className="page-h"><div className="h1">Настройки</div></div>
      <div className="grid2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Сегодня</div>
            <div className="seg">
              {([['normal', 'Обычный'], ['light', 'Лёгкий'], ['off', 'Выходной'], ['exam', 'Экзамен']] as [DayModeKind, string][]).map(([k, l]) =>
                <button key={k} className={mode === k ? 'on' : ''} onClick={() => setDayMode(t, k)}>{l}</button>)}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Лёгкий — половина нормы, серия не прерывается. Экзамен — новые книги на паузе, остаются хифз и мураджаа.</div>
          </section>

          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Расписание · {fmtDay(t)}</div>
            <div className="card list">
              {slotRows.map(({ s, subj, start }) => {
                const inst = { slot: s, start, end: start + s.duration, conflict: E.conflictOf(db, t, start, start + s.duration) };
                return (
                  <button className="li" key={s.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => setEdit(s)}>
                    <span className="dot" style={{ background: subj.color }} />
                    <div className="grow">
                      <div className="ttl">{subj.ru}{s.role === 'review' ? ' · повтор' : s.label ? ` · ${s.label}` : ''}</div>
                      <div className="sub num">{anchorText(inst)} · {s.weekdays.map((w) => RU_WD_SHORT[w]).join(' ')}{inst.conflict ? ` · ⚠︎ ${inst.conflict}` : ''}</div>
                    </div>
                    <IChevron size={18} />
                  </button>
                );
              })}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Занятия «после намаза» сами сдвигаются по сезону. Если время задевает намаз — появится ⚠︎.</div>
          </section>

          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Предметы и книги</div>
            <button className="btn" style={{ width: '100%', justifyContent: 'space-between' }} onClick={goSubjects}>Открыть предметы и очереди <IChevron size={18} /></button>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Выходные</div>
            <div className="toggle">
              {RU_WD_SHORT.map((w, i) => <button key={w} className={st.offDays.includes(i) ? 'on' : ''} onClick={() => setSettings({ offDays: st.offDays.includes(i) ? st.offDays.filter((x) => x !== i) : [...st.offDays, i] })}>{w}</button>)}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>В эти дни занятий нет. Суббота — по расписанию: мураджаа и чтение.</div>
          </section>

          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Экзамены и каникулы</div>
            <div className="card list">
              {st.exams.map((p) => (
                <div className="li" key={p.id}>
                  <div className="grow"><div className="ttl">{p.label}</div><div className="sub num">{fmtDay(p.from, true)} — {fmtDay(p.to, true)}</div></div>
                  <button className="btn ghost sm" aria-label="Удалить" onClick={() => setSettings({ exams: st.exams.filter((x) => x.id !== p.id) })}><ITrash size={18} /></button>
                </div>
              ))}
              <button className="li" style={{ width: '100%', color: 'var(--accent)', fontWeight: 600 }} onClick={() => setExam(true)}><IPlus size={18} /> Добавить период</button>
            </div>
          </section>

          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Отсчёт сверху</div>
            <div className="seg">
              {([['custom', 'Своя цель'], ['greg', 'Год'], ['hijri', 'Хиджра'], ['semester', 'Семестр']] as const).map(([k, l]) =>
                <button key={k} className={st.countdown.kind === k ? 'on' : ''} onClick={() => setSettings({ countdown: { ...st.countdown, kind: k } })}>{l}</button>)}
            </div>
            {(st.countdown.kind === 'custom' || st.countdown.kind === 'semester') && (
              <div className="row" style={{ marginTop: 8 }}>
                <input type="date" className="field" value={st.countdown.date ?? ''} onChange={(e) => setSettings({ countdown: { ...st.countdown, date: e.target.value } })} />
                <input className="field" value={st.countdown.label ?? ''} placeholder="подпись" onChange={(e) => setSettings({ countdown: { ...st.countdown, label: e.target.value } })} />
              </div>
            )}
          </section>

          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Распорядок и город</div>
            <div className="card list">
              <div className="li"><div className="grow ttl">Подъём</div><input type="time" className="field" style={{ width: 120 }} value={st.wake} onChange={(e) => setSettings({ wake: e.target.value })} /></div>
              <div className="li"><div className="grow ttl">Сон</div><input type="time" className="field" style={{ width: 120 }} value={st.sleep} onChange={(e) => setSettings({ sleep: e.target.value })} /></div>
              <div className="li"><div className="grow"><div className="ttl">Город для намаза</div><div className="sub">Умм аль-Кура · Иша = Магриб + 90 мин</div></div>
                <select className="field" style={{ width: 130 }} value={st.city} onChange={(e) => { const c = CITIES.find((x) => x.city === e.target.value)!; setSettings({ city: c.city, lat: c.lat, lng: c.lng }); }}>
                  {CITIES.map((c) => <option key={c.city}>{c.city}</option>)}
                </select>
              </div>
            </div>
            <div className="muted num" style={{ fontSize: 12, marginTop: 6 }}>Сегодня: {PRAYERS.map((p) => `${PRAYER_RU[p]} ${fmtMin(plan.prayers[p])}`).join(' · ')}</div>
          </section>

          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Тема</div>
            <div className="seg">
              {([['auto', 'Авто (тёмная после Иша)'], ['light', 'Светлая'], ['dark', 'Тёмная']] as const).map(([k, l]) =>
                <button key={k} className={st.theme === k ? 'on' : ''} onClick={() => setSettings({ theme: k })}>{l}</button>)}
            </div>
          </section>

          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Резервная копия</div>
            <div className="row">
              <button className="btn" style={{ flex: 1 }} onClick={doExport}>Сохранить копию</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>Восстановить</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try { importJSON(await f.text()); ui.toast('Данные восстановлены'); } catch (err) { ui.toast((err as Error).message || 'Не удалось прочитать файл'); }
                e.target.value = '';
              }} />
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Один файл со всеми отметками и настройками. Сейчас данные хранятся на этом устройстве; облачная копия и синхронизация iPad ↔ iPhone подключатся на следующем этапе.</div>
          </section>

          <section>
            <div className="h2" style={{ margin: '0 2px 8px' }}>TickTick</div>
            <div className="card" style={{ padding: 14, fontSize: 14 }}>Напоминания через TickTick подключатся после выкладки приложения — сначала покажу список задач на утверждение.</div>
          </section>

          <section>
            <button className="btn ghost" style={{ color: 'var(--muted)', width: '100%' }} onClick={() => { if (confirm('Сбросить все данные на этом устройстве? Сначала сохраните копию.')) resetAll(); }}>Сбросить данные</button>
          </section>
        </div>
      </div>
      {edit && <SlotEdit db={db} slot={edit} onClose={() => setEdit(null)} />}
      {exam && <ExamAdd onClose={() => setExam(false)} add={(p) => setSettings({ exams: [...st.exams, p] })} />}
    </div>
  );
}

function SlotEdit({ db, slot, onClose }: { db: DB; slot: Slot; onClose: () => void }) {
  const [a, setA] = useState<Anchor>(slot.anchor);
  const [dur, setDur] = useState(slot.duration);
  const [wd, setWd] = useState<number[]>(slot.weekdays);
  const t = todayOf(db);
  const subj = E.subjectById(db, slot.subjectId);
  const tmp: Slot = { ...slot, anchor: a, duration: dur, weekdays: wd };
  const start = E.slotStart(db, tmp, t);
  const conflict = E.conflictOf(db, t, start, start + dur);
  return (
    <Sheet onClose={onClose} label="Слот">
      <div style={{ fontWeight: 700, fontSize: 18 }}>{subj.ru}{slot.label ? ` · ${slot.label}` : ''}</div>
      <div className="seg" style={{ marginTop: 12 }}>
        <button className={a.kind === 'prayer' ? 'on' : ''} onClick={() => setA({ kind: 'prayer', prayer: 'asr', offset: 15 })}>После намаза</button>
        <button className={a.kind === 'fixed' ? 'on' : ''} onClick={() => setA({ kind: 'fixed', time: fmtMin(start) })}>Точное время</button>
      </div>
      {a.kind === 'prayer' ? (
        <>
          <div className="toggle" style={{ marginTop: 10 }}>
            {PRAYERS.map((p) => <button key={p} className={a.prayer === p ? 'on' : ''} onClick={() => setA({ ...a, prayer: p })}>{PRAYER_RU[p]}</button>)}
          </div>
          <div className="stepper">
            <button className="btn" onClick={() => setA({ ...a, offset: a.offset - 5 })}><IMinus /></button>
            <div className="v num" style={{ fontSize: 30 }}>{a.offset >= 0 ? '+' : ''}{a.offset} мин</div>
            <button className="btn" onClick={() => setA({ ...a, offset: a.offset + 5 })}><IPlus /></button>
          </div>
        </>
      ) : (
        <input type="time" className="field" style={{ marginTop: 10 }} value={a.time} onChange={(e) => setA({ kind: 'fixed', time: e.target.value })} />
      )}
      <div className="label">Длительность</div>
      <div className="stepper" style={{ marginTop: 0 }}>
        <button className="btn" onClick={() => setDur(Math.max(5, dur - 5))}><IMinus /></button>
        <div className="v num" style={{ fontSize: 30 }}>{dur} мин</div>
        <button className="btn" onClick={() => setDur(dur + 5)}><IPlus /></button>
      </div>
      <div className="label">Дни</div>
      <div className="toggle">{RU_WD_SHORT.map((w, i) => <button key={w} className={wd.includes(i) ? 'on' : ''} onClick={() => setWd(wd.includes(i) ? wd.filter((x) => x !== i) : [...wd, i].sort())}>{w}</button>)}</div>
      <div className={conflict ? 'chip warn' : 'chip'} style={{ marginTop: 12, whiteSpace: 'normal' }}>Сегодня: {fmtMin(start)}–{fmtMin(start + dur)}{conflict ? ` · ⚠︎ ${conflict}` : ' · не задевает намазы'}</div>
      <button className="btn primary" style={{ width: '100%', marginTop: 14 }} onClick={() => { upsert('slots', tmp); onClose(); }}><ICheck /> Сохранить</button>
    </Sheet>
  );
}

function ExamAdd({ onClose, add }: { onClose: () => void; add: (p: { id: string; from: string; to: string; label: string; kind: 'exam' | 'holiday' }) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('Экзамены');
  return (
    <Sheet onClose={onClose} label="Период">
      <div style={{ fontWeight: 700, fontSize: 18 }}>Экзамены или каникулы</div>
      <div className="seg" style={{ marginTop: 12 }}>
        {['Экзамены', 'Каникулы'].map((l) => <button key={l} className={label === l ? 'on' : ''} onClick={() => setLabel(l)}>{l}</button>)}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <div style={{ flex: 1 }}><div className="label">С</div><input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div style={{ flex: 1 }}><div className="label">По</div><input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{label === 'Экзамены' ? 'В эти дни новые книги на паузе, остаются хифз и мураджаа.' : 'В каникулы нет университета — занятия идут как обычно.'}</div>
      <button className="btn primary" style={{ width: '100%', marginTop: 14 }} disabled={!from || !to || to < from} onClick={() => { add({ id: uuid(), from, to, label, kind: label === 'Каникулы' ? 'holiday' : 'exam' }); onClose(); }}><ICheck /> Добавить</button>
    </Sheet>
  );
}
