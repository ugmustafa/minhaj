import React, { useRef, useState } from 'react';
import type { DB, Resource, Subject, Unit } from '../lib/types';
import * as E from '../lib/engine';
import { addDays, fmtDay, fmtDayShort } from '../lib/time';
import { reorder, upsert, remove, today as todayOf, undoGroup, restoreLog, updateLog, uuid } from '../lib/store';
import { useUI, Sheet, primaryLabel } from './common';
import { IGrip, IPlus, IMinus, ICheck, ITrash } from './icons';

export function SubjectsScreen({ db, sid, setSid }: { db: DB; sid: string; setSid: (s: string) => void }) {
  const subjects = db.subjects.filter((s) => !s.deleted && !s.archived).sort((a, b) => a.order - b.order);
  const s = subjects.find((x) => x.id === sid) ?? subjects[0];
  return (
    <div>
      <div className="page-h"><div className="h1">Предметы</div></div>
      <div className="chips" role="tablist">
        {subjects.map((x) => <button key={x.id} role="tab" aria-selected={x.id === s.id} className={x.id === s.id ? 'on' : ''} onClick={() => setSid(x.id)}>{x.ru}</button>)}
      </div>
      <SubjectView key={s.id} db={db} s={s} />
    </div>
  );
}

function SubjectView({ db, s }: { db: DB; s: Subject }) {
  const ui = useUI();
  const day = todayOf(db);
  const q = E.queue(db, s.id);
  const act = s.mode === 'alternate' ? E.streams(db, s.id) : [E.active(db, s.id)].filter(Boolean) as Resource[];
  const finished = q.filter((r) => E.isFinished(db, r));
  const upcoming = q.filter((r) => !E.isFinished(db, r) && !act.some((a) => a.id === r.id));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const logs = E.index(db).live.filter((l) => l.subjectId === s.id);
  const notes = logs.filter((l) => l.note).slice(-20).reverse();

  return (
    <div className="grid2" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="ar" style={{ fontSize: 24, color: s.color }}>{s.ar}</div>
        </div>
        {act.length === 0 && <div className="card" style={{ padding: 18 }}>Очередь пуста — добавьте книгу.</div>}
        {act.map((r) => <ActiveCard key={r.id} db={db} s={s} r={r} onEdit={() => setEditing(r)} />)}
        <div className="card chart" style={{ padding: 14 }}>
          <div className="between"><span className="h2">30 дней</span><span className="muted" style={{ fontSize: 12 }}>линия — норма</span></div>
          <Chart30 db={db} s={s} day={day} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {s.mode !== 'cycle' && (
          <div>
            <div className="between" style={{ margin: '0 2px 8px' }}><span className="h2">Очередь</span></div>
            <QueueList db={db} s={s} onEdit={setEditing} items={[...act.filter(() => s.mode !== 'alternate'), ...upcoming]} />
            <button className="btn soft" style={{ width: '100%', marginTop: 10 }} onClick={() => setAdding(true)}><IPlus /> Добавить книгу в очередь</button>
          </div>
        )}
        {finished.length > 0 && (
          <div>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Пройдено</div>
            <div className="card list">
              {finished.map((r) => (
                <div className="li" key={r.id}>
                  <ICheck size={18} />
                  <div className="grow"><div className="ar" style={{ fontSize: 19 }}>{r.title}</div><div className="sub">{r.author ?? ''}</div></div>
                  <div className="sub num">{fmtDay(E.finishedDay(db, r)!, true)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {notes.length > 0 && (
          <div>
            <div className="h2" style={{ margin: '0 2px 8px' }}>Заметки</div>
            <div className="card list">
              {notes.map((l) => <div className="li" key={l.id}><div className="grow"><div style={{ fontSize: 14 }}>{l.note}</div><div className="sub">{fmtDayShort(l.day)}</div></div></div>)}
            </div>
          </div>
        )}
        <RecentLogs db={db} s={s} />
      </div>
      {adding && <AddBook db={db} s={s} onClose={() => setAdding(false)} />}
      {editing && <AddBook db={db} s={s} edit={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ActiveCard({ db, s, r, onEdit }: { db: DB; s: Subject; r: Resource; onEdit: () => void }) {
  const ui = useUI();
  const day = todayOf(db);
  const pos = E.position(db, r);
  // прогресс по всей книге (с первой страницы/записи), а не только с начала учёта
  const total = r.last != null ? r.last : null;
  const done = pos - 1;
  const fc = s.mode === 'cycle' ? null : E.forecast(db, r, day);
  const cyc = s.mode === 'cycle' ? E.cycleForecast(db, r, day) : null;
  const nrm = E.norm(db, r);
  const step = r.minutesPerDay ? 5 : r.unit === 'page' || r.unit === 'qpage' ? 1 : 0.5;
  const item = E.dayPlan(db, day).items.find((i) => i.subject.id === s.id && !i.review && i.resource?.id === r.id);
  const setNorm = (v: number) => upsert('resources', r.minutesPerDay ? { ...r, minutesPerDay: v } : { ...r, perDay: v, deadline: undefined });

  return (
    <div className="card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: s.color }} />
      <div className="between"><span className="chip">активна</span><span className="row"><span className="muted" style={{ fontSize: 12 }}>{r.note ?? ''}</span>{s.mode !== 'cycle' && <button className="btn ghost sm" onClick={onEdit}>Изменить</button>}</span></div>
      <div className="ar" style={{ fontSize: 30, textAlign: 'right', marginTop: 6 }}>{r.title}{r.author && <span style={{ fontSize: 18, color: 'var(--muted)' }}> · {r.author}</span>}</div>
      {s.mode === 'cycle' && cyc ? (
        <>
          <div style={{ fontSize: 20, fontWeight: 700 }} className="num">Сейчас: стр. {E.murajaCursor(db, r).cursor} из {cyc.learned}</div>
          <div className="muted" style={{ fontSize: 13 }}>до конца круга {cyc.left} стр. · ≈ {cyc.day ? fmtDay(cyc.day) : '—'}. Нововыученные страницы добавляются в круг сами.</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 20, fontWeight: 700 }} className="num">{E.UNIT_SHORT[r.unit]} {E.fmtNum(Math.floor(pos))}{total ? ` · ${Math.round((done / total) * 100)}%` : ''}</div>
          {total != null && <div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, (done / total) * 100)}%`, background: s.color }} /></div>}
          <div className="stats" style={{ marginTop: 12 }}>
            <div className="stat"><b className="num">{E.fmtNum(done)}</b><span>пройдено</span></div>
            <div className="stat"><b className="num">{total != null ? E.fmtNum(Math.max(0, total - done)) : '—'}</b><span>осталось</span></div>
            <div className="stat"><b className="num">{fc?.pace != null ? E.fmtNum(Math.round(fc.pace * 10) / 10) : '—'}</b><span>темп/день</span></div>
          </div>
          <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
            <div className="between"><span className="muted">По норме</span><b className="num">{fc?.ideal ? fmtDay(fc.ideal, true) : total == null ? 'объём не указан' : '—'}</b></div>
            <div className="between"><span className="muted">По реальному темпу (14 дн.)</span><b className="num">{fc?.real ? fmtDay(fc.real, true) : 'пока мало данных'}</b></div>
          </div>
        </>
      )}
      <div className="between" style={{ marginTop: 14 }}>
        <span style={{ fontSize: 14 }}>Норма: <b className="num">{E.fmtNum(nrm)} {r.minutesPerDay ? 'мин' : E.unitWord(r.unit, nrm)}</b>{r.deadline ? <span className="muted"> · до {fmtDayShort(r.deadline)}</span> : null}</span>
        <div className="row">
          <button className="btn sm" aria-label="Уменьшить норму" onClick={() => setNorm(Math.max(step, nrm - step))}><IMinus /></button>
          <button className="btn sm" aria-label="Увеличить норму" onClick={() => setNorm(nrm + step)}><IPlus /></button>
        </div>
      </div>
      {r.last != null && s.mode === 'queue' && (
        <div className="between" style={{ marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 14 }}>Закончить до…</span>
          <input type="date" className="field" style={{ width: 170, minHeight: 44 }} value={r.deadline ?? ''} min={addDays(day, 1)}
            onChange={(e) => upsert('resources', { ...r, deadline: e.target.value || undefined })} />
        </div>
      )}
      {item && (
        <button className="btn primary" style={{ width: '100%', marginTop: 14 }} onClick={() => ui.quick(item)}><ICheck /> {primaryLabel(db, item)}</button>
      )}
    </div>
  );
}

function QueueList({ db, s, items, onEdit }: { db: DB; s: Subject; items: Resource[]; onEdit: (r: Resource) => void }) {
  const [drag, setDrag] = useState<{ id: string; y0: number; dy: number } | null>(null);
  const rowH = 64;
  const ref = useRef<HTMLDivElement>(null);
  if (!items.length) return <div className="card" style={{ padding: 14 }} >В очереди пусто</div>;
  const order = items.map((r) => r.id);
  const onUp = () => {
    if (!drag) return;
    const from = order.indexOf(drag.id);
    const to = Math.max(0, Math.min(order.length - 1, from + Math.round(drag.dy / rowH)));
    if (to !== from) {
      const next = [...order]; next.splice(from, 1); next.splice(to, 0, drag.id);
      const finished = E.queue(db, s.id).filter((r) => E.isFinished(db, r)).map((r) => r.id);
      reorder(s.id, [...finished, ...next]);
    }
    setDrag(null);
  };
  return (
    <div className="card list" ref={ref} onPointerMove={(e) => drag && setDrag({ ...drag, dy: e.clientY - drag.y0 })} onPointerUp={onUp} onPointerCancel={onUp}>
      {items.map((r, i) => {
        const isAct = !E.isFinished(db, r) && E.active(db, s.id)?.id === r.id;
        const fc = E.forecast(db, r, todayOf(db));
        return (
          <div key={r.id} className={`li ${drag?.id === r.id ? 'dragging' : ''}`} style={{ minHeight: rowH, transform: drag?.id === r.id ? `translateY(${drag.dy}px)` : undefined }}>
            <div className="handle" aria-label="Перетащить" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag({ id: r.id, y0: e.clientY, dy: 0 }); }}><IGrip size={20} /></div>
            <div className="grow" role="button" onClick={() => !drag && onEdit(r)} style={{ cursor: 'pointer' }}>
              <div className="ar" style={{ fontSize: 19, textAlign: 'right' }}>{r.title}{r.author ? ` · ${r.author}` : ''}</div>
              <div className="sub num">{i + 1}. {isAct ? 'сейчас' : 'в очереди'} · {r.last != null ? `${r.last - r.first + 1} ${E.unitWord(r.unit, r.last - r.first + 1)}` : 'объём не указан'}{fc.ideal ? ` · ≈ ${fmtDayShort(fc.ideal)}` : ''}</div>
            </div>
            {!isAct && <button className="btn ghost sm" aria-label="Убрать из очереди" onClick={() => remove('resources', r.id)}><ITrash size={18} /></button>}
          </div>
        );
      })}
    </div>
  );
}

const UNITS: { u: Unit; ru: string }[] = [
  { u: 'page', ru: 'страницы' }, { u: 'record', ru: 'аудиозаписи' }, { u: 'video', ru: 'видео' },
  { u: 'lesson', ru: 'уроки' }, { u: 'hadith', ru: 'хадисы' }, { u: 'chunk', ru: 'отрывки' },
];
function AddBook({ db, s, onClose, edit }: { db: DB; s: Subject; onClose: () => void; edit?: Resource }) {
  const done = edit ? E.unitsDone(db, edit) : 0;
  const [title, setTitle] = useState(edit?.title ?? '');
  const [author, setAuthor] = useState(edit?.author ?? '');
  const [unit, setUnit] = useState<Unit>(edit?.unit ?? 'page');
  const [total, setTotal] = useState(edit?.last != null ? String(edit.last) : '');
  const [cur, setCur] = useState(String(edit ? Math.floor(E.position(db, edit)) : 1));
  const [per, setPer] = useState(edit?.perDay != null ? String(edit.perDay) : '');
  const save = () => {
    const q = E.queue(db, s.id);
    const c = Math.max(1, Number(cur) || 1);
    const base: Resource = edit ?? {
      id: uuid(), subjectId: s.id, title: '', unit, first: 1, last: null,
      queuePos: (q[q.length - 1]?.queuePos ?? 0) + 1, updatedAt: 0,
    };
    upsert('resources', {
      ...base, title: title.trim(), author: author.trim() || undefined, unit: edit && done > 0 ? edit.unit : unit,
      first: c - done, last: total ? Number(total) : null,
      perDay: per ? Number(per) : (edit ? edit.perDay : undefined),
    });
    onClose();
  };
  return (
    <Sheet onClose={onClose} label={edit ? 'Книга' : 'Новая книга'}>
      <div style={{ fontWeight: 700, fontSize: 18 }}>{edit ? 'Изменить книгу' : 'Добавить в очередь'} · {s.ru}</div>
      <div className="label">Название (можно по-арабски)</div>
      <input className="field ar" dir="rtl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم الكتاب" />
      <div className="label">Автор</div>
      <input className="field ar" dir="rtl" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="المؤلف" />
      {!(edit && done > 0) && <>
        <div className="label">Что считаем</div>
        <div className="toggle">{UNITS.map((x) => <button key={x.u} className={unit === x.u ? 'on' : ''} onClick={() => setUnit(x.u)}>{x.ru}</button>)}</div>
      </>}
      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}><div className="label">Всего</div><input className="field num" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))} placeholder="напр. 196" /></div>
        <div style={{ flex: 1 }}><div className="label">{edit ? 'Сейчас на' : 'Начать с'}</div><input className="field num" inputMode="numeric" value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ''))} /></div>
        <div style={{ flex: 1 }}><div className="label">Норма в день</div><input className="field num" inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value.replace(/[^\d.]/g, ''))} placeholder="как у пред." /></div>
      </div>
      <button className="btn primary" style={{ width: '100%', marginTop: 16 }} disabled={!title.trim()} onClick={save}><ICheck /> {edit ? 'Сохранить' : 'Добавить'}</button>
    </Sheet>
  );
}

function RecentLogs({ db, s }: { db: DB; s: Subject }) {
  const all = db.logs.filter((l) => l.subjectId === s.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
  if (!all.length) return null;
  return (
    <div>
      <div className="h2" style={{ margin: '0 2px 8px' }}>Последние отметки</div>
      <div className="card list">
        {all.map((l) => {
          const r = E.resourceById(db, l.resourceId);
          return (
            <div className="li" key={l.id} style={{ opacity: l.deleted ? 0.45 : 1 }}>
              <div className="grow">
                <div className="ttl num">{l.kind === 'review' ? 'повтор' : `+${E.fmtNum(l.units)} ${r ? E.unitWord(r.unit, l.units) : ''}`}{l.minutes ? ` · ${l.minutes} мин` : ''}</div>
                <div className="sub num">{fmtDayShort(l.day)}{l.from != null && l.kind !== 'review' ? ` · с ${l.from}` : ''}{l.deleted ? ' · отменена' : ''}</div>
              </div>
              {!l.deleted && l.kind !== 'review' && (
                <>
                  <button className="btn ghost sm" aria-label="Меньше" onClick={() => updateLog(l.id, { units: Math.max(0.5, l.units - (r?.unit === 'page' || r?.unit === 'qpage' ? 1 : 0.5)) })}><IMinus size={18} /></button>
                  <button className="btn ghost sm" aria-label="Больше" onClick={() => updateLog(l.id, { units: l.units + (r?.unit === 'page' || r?.unit === 'qpage' ? 1 : 0.5) })}><IPlus size={18} /></button>
                </>
              )}
              {l.deleted
                ? <button className="btn ghost sm" onClick={() => restoreLog(l.id)}>Вернуть</button>
                : <button className="btn ghost sm" aria-label="Удалить" onClick={() => undoGroup(l.group ?? l.id)}><ITrash size={18} /></button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chart30({ db, s, day }: { db: DB; s: Subject; day: string }) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(day, i - 29));
  const r = s.mode === 'alternate' ? null : (E.active(db, s.id) ?? E.queue(db, s.id)[0]);
  const vals = days.map((d) => E.doneOn(db, s.id, d, r && r.minutesPerDay ? r : null));
  const normV = r ? E.norm(db, r) : 1;
  const max = Math.max(normV * 1.6, ...vals, 1);
  const W = 300, H = 110, bw = W / 30;
  const y = (v: number) => H - (v / max) * (H - 14);
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="График за 30 дней">
      {days.map((d, i) => {
        const v = vals[i];
        const planned = E.isPlannedDay(db, s, d);
        return <rect key={d} x={i * bw + 1.5} y={y(v)} width={bw - 3} height={Math.max(0, H - y(v))} rx={2.5}
          fill={v >= normV - 1e-9 ? s.color : planned ? 'var(--part)' : 'var(--ahead)'} opacity={v ? 1 : 0.25} />;
      })}
      {days.map((d, i) => vals[i] === 0 && E.isPlannedDay(db, s, d) ? <circle key={'z' + d} cx={i * bw + bw / 2} cy={H - 2} r={1.6} fill="var(--ahead)" /> : null)}
      <line x1="0" x2={W} y1={y(normV)} y2={y(normV)} stroke="var(--gold)" strokeDasharray="4 3" strokeWidth="1.4" />
      <text x="0" y={H + 13} fontSize="9" fill="var(--muted)">{fmtDayShort(days[0])}</text>
      <text x={W} y={H + 13} fontSize="9" fill="var(--muted)" textAnchor="end">сегодня</text>
    </svg>
  );
}
