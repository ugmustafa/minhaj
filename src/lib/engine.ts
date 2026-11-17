// «Мозг» приложения. Все цифры (прогресс, план дня, долг, серия, прогнозы) вычисляются
// из журнала отметок и настроек — ничего из этого не хранится отдельно.
import type { DB, LogEntry, Resource, Slot, Subject, Unit, DayModeKind } from './types';
import { prayerTimes, PRAYERS, PRAYER_RU, type PrayerTimes, type PrayerKey, fmtMin } from './prayer';
import { addDays, diffDays, hijri, parseHM, parseKey, weekday, type DayKey } from './time';
import { surahName } from './quran';

const EPS = 1e-9;

/* ---------------- индексы ---------------- */
interface Index {
  byRes: Map<string, LogEntry[]>;
  bySubjDay: Map<string, LogEntry[]>;
  live: LogEntry[];
}
const cache = new WeakMap<LogEntry[], Index>();
export function index(db: DB): Index {
  let ix = cache.get(db.logs);
  if (ix) return ix;
  const live = db.logs.filter((l) => !l.deleted).sort((a, b) => a.createdAt - b.createdAt);
  const byRes = new Map<string, LogEntry[]>();
  const bySubjDay = new Map<string, LogEntry[]>();
  for (const l of live) {
    (byRes.get(l.resourceId) ?? byRes.set(l.resourceId, []).get(l.resourceId)!).push(l);
    const k = `${l.subjectId}|${l.day}`;
    (bySubjDay.get(k) ?? bySubjDay.set(k, []).get(k)!).push(l);
  }
  ix = { byRes, bySubjDay, live };
  cache.set(db.logs, ix);
  return ix;
}

/* ---------------- книги и позиции ---------------- */
export const subjectById = (db: DB, id: string) => db.subjects.find((s) => s.id === id)!;
export const resourceById = (db: DB, id: string) => db.resources.find((r) => r.id === id);

export function queue(db: DB, sid: string): Resource[] {
  return db.resources.filter((r) => r.subjectId === sid && !r.deleted).sort((a, b) => a.queuePos - b.queuePos);
}

export function unitsDone(db: DB, r: Resource, beforeDay?: DayKey): number {
  const logs = index(db).byRes.get(r.id) ?? [];
  let s = 0;
  for (const l of logs) if (l.kind !== 'review' && (!beforeDay || l.day < beforeDay)) s += l.units;
  return s;
}

/** Следующая (текущая) единица: first + пройдено. */
export function position(db: DB, r: Resource, beforeDay?: DayKey): number {
  return r.first + unitsDone(db, r, beforeDay);
}

export function remaining(db: DB, r: Resource): number | null {
  if (r.last == null) return null;
  return Math.max(0, r.last - position(db, r) + 1);
}

export function isFinished(db: DB, r: Resource): boolean {
  return r.last != null && position(db, r) > r.last + EPS;
}

/** День, когда книга пройдена (по журналу). */
export function finishedDay(db: DB, r: Resource): DayKey | null {
  if (r.last == null) return null;
  let pos = r.first;
  for (const l of index(db).byRes.get(r.id) ?? []) {
    if (l.kind === 'review') continue;
    pos += l.units;
    if (pos > r.last + EPS) return l.day;
  }
  return null;
}

export function startedDay(db: DB, r: Resource): DayKey | null {
  const l = (index(db).byRes.get(r.id) ?? []).find((x) => x.kind !== 'review');
  return l ? l.day : null;
}

/** Активная книга предмета (первая непройденная). */
export function active(db: DB, sid: string): Resource | null {
  return queue(db, sid).find((r) => !isFinished(db, r)) ?? null;
}

/** Для «попеременного» предмета — непройденные потоки. */
export function streams(db: DB, sid: string): Resource[] {
  return queue(db, sid).filter((r) => !isFinished(db, r));
}

/** Какой поток учить следующим: тот, что не отмечался последним. */
export function nextStream(db: DB, sid: string, day?: DayKey): Resource | null {
  const st = streams(db, sid);
  if (st.length <= 1) return st[0] ?? null;
  let last: LogEntry | null = null;
  for (const r of st) for (const l of index(db).byRes.get(r.id) ?? []) {
    if (l.kind === 'review') continue;
    if (day && l.day >= day) continue;
    if (!last || l.createdAt > last.createdAt) last = l;
  }
  if (!last) return st[0];
  const i = st.findIndex((r) => r.id === last!.resourceId);
  return st[(i + 1) % st.length];
}

