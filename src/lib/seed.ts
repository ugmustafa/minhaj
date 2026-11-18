import type { DB, Resource, Slot, Subject } from './types';
import { MEDINA } from './prayer';
import type { DayKey } from './time';

const SUNTHU = [0, 1, 2, 3, 4];

export function seed(today: DayKey, now = Date.now()): DB {
  const u = now;
  const S = (id: string, ru: string, ar: string, color: string, order: number, mode: Subject['mode'],
    pauseInExam: boolean, carryDebt: boolean, minPerUnit: number): Subject =>
    ({ id, ru, ar, color, order, mode, pauseInExam, carryDebt, minPerUnit, updatedAt: u });

  const subjects: Subject[] = [
    S('hifz', 'Хифз', 'حفظ القرآن', '#2F6B57', 1, 'queue', false, false, 60),
    S('muraja', 'Мураджаа', 'مراجعة القرآن', '#4C7F8F', 2, 'cycle', false, false, 3),
    S('nahw', 'Нахв', 'النحو', '#8A6A2F', 3, 'queue', true, false, 60),
    S('sarf', 'Сарф', 'الصرف', '#7A5B86', 4, 'queue', true, false, 25),
    S('tawhid', 'Таухид', 'التوحيد', '#3E6E8C', 5, 'queue', true, false, 60),
    S('reading', 'Чтение', 'القراءة', '#8C5A45', 6, 'queue', true, false, 4),
    S('mutun', 'Заучивание', 'حفظ المتون والأحاديث', '#5E7A3A', 7, 'alternate', true, false, 30),
    S('lesson', 'Урок: Китаб ат-таухид', 'درس كتاب التوحيد', '#6B6B3A', 8, 'weekly', true, false, 60),
  ];

  let n = 0;
  const R = (r: Omit<Resource, 'id' | 'updatedAt' | 'queuePos'> & { queuePos?: number }): Resource =>
    ({ id: `r${++n}`, updatedAt: u, queuePos: r.queuePos ?? 1, ...r });

  const resources: Resource[] = [
    R({ subjectId: 'hifz', title: 'مصحف المدينة', unit: 'qpage', first: 105, last: 604, perDay: 1 }),
    R({ subjectId: 'muraja', title: 'مراجعة المحفوظ', unit: 'qpage', first: 77, last: null, perDay: 20 }),
    R({ subjectId: 'nahw', title: 'النحو التطبيقي', unit: 'record', first: 13, last: 50, perDay: 1, bookPages: { atFirst: 125, end: 587 }, note: 'Аудиоуроки' }),
    R({ subjectId: 'nahw', title: 'النحو التطبيقي', unit: 'page', first: 1, last: 587, minutesPerDay: 60, queuePos: 2, note: 'Второй проход — читать самому, около часа' }),
    R({ subjectId: 'sarf', title: 'التطبيق الصرفي', unit: 'record', first: 1, last: 21, perDay: 1, bookPages: { atFirst: 1, end: 197 }, note: 'Аудиоуроки · книга 197 стр.' }),
    R({ subjectId: 'tawhid', title: 'الأصول الثلاثة', unit: 'video', first: 9, last: 16, perDay: 1, note: 'Видеоуроки' }),
    R({ subjectId: 'tawhid', title: 'شرح الأصول الثلاثة', author: 'الفوزان', unit: 'page', first: 1, last: 196, perDay: 15, queuePos: 2, note: 'Норма 10–20 стр.' }),
    R({ subjectId: 'tawhid', title: 'شرح كتاب التوحيد', author: 'ابن عثيمين', unit: 'page', first: 1, last: null, perDay: 15, queuePos: 3 }),
    R({ subjectId: 'tawhid', title: 'شرح كتاب التوحيد', author: 'الفوزان', unit: 'page', first: 1, last: null, perDay: 15, queuePos: 4 }),
    R({ subjectId: 'reading', title: 'مفتاح دار السعادة', author: 'ابن القيم', unit: 'page', first: 31, last: 1603, perDay: 15, note: '3 тома, сквозной счёт' }),
    R({ subjectId: 'mutun', title: 'متن الأصول الثلاثة', unit: 'chunk', first: 1, last: null, perDay: 1 }),
    R({ subjectId: 'mutun', title: '١٠٠ حديث للحفظ', unit: 'hadith', first: 26, last: 100, perDay: 1, queuePos: 2 }),
    R({ subjectId: 'lesson', title: 'كتاب التوحيد', unit: 'page', first: 1, last: null, note: 'Раз в неделю, сокращённо · отмечайте страницы' }),
  ];

  let k = 0;
  const L = (s: Omit<Slot, 'id' | 'updatedAt'>): Slot => ({ id: `s${++k}`, updatedAt: u, ...s });
  const slots: Slot[] = [
    L({ subjectId: 'hifz', anchor: { kind: 'fixed', time: '04:30' }, duration: 35, weekdays: SUNTHU, role: 'main' }),
    L({ subjectId: 'sarf', anchor: { kind: 'fixed', time: '14:00' }, duration: 30, weekdays: SUNTHU, role: 'main' }),
    L({ subjectId: 'nahw', anchor: { kind: 'prayer', prayer: 'asr', offset: 15 }, duration: 60, weekdays: SUNTHU, role: 'main' }),
    L({ subjectId: 'tawhid', anchor: { kind: 'prayer', prayer: 'asr', offset: 80 }, duration: 50, weekdays: SUNTHU, role: 'main' }),
    L({ subjectId: 'muraja', anchor: { kind: 'prayer', prayer: 'maghrib', offset: 15 }, duration: 60, weekdays: [...SUNTHU, 6], role: 'main' }),
    L({ subjectId: 'mutun', anchor: { kind: 'prayer', prayer: 'isha', offset: 15 }, duration: 30, weekdays: [0, 2, 4], role: 'main' }),
    L({ subjectId: 'lesson', anchor: { kind: 'prayer', prayer: 'isha', offset: 15 }, duration: 60, weekdays: [3], role: 'main' }),
    L({ subjectId: 'reading', anchor: { kind: 'fixed', time: '20:30' }, duration: 60, weekdays: [...SUNTHU, 6], role: 'main' }),
  ];

  return {
    subjects, resources, slots, logs: [], dayModes: [],
    settings: {
      id: 'settings', updatedAt: u,
      lat: MEDINA.lat, lng: MEDINA.lng, city: 'Медина', tzMin: 180,
      wake: '04:30', sleep: '22:00', boundary: '03:30',
      offDays: [5],
      exams: [{ id: 'ex1', from: '2026-11-29', to: '2026-12-08', label: 'Экзамены' }],
      countdown: { kind: 'custom', date: '2027-05-01', label: 'до 1 мая' },
      theme: 'auto', planStart: today, onboarded: false,
      makeup: { subjectId: 'hifz', deadline: '06:30', at: '14:00', duration: 30 },
    },
  };
}
