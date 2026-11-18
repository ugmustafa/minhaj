import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/lib/seed';
import * as E from '../src/lib/engine';
import type { DB, LogEntry } from '../src/lib/types';
import { addDays, studyDay, tsOf, hijri, nextHijriNewYear } from '../src/lib/time';
import { prayerTimes, fmtMin } from '../src/lib/prayer';
import { surahName, SURAH_START } from '../src/lib/quran';

const START = '2026-11-17'; // вторник
let n = 0;
const uuid = () => `id${++n}`;
const fresh = (): DB => seed(START, 0);
function log(db: DB, resourceId: string, units: number, day: string, extra: Partial<LogEntry> = {}): DB {
  const created = E.makeLogs(db, { resourceId, units, ...extra }, day, 'test', Date.parse(day + 'T12:00:00Z') + (++n), uuid);
  return { ...db, logs: [...db.logs, ...created] };
}
const res = (db: DB, sid: string, i = 0) => E.queue(db, sid)[i];

test('прогресс книги: позиция и остаток', () => {
  let db = fresh();
  const nahw = res(db, 'nahw');
  assert.equal(E.position(db, nahw), 13);
  assert.equal(E.remaining(db, nahw), 38);
  db = log(db, nahw.id, 1, START);
  db = log(db, nahw.id, 0.5, addDays(START, 1));
  assert.equal(E.position(db, nahw), 14.5);
  assert.equal(E.remaining(db, nahw), 36.5);
  // страница книги для записи 13 = 125 (по данным студента)
  assert.equal(E.bookPage(nahw, 13), 125);
});

test('хифз: страница → сура (мусхаф Медины)', () => {
  assert.equal(surahName(105), 'النساء');
  assert.equal(surahName(106), 'المائدة');
  assert.equal(surahName(604), 'الناس');
  assert.equal(SURAH_START.length, 114);
});

test('переход на следующую книгу: последняя страница, перебор, отмена, пустая очередь', () => {
  let db = fresh();
  // Таухид: видео 9..16 → затем книга со страницами (другая единица)
  const vids = res(db, 'tawhid', 0);
  db = log(db, vids.id, 7, START);
  assert.equal(E.active(db, 'tawhid')!.id, vids.id);
  db = log(db, vids.id, 3, START); // перебор на 2 видео — другая единица, не переносится
  assert.ok(E.isFinished(db, vids));
  assert.equal(E.finishedDay(db, vids), START);
  const book2 = res(db, 'tawhid', 1);
  assert.equal(E.active(db, 'tawhid')!.id, book2.id);
  assert.equal(E.position(db, book2), 1, 'видео не превращаются в страницы');
  // отмена отметки после перехода → книга снова активна
  const last = db.logs[db.logs.length - 1];
  const undone = { ...db, logs: db.logs.map((l) => (l.group === last.group ? { ...l, deleted: true } : l)) };
  assert.equal(E.active(undone, 'tawhid')!.id, vids.id);
  assert.equal(E.position(undone, vids), 16);

  // Перебор страниц с той же единицей переносится: книга 2 (196 стр.) → книга 3 (страницы)
  db = log(db, book2.id, 190, START);
  db = log(db, book2.id, 10, addDays(START, 1)); // 6 закрывают книгу, 4 идут в шарх Ибн Усеймина
  const book3 = res(db, 'tawhid', 2);
  assert.ok(E.isFinished(db, book2));
  assert.equal(E.position(db, book3), 5);

  // Пустая очередь: сарф 21 запись
  const sarf = res(db, 'sarf');
  db = log(db, sarf.id, 21, START);
  assert.equal(E.active(db, 'sarf'), null);
  const plan = E.dayPlan(db, addDays(START, 5)); // воскресенье
  const it = plan.items.find((i) => i.subject.id === 'sarf')!;
  assert.equal(it.label, 'очередь пуста');
  assert.equal(it.planned, 0);
});

test('долг не раскладывается: после пропуска норма прежняя, место то же', () => {
  let db = fresh();
  const r = res(db, 'reading');
  // вт, ср, чт пропущены
  const sat = addDays(START, 4);
  const p = E.dayPlan(db, sat).items.find((x) => x.subject.id === 'reading')!;
  assert.equal(p.addon, 0);
  assert.equal(p.planned, 15);
  assert.equal(p.label, 'стр. 31–45');
  const h = E.dayPlan(db, addDays(START, 1)).items.find((i) => i.subject.id === 'hifz')!;
  assert.equal(h.planned, 1);
  db = log(db, r.id, 15, sat);
  assert.equal(E.position(db, r), 46);
});