/** День, с которого книга активна (окончание предыдущей или начало плана). */
export function activationDay(db: DB, r: Resource): DayKey {
  const q = queue(db, r.subjectId);
  const i = q.findIndex((x) => x.id === r.id);
  let d = db.settings.planStart;
  for (let j = i - 1; j >= 0; j--) {
    const f = finishedDay(db, q[j]);
    if (f) { if (f > d) d = f; break; }
  }
  return d;
}

/* ---------------- единицы и подписи ---------------- */
export const UNIT_STEP: Record<Unit, number> = { qpage: 0.5, page: 1, record: 0.5, video: 0.5, chunk: 1, hadith: 1, lesson: 1 };

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (!Number.isInteger(n)) return few;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export function unitWord(u: Unit, n: number): string {
  switch (u) {
    case 'qpage': case 'page': return plural(n, 'страница', 'страницы', 'страниц');
    case 'record': return plural(n, 'запись', 'записи', 'записей');
    case 'video': return plural(n, 'видео', 'видео', 'видео');
    case 'chunk': return plural(n, 'отрывок', 'отрывка', 'отрывков');
    case 'hadith': return plural(n, 'хадис', 'хадиса', 'хадисов');
    case 'lesson': return plural(n, 'урок', 'урока', 'уроков');
  }
}
export const UNIT_SHORT: Record<Unit, string> = { qpage: 'стр.', page: 'стр.', record: 'запись', video: 'видео', chunk: 'отрывок', hadith: 'хадис', lesson: 'урок' };
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/** Страница книги, на которой начинается аудиозапись x. */
export function bookPage(r: Resource, x: number): number | null {
  if (!r.bookPages || r.last == null) return null;
  const { atFirst, end } = r.bookPages;
  const per = (end - atFirst + 1) / (r.last - r.first + 1);
  return Math.round(atFirst + (x - r.first) * per);
}

export function volumeOf(r: Resource, page: number): number | null {
  const v = r.volumes?.find((v) => page >= v.from && page <= v.to);
  return v ? v.n : null;
}

/* ---------------- режим дня ---------------- */
export function dayKind(db: DB, day: DayKey): DayModeKind {
  const m = db.dayModes.find((x) => x.day === day && !x.deleted);
  if (m && m.mode !== 'normal') return m.mode;
  if (db.settings.offDays.includes(weekday(day))) return 'off';
  if (db.settings.exams.some((p) => p.kind !== 'holiday' && day >= p.from && day <= p.to)) return 'exam';
  return 'normal';
}

const mainSlots = (db: DB, sid: string) => db.slots.filter((s) => s.subjectId === sid && s.role === 'main' && !s.deleted);

export function isPlannedDay(db: DB, s: Subject, day: DayKey): boolean {
  if (s.archived) return false;
  const kind = dayKind(db, day);
  if (kind === 'off') return false;
  if (kind === 'exam' && s.pauseInExam) return false;
  const wd = weekday(day);
  return mainSlots(db, s.id).some((x) => x.weekdays.includes(wd));
}

/* ---------------- нормы ---------------- */
function quant(x: number, step: number, mode: 'ceil' | 'round' | 'floor' = 'round'): number {
  const f = mode === 'ceil' ? Math.ceil : mode === 'floor' ? Math.floor : Math.round;
  return f(x / step - EPS * (mode === 'ceil' ? 1 : 0)) * step;
}

export function measureOf(r: Resource): 'units' | 'minutes' {
  return r.minutesPerDay ? 'minutes' : 'units';
}

/** Норма книги в день (до режима дня). */
export function norm(db: DB, r: Resource, day?: DayKey): number {
  if (r.minutesPerDay) return r.minutesPerDay;
  if (r.deadline && r.last != null) {
    const rem = remaining(db, r) ?? 0;
    const s = subjectById(db, r.subjectId);
    let days = 0;
    for (let d = day ?? db.settings.planStart; d <= r.deadline; d = addDays(d, 1)) if (isPlannedDay(db, s, d)) days++;
    if (days > 0) return Math.max(UNIT_STEP[r.unit], quant(rem / days, UNIT_STEP[r.unit], 'ceil'));
  }
  if (r.perDay) return r.perDay;
  const q = queue(db, r.subjectId);
  for (let i = q.findIndex((x) => x.id === r.id) - 1; i >= 0; i--) if (q[i].unit === r.unit && q[i].perDay) return q[i].perDay!;
  return 1;
}

/** Базовый план предмета на день (без добора долга). */
export function baseFor(db: DB, s: Subject, day: DayKey, r: Resource | null): number {
  if (!r || !isPlannedDay(db, s, day)) return 0;
  if (s.mode === 'weekly') return 1;
  let n = norm(db, r, day);
  if (dayKind(db, day) === 'light') {
    const step = r.minutesPerDay ? 5 : UNIT_STEP[r.unit];
    n = Math.max(step, quant(n / 2, step, 'ceil'));
  }
  return n;
}

/** Сделано по предмету за день (единицы или минуты — как меряется норма). */
export function doneOn(db: DB, sid: string, day: DayKey, r?: Resource | null): number {
  const logs = index(db).bySubjDay.get(`${sid}|${day}`) ?? [];
  // еженедельный урок: считается занятие (сколько бы страниц ни отметили)
  if (db.subjects.find((x) => x.id === sid)?.mode === 'weekly') return logs.some((l) => l.kind !== 'review') ? 1 : 0;
  const byMin = r ? measureOf(r) === 'minutes' : false;
  let s = 0;
  for (const l of logs) {
    if (l.kind === 'review') continue;
    if (r && l.resourceId !== r.id && byMin) continue;
    s += byMin ? (l.minutes ?? 0) : l.units;
  }
  return s;
}

/** Накопленный недобор к началу дня day (с момента активации текущей книги). */
const debtMemo = new WeakMap<DB, Map<string, { start: DayKey; vals: Map<DayKey, number> }>>();
export function debtBefore(db: DB, s: Subject, day: DayKey): number {
  if (!s.carryDebt) return 0;
  const r = s.mode === 'alternate' ? streams(db, s.id)[0] ?? null : active(db, s.id);
  if (!r) return 0;
  let m = debtMemo.get(db);
  if (!m) { m = new Map(); debtMemo.set(db, m); }
  let e = m.get(s.id);
  if (!e) {
    let start = activationDay(db, r);
    if (start < db.settings.planStart) start = db.settings.planStart;
    e = { start, vals: new Map([[start, 0]]) };
    m.set(s.id, e);
  }
  if (day <= e.start) return 0;
  const hit = e.vals.get(day);
  if (hit !== undefined) return hit;
  // идём от последнего известного дня
  let d = e.start;
  let running = 0;
  for (let back = addDays(day, -1); back > e.start; back = addDays(back, -1)) {
    const v = e.vals.get(back);
    if (v !== undefined) { d = back; running = v; break; }
  }
  for (; d < day; d = addDays(d, 1)) {
    const base = baseFor(db, s, d, r);
    const done = doneOn(db, s.id, d, s.mode === 'alternate' ? null : r);
    running = Math.max(0, running + base - done);
    e.vals.set(addDays(d, 1), running);
  }
  return running;
}

/** Добор долга на день: не больше +50% нормы, раскладывается на несколько дней. */
export function addonFor(db: DB, s: Subject, day: DayKey, r: Resource | null): number {
  if (!r || !s.carryDebt) return 0;
  const kind = dayKind(db, day);
  if (kind === 'light' || !isPlannedDay(db, s, day)) return 0;
  const debt = debtBefore(db, s, day);
  if (debt <= EPS) return 0;
  const n = norm(db, r, day);
  const step = r.minutesPerDay ? 5 : UNIT_STEP[r.unit];
  const cap = quant(n * 0.5, step, 'floor');
  if (cap < step - EPS) return 0;
  // не больше +50% нормы в день; крупный долг сам растягивается на несколько дней
  return Math.min(cap, quant(debt, step, 'ceil'));
}

/* ---------------- намазы и слоты ---------------- */
const ptCache = new Map<string, PrayerTimes>();
export function prayersFor(db: DB, day: DayKey): PrayerTimes {
  const key = `${day}|${db.settings.lat}|${db.settings.lng}`;
  let p = ptCache.get(key);
  if (!p) {
    const { y, m, d } = parseKey(day);
    p = prayerTimes(y, m, d, { lat: db.settings.lat, lng: db.settings.lng, tzMin: db.settings.tzMin }, hijri(day).month === 9);
    ptCache.set(key, p);
  }
  return p;
}