test('граница учебного дня: 00:30 → вчера; 31 декабря; хиджрийский год', () => {
  assert.equal(studyDay(tsOf('2027-01-01', 30)), '2026-12-31');
  assert.equal(studyDay(tsOf('2027-01-01', 4 * 60)), '2027-01-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const ny = nextHijriNewYear('2027-05-01');
  assert.equal(hijri(ny).year, 1449);
  assert.equal(hijri(ny).month, 1);
  assert.equal(hijri(ny).day, 1);
  assert.equal(hijri(addDays(ny, -1)).year, 1448);
});

test('процент дня и серия на примере', () => {
  let db = fresh();
  // вт 17.11: 7 дел (хифз, сарф, нахв, таухид, мураджаа, заучивание, чтение)
  const p0 = E.dayPlan(db, START);
  assert.equal(p0.totalCount, 7);
  db = log(db, res(db, 'hifz').id, 1, START);
  db = log(db, res(db, 'sarf').id, 1, START);
  db = log(db, res(db, 'reading').id, 7.5, START); // половина
  const p1 = E.dayPlan(db, START);
  assert.equal(p1.doneCount, 2);
  assert.ok(Math.abs(p1.pct - 2.5 / 7) < 1e-9);
  assert.equal(E.dayCounted(p1), false);
  // делаем весь план вт, ср, чт → серия 3; пятница (выходной) не обрывает
  db = fresh();
  for (const d of [START, addDays(START, 1), addDays(START, 2)]) {
    for (const it of E.dayPlan(db, d).items) {
      if (it.review) db = log(db, it.resource!.id, 0, d, { kind: 'review', subjectId: it.subject.id });
      else if (it.resource) db = log(db, it.resource.id, it.planned, d);
    }
  }
  assert.equal(E.streak(db, addDays(START, 3)).days, 3);
});

test('прогноз: сарф 21 запись, вс–чт, пауза на экзамены → 27.12.2026', () => {
  const db = fresh();
  const f = E.forecast(db, res(db, 'sarf'), START);
  assert.equal(f.ideal, '2026-12-27');
  assert.equal(f.real, null, 'нет истории — реальный прогноз не показываем');
});

test('прогноз по реальному темпу за 14 дней', () => {
  let db = fresh();
  const r = res(db, 'nahw');
  // 14 дней: делает ½ записи в каждый учебный день
  for (let i = 0; i < 14; i++) {
    const d = addDays(START, i);
    if (E.isPlannedDay(db, E.subjectById(db, 'nahw'), d)) db = log(db, r.id, 0.5, d);
  }
  const today = addDays(START, 14);
  const f = E.forecast(db, r, today);
  assert.equal(f.pace, 0.5);
  assert.ok(f.real! > f.ideal!, 'реальная дата позже идеальной');
});

test('слот «после Асра» сдвигается вместе с Асром и не пересекается с Магрибом', () => {
  const db = fresh();
  const slot = db.slots.find((s) => s.subjectId === 'nahw')!;
  for (const d of ['2026-11-17', '2027-01-14', '2027-06-21']) {
    const pt = E.prayersFor(db, d);
    const st = E.slotStart(db, slot, d);
    assert.equal(st, pt.asr + 15);
    assert.equal(E.conflictOf(db, d, st, st + slot.duration), undefined);
  }
  // чтение в 20:30 летом задевает Иша → предупреждение
  const rd = db.slots.find((s) => s.subjectId === 'reading')!;
  assert.match(E.conflictOf(db, '2027-06-21', 20 * 60 + 30, 21 * 60 + 30) ?? '', /Иша/);
  assert.ok(rd);
});

test('добор хифза: не отмечен к 6:30 → окно 14:00, сарф сдвигается', () => {
  const db = fresh();
  const p = E.dayPlan(db, START, 7 * 60);
  const h = p.items.find((i) => i.subject.id === 'hifz')!;
  assert.ok(h.insts.some((x) => x.makeup && fmtMin(x.start) === '14:00'));
  const sarf = p.items.find((i) => i.subject.id === 'sarf')!;
  assert.ok(sarf.insts[0].moved);
  assert.notEqual(fmtMin(sarf.insts[0].start), '14:00');
});

test('режим экзаменов: новые книги на паузе, хифз и мураджаа идут', () => {
  const db = fresh();
  const p = E.dayPlan(db, '2026-11-30'); // пн, экзамены
  assert.equal(p.kind, 'exam');
  assert.deepEqual(p.items.map((i) => i.subject.id).sort(), ['hifz', 'muraja']);
});

test('мураджаа: круг по выученному, перенос через конец', () => {
  let db = fresh();
  const r = res(db, 'muraja');
  assert.equal(E.murajaCursor(db, r).cursor, 77);
  assert.equal(E.murajaCursor(db, r).learned, 104);
  db = log(db, r.id, 20, START); // 77–96
  db = log(db, r.id, 20, addDays(START, 1)); // 97–104, 1–12
  assert.equal(E.murajaCursor(db, r).cursor, 13);
});

test('время намаза Медина: разумные значения', () => {
  const pt = prayerTimes(2026, 11, 17);
  assert.equal(fmtMin(pt.isha - pt.maghrib + 0), '01:30');
  assert.ok(pt.fajr > 5 * 60 && pt.fajr < 5 * 60 + 30);
  assert.ok(pt.maghrib > 17 * 60 + 20 && pt.maghrib < 17 * 60 + 45);
});