export function slotStart(db: DB, slot: Slot, day: DayKey): number {
  if (slot.anchor.kind === 'fixed') return parseHM(slot.anchor.time);
  return prayersFor(db, day)[slot.anchor.prayer] + slot.anchor.offset;
}

export interface SlotInst {
  slot: Slot; start: number; end: number;
  conflict?: string; makeup?: boolean; moved?: boolean;
}

/** Окно намаза (занято): с 5 мин до и 10 мин после азана. */
const PRAYER_BEFORE = 5, PRAYER_AFTER = 10;

export function conflictOf(db: DB, day: DayKey, start: number, end: number): string | undefined {
  const pt = prayersFor(db, day);
  for (const p of PRAYERS) {
    const t = pt[p];
    if (start < t + PRAYER_AFTER && end > t - PRAYER_BEFORE) return `задевает ${PRAYER_RU[p]} (${fmtMin(t)})`;
  }
  if (end > parseHM(db.settings.sleep)) return `заходит за время сна (${db.settings.sleep})`;
  return undefined;
}

/* ---------------- план дня ---------------- */
export type Status = 'done' | 'part' | 'ahead';
export interface PlanItem {
  subject: Subject;
  resource: Resource | null;
  review: boolean;
  planned: number;
  addon: number;
  done: number;
  measure: 'units' | 'minutes';
  status: Status;
  insts: SlotInst[];
  /** Начало первого слота (мин). */
  start: number;
  label: string;
  /** Позиция в начале дня. */
  from: number;
}

export function statusOf(planned: number, done: number): Status {
  if (planned <= EPS) return done > 0 ? 'done' : 'ahead';
  if (done >= planned - EPS) return 'done';
  return done > EPS ? 'part' : 'ahead';
}

/** Курс повторения (мураджаа): текущая страница круга по выученному. */
export function murajaCursor(db: DB, r: Resource, beforeDay?: DayKey): { cursor: number; learned: number } {
  const hifz = active(db, 'hifz') ?? queue(db, 'hifz')[0];
  const learned = hifz ? Math.max(1, Math.floor(position(db, hifz)) - 1) : 604;
  const total = unitsDone(db, r, beforeDay);
  const cursor = ((((r.first - 1) + total) % learned) + learned) % learned + 1;
  return { cursor: Math.floor(cursor), learned };
}

function rangeWrap(from: number, count: number, max: number): string {
  const to = from + Math.ceil(count) - 1;
  if (to <= max) return `стр. ${from}–${to}`;
  return `стр. ${from}–${max}, 1–${to - max}`;
}

export function labelFor(db: DB, s: Subject, r: Resource | null, from: number, planned: number, review = false): string {
  if (review) return 'повтор заученного';
  if (!r) return 'очередь пуста';
  if (s.mode === 'weekly') return `урок · с ${Math.floor(from)}-й стр.`;
  if (s.mode === 'cycle') {
    const { learned } = murajaCursor(db, r);
    return rangeWrap(from, planned, learned);
  }
  const f = Math.floor(from);
  const half = from - f > EPS ? ' (2-я половина)' : '';
  if (r.minutesPerDay) return `с ${f}-й стр. · ${r.minutesPerDay} мин`;
  switch (r.unit) {
    case 'qpage': {
      const to = Math.ceil(from + planned) - 1;
      return (to > f ? `стр. ${f}–${to}` : `стр. ${f}`) + half + ` · ${surahName(f)}`;
    }
    case 'page': {
      const to = from + planned - 1;
      const v = volumeOf(r, f);
      return `стр. ${f}–${Math.min(Math.ceil(to), r.last ?? Infinity)}${v ? ` · т. ${v}` : ''}`;
    }
    case 'record': {
      const p1 = bookPage(r, from), p2 = bookPage(r, from + planned);
      const n = Math.ceil(from + planned) - 1;
      const rec = n > f ? `записи ${f}–${n}` : `запись ${f}`;
      return `${rec}${half}${p1 != null && p2 != null ? ` · стр. ${p1}–${Math.max(p1, p2 - 1)}` : ''}`;
    }
    case 'video': {
      const n = Math.ceil(from + planned) - 1;
      return (n > f ? `видео ${f}–${n}` : `видео ${f}`) + (r.last ? ` из ${r.last}` : '') + half;
    }
    case 'hadith': return `хадис ${f}${planned > 1 ? `–${f + planned - 1}` : ''}`;
    case 'chunk': return `отрывок ${f}`;
    case 'lesson': return `урок ${f}`;
  }
}

export interface DayPlan {
  day: DayKey; kind: DayModeKind; prayers: PrayerTimes; items: PlanItem[];
  pct: number; doneCount: number; totalCount: number; paused: Subject[];
}

export function dayPlan(db: DB, day: DayKey, nowMin?: number): DayPlan {
  const kind = dayKind(db, day);
  const prayers = prayersFor(db, day);
  const wd = weekday(day);
  const items: PlanItem[] = [];
  const paused: Subject[] = [];
  const subjects = db.subjects.filter((s) => !s.deleted && !s.archived).sort((a, b) => a.order - b.order);

  for (const s of subjects) {
    const slots = db.slots.filter((x) => x.subjectId === s.id && !x.deleted && x.weekdays.includes(wd));
    const main = slots.filter((x) => x.role === 'main');
    const review = slots.filter((x) => x.role === 'review');
    if (kind === 'off') continue;
    if (kind === 'exam' && s.pauseInExam) { if (main.length) paused.push(s); continue; }

    if (main.length) {
      const r = s.mode === 'alternate' ? nextStream(db, s.id, day) : active(db, s.id);
      const base = baseFor(db, s, day, r);
      const addon = addonFor(db, s, day, r);
      const planned = base + addon;
      const done = doneOn(db, s.id, day, s.mode === 'alternate' ? null : r);
      let from = 0;
      if (r) {
        if (s.mode === 'cycle') from = murajaCursor(db, r, day).cursor;
        else if (s.mode === 'alternate') {
          // поток, который отмечали сегодня, или следующий
          const todays = (index(db).bySubjDay.get(`${s.id}|${day}`) ?? []).find((l) => l.kind !== 'review');
          const rr = todays ? resourceById(db, todays.resourceId)! : r;
          from = position(db, rr, day);
          items.push(mk(s, rr, false, planned, addon, done, main, from));
          continue;
        } else from = position(db, r, day);
      }
      items.push(mk(s, r, false, planned, addon, done, main, from));
    }
    if (review.length && kind !== 'light') {
      const done = (index(db).bySubjDay.get(`${s.id}|${day}`) ?? []).filter((l) => l.kind === 'review').length;
      items.push(mk(s, streams(db, s.id)[0] ?? null, true, 1, 0, Math.min(1, done), review, 0));
    }
  }

  function mk(s: Subject, r: Resource | null, rev: boolean, planned: number, addon: number, done: number, sl: Slot[], from: number): PlanItem {
    const insts: SlotInst[] = sl.map((slot) => {
      const start = slotStart(db, slot, day);
      const end = start + slot.duration;
      return { slot, start, end, conflict: conflictOf(db, day, start, end) };
    }).sort((a, b) => a.start - b.start);
    return {
      subject: s, resource: r, review: rev, planned, addon, done,
      measure: r ? measureOf(r) : 'units',
      status: statusOf(planned, done),
      insts, start: insts[0]?.start ?? 0,
      label: labelFor(db, s, r, from, planned, rev),
      from,
    };
  }

  // Добор хифза: если к сроку не отмечено — окно 14:00, а занятие оттуда сдвигается в свободное место.
  const mk2 = db.settings.makeup;
  const hifz = items.find((i) => i.subject.id === mk2.subjectId && !i.review);
  if (hifz && nowMin != null && nowMin >= parseHM(mk2.deadline) && hifz.status !== 'done') {
    const at = parseHM(mk2.at);
    const mkInst: SlotInst = {
      slot: { id: 'makeup', subjectId: mk2.subjectId, anchor: { kind: 'fixed', time: mk2.at }, duration: mk2.duration, weekdays: [wd], role: 'main', updatedAt: 0, label: 'добор' },
      start: at, end: at + mk2.duration, makeup: true,
    };
    for (const it of items) {
      if (it === hifz) continue;
      for (const inst of it.insts) {
        if (inst.start < mkInst.end && inst.end > mkInst.start) {
          const busy = items.flatMap((i) => i.insts).filter((x) => x !== inst).map((x) => [x.start, x.end] as [number, number]);
          busy.push([mkInst.start, mkInst.end]);
          const gap = findGap(db, day, inst.end - inst.start, Math.max(mkInst.end, 13 * 60 + 30), busy);
          if (gap != null) { inst.start = gap; inst.end = gap + (inst.slot.duration); inst.moved = true; inst.conflict = undefined; }
        }
      }
      it.insts.sort((a, b) => a.start - b.start);
      it.start = it.insts[0]?.start ?? it.start;
    }
    hifz.insts.push(mkInst);
    hifz.insts.sort((a, b) => a.start - b.start);
    hifz.start = mkInst.start;
  }

  items.sort((a, b) => a.start - b.start);
  const counted = items;
  const totalCount = counted.length;
  const doneCount = counted.filter((i) => i.status === 'done').length;
  const pct = totalCount ? counted.reduce((a, i) => a + Math.min(1, i.planned ? i.done / i.planned : 0), 0) / totalCount : 0;
  return { day, kind, prayers, items, pct, doneCount, totalCount, paused };
}

/** Свободное окно нужной длины после from, не задевая намазы, занятия, университет и сон. */
export function findGap(db: DB, day: DayKey, dur: number, from: number, busy: [number, number][]): number | null {
  const pt = prayersFor(db, day);
  const blocks: [number, number][] = [...busy, ...PRAYERS.map((p) => [pt[p] - PRAYER_BEFORE, pt[p] + PRAYER_AFTER] as [number, number])];
  const sleep = parseHM(db.settings.sleep);
  for (let t = Math.ceil(from / 5) * 5; t + dur <= sleep; t += 5) {
    if (!blocks.some(([a, b]) => t < b && t + dur > a)) return t;
  }
  return null;
}

/* ---------------- «что сейчас» ---------------- */
export interface Focus {
  item: PlanItem | null;
  inst: SlotInst | null;
  state: 'in' | 'next' | 'catchup' | 'prayer' | 'done' | 'free' | 'rest';
  minutesTo: number;
  reason: string;
  prayer?: { key: PrayerKey; at: number };
}

export function nextPrayer(pt: PrayerTimes, now: number): { key: PrayerKey; at: number } | null {
  for (const p of PRAYERS) if (pt[p] > now) return { key: p, at: pt[p] };
  return null;
}

export function focus(plan: DayPlan, now: number, smart = false): Focus {
  const open = plan.items.filter((i) => i.status !== 'done');
  const np = nextPrayer(plan.prayers, now);
  if (!plan.items.length) return { item: null, inst: null, state: 'rest', minutesTo: 0, reason: plan.kind === 'off' ? 'Сегодня выходной' : 'На сегодня занятий нет' };
  if (!open.length) return { item: null, inst: null, state: 'done', minutesTo: 0, reason: 'План дня выполнен' };

  const insts = open.flatMap((i) => i.insts.map((inst) => ({ i, inst }))).sort((a, b) => a.inst.start - b.inst.start);
  const cur = insts.find(({ inst }) => inst.start <= now && inst.end > now);
  const nxt = insts.find(({ inst }) => inst.start > now);
  const overdue = insts.filter(({ inst }) => inst.end <= now);

  if (smart && np && np.at - now <= 12 && np.at - now >= -PRAYER_AFTER) {
    const after = insts.find(({ inst }) => inst.start >= np.at);
    return {
      item: after?.i ?? null, inst: after?.inst ?? null, state: 'prayer', minutesTo: np.at - now, prayer: np,
      reason: `Скоро ${PRAYER_RU[np.key]} — через ${Math.max(0, Math.round(np.at - now))} мин. После намаза: ${after ? after.i.subject.ru : 'свободно'}`,
    };
  }
  if (cur) return { item: cur.i, inst: cur.inst, state: 'in', minutesTo: 0, reason: 'Сейчас по расписанию' };

  const gap = (nxt ? nxt.inst.start : (np?.at ?? 22 * 60)) - now;
  const gapToPrayer = np ? np.at - now - PRAYER_BEFORE : gap;
  const free = Math.min(gap, gapToPrayer);
  if (overdue.length && free >= 15) {
    // самое отстающее из пропущенных: больше всего осталось относительно плана
    const pick = [...overdue].sort((a, b) => (b.i.planned - b.i.done) / (b.i.planned || 1) - (a.i.planned - a.i.done) / (a.i.planned || 1))[0];
    return { item: pick.i, inst: pick.inst, state: 'catchup', minutesTo: 0, reason: `Свободно ${Math.round(free)} мин — можно добрать` };
  }
  if (nxt) return { item: nxt.i, inst: nxt.inst, state: 'next', minutesTo: nxt.inst.start - now, reason: `Следующее через ${fmtDur(nxt.inst.start - now)}` };
  if (overdue.length) {
    const pick = overdue[overdue.length - 1];
    return { item: pick.i, inst: pick.inst, state: 'catchup', minutesTo: 0, reason: 'Можно добрать до сна' };
  }
  return { item: null, inst: null, state: 'free', minutesTo: 0, reason: 'Свободное время' };
}

export function fmtDur(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}

/* ---------------- серия ---------------- */
export function dayCounted(plan: DayPlan): boolean | null {
  if (!plan.items.length) return null; // нет плана — не влияет
  return plan.kind === 'light' ? plan.pct >= 1 - EPS : plan.pct >= 0.75 - EPS;
}

export function streak(db: DB, today: DayKey): { days: number; todayCounted: boolean } {
  let days = 0;
  const t = dayCounted(dayPlan(db, today));
  if (t) days++;
  for (let d = addDays(today, -1); d >= db.settings.planStart; d = addDays(d, -1)) {
    const c = dayCounted(dayPlan(db, d));
    if (c === null) continue;
    if (!c) break;
    days++;
  }
  return { days, todayCounted: !!t };
}

/* ---------------- прогнозы ---------------- */
function simulate(db: DB, s: Subject, startDay: DayKey, amount: number, perPlannedDay: number): DayKey | null {
  if (amount <= EPS) return startDay;
  if (perPlannedDay <= EPS) return null;
  let rem = amount;
  let d = startDay;
  for (let i = 0; i < 4000; i++, d = addDays(d, 1)) {
    if (!isPlannedDay(db, s, d)) continue;
    rem -= perPlannedDay;
    if (rem <= EPS) return d;
  }
  return null;
}

/** Реальный темп: сколько единиц в среднем за учебный день (последние 14 дней). */
export function pace(db: DB, s: Subject, today: DayKey, r?: Resource | null): number | null {
  let planned = 0, done = 0;
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today, -i);
    if (d < db.settings.planStart) break;
    if (isPlannedDay(db, s, d)) planned++;
    done += doneOn(db, s.id, d, r ?? null);
  }
  if (planned < 3) return null;
  return done / planned;
}

export interface Forecast { ideal: DayKey | null; real: DayKey | null; remaining: number | null; pace: number | null }

export function forecast(db: DB, r: Resource, today: DayKey): Forecast {
  const s = subjectById(db, r.subjectId);
  const rem = remaining(db, r);
  if (rem == null) return { ideal: null, real: null, remaining: null, pace: null };
  const share = s.mode === 'alternate' ? Math.max(1, streams(db, s.id).length) : 1;
  const doneToday = doneOn(db, s.id, today, r);
  const startDay = doneToday > 0 ? addDays(today, 1) : today;
  // учитываем, что до старта книги впереди могут быть другие книги очереди
  let from = startDay;
  const act = active(db, s.id);
  if (s.mode === 'queue' && act && act.id !== r.id && r.queuePos > act.queuePos) {
    const q = queue(db, s.id).filter((x) => x.queuePos < r.queuePos && !isFinished(db, x));
    for (const prev of q) {
      const f = forecast(db, prev, today).ideal;
      if (!f) return { ideal: null, real: null, remaining: rem, pace: null };
      from = addDays(f, 1);
    }
  }
  const measuredInMinutes = measureOf(r) === 'minutes';
  const n = measuredInMinutes ? null : norm(db, r, today) / share;
  const ideal = n ? simulate(db, s, from, rem, n) : null;
  const p = pace(db, s, today, measuredInMinutes ? r : null);
  const realPerDay = measuredInMinutes
    ? (() => { // для «минутных» норм — темп в страницах
      let pages = 0, planned = 0;
      for (let i = 1; i <= 14; i++) { const d = addDays(today, -i); if (d < db.settings.planStart) break; if (isPlannedDay(db, s, d)) planned++; pages += (index(db).bySubjDay.get(`${s.id}|${d}`) ?? []).filter((l) => l.resourceId === r.id).reduce((a, l) => a + l.units, 0); }
      return planned >= 3 ? pages / planned : null;
    })()
    : (p != null ? p / share : null);
  const real = realPerDay && (act?.id === r.id || s.mode !== 'queue') ? simulate(db, s, startDay, rem, realPerDay) : null;
  return { ideal, real, remaining: rem, pace: realPerDay };
}

/** Мураджаа: когда закончится текущий круг. */
export function cycleForecast(db: DB, r: Resource, today: DayKey): { day: DayKey | null; left: number; learned: number } {
  const s = subjectById(db, r.subjectId);
  const { cursor, learned } = murajaCursor(db, r);
  const left = learned - cursor + 1;
  return { day: simulate(db, s, addDays(today, doneOn(db, s.id, today) > 0 ? 1 : 0), left, norm(db, r)), left, learned };
}

/* ---------------- итоги ---------------- */
export function minutesOf(db: DB, l: LogEntry): number {
  if (l.minutes) return l.minutes;
  const s = subjectById(db, l.subjectId);
  if (l.kind === 'review') return 30;
  const r = resourceById(db, l.resourceId);
  if (r?.unit === 'page' && s.id === 'tawhid') return l.units * 4;
  return l.units * s.minPerUnit;
}

export function totals(db: DB, from: DayKey, to: DayKey) {
  let pages = 0, quran = 0, minutes = 0, records = 0;
  const bySubject = new Map<string, number>();
  for (const l of index(db).live) {
    if (l.day < from || l.day > to) continue;
    const r = resourceById(db, l.resourceId);
    minutes += minutesOf(db, l);
    if (r?.unit === 'page') pages += l.units;
    if (r?.unit === 'qpage' && l.subjectId === 'hifz') quran += l.units;
    if (r?.unit === 'record' || r?.unit === 'video') records += l.units;
    bySubject.set(l.subjectId, (bySubject.get(l.subjectId) ?? 0) + minutesOf(db, l));
  }
  return { pages, quran, minutes, records, bySubject };
}

/* ---------------- отметки ---------------- */
export interface NewLog { resourceId: string; units: number; minutes?: number; note?: string; kind?: 'review'; subjectId?: string }

/** Создать записи журнала. Перебор: остаток идёт в следующую книгу очереди, только если у неё та же единица. */
export function makeLogs(db: DB, input: NewLog, day: DayKey, device: string, now: number, uuid: () => string): LogEntry[] {
  const r = resourceById(db, input.resourceId);
  const subjectId = input.subjectId ?? r?.subjectId ?? '';
  const group = uuid();
  const base = (resourceId: string, units: number, extra: Partial<LogEntry> = {}): LogEntry => ({
    id: uuid(), resourceId, subjectId, day, units, device, createdAt: now, updatedAt: now, group, ...extra,
  });
  if (!r || input.kind === 'review') return [base(input.resourceId, 0, { kind: 'review', note: input.note, minutes: input.minutes })];
  const pos = position(db, r);
  const out: LogEntry[] = [];
  let units = input.units;
  if (r.last != null && r.last - pos + 1 < units - EPS) {
    const fits = Math.max(0, r.last - pos + 1);
    out.push(base(r.id, fits, { from: pos, to: r.last, minutes: input.minutes, note: input.note }));
    units -= fits;
    const q = queue(db, r.subjectId);
    const next = q.find((x) => x.queuePos > r.queuePos && !isFinished(db, x));
    if (next && next.unit === r.unit && units > EPS) {
      const p2 = position(db, next);
      out.push(base(next.id, units, { from: p2, to: Math.ceil(p2 + units) - 1, createdAt: now + 1, updatedAt: now + 1 }));
    }
    return out;
  }
  out.push(base(r.id, units, {
    from: pos, to: Math.ceil(pos + units) - 1, minutes: input.minutes, note: input.note,
  }));
  return out;
}

/* ---------------- отсчёт ---------------- */
export function countdownTarget(db: DB, today: DayKey): { day: DayKey; label: string } {
  const c = db.settings.countdown;
  if (c.kind === 'custom' && c.date) return { day: c.date, label: c.label || 'до цели' };
  if (c.kind === 'semester' && c.date) return { day: c.date, label: c.label || 'до конца семестра' };
  if (c.kind === 'hijri') {
    let d = today; const y0 = hijri(today).year;
    for (let i = 0; i < 400; i++) { d = addDays(d, 1); if (hijri(d).year > y0) break; }
    return { day: d, label: `до ${y0 + 1} г. х.` };
  }
  const { y } = parseKey(today);
  return { day: `${y + 1}-01-01`, label: `до ${y + 1} года` };
}

export { diffDays };
