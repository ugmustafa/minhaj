// Время и даты. Часовой пояс студента фиксирован (Asia/Riyadh, UTC+3, без перехода на летнее время).
export const TZ_MIN = 180;

/** День в формате YYYY-MM-DD. */
export type DayKey = string;

export interface LocalParts { y: number; m: number; d: number; min: number; wd: number }

/** Местные дата/время для момента ts (мс). */
export function local(ts: number, tzMin = TZ_MIN): LocalParts {
  const dt = new Date(ts + tzMin * 60000);
  return {
    y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
    min: dt.getUTCHours() * 60 + dt.getUTCMinutes() + dt.getUTCSeconds() / 60,
    wd: dt.getUTCDay(),
  };
}

export const pad = (n: number) => String(n).padStart(2, '0');
export const keyOf = (y: number, m: number, d: number): DayKey => `${y}-${pad(m)}-${pad(d)}`;

export function parseKey(k: DayKey): { y: number; m: number; d: number } {
  const [y, m, d] = k.split('-').map(Number);
  return { y, m, d };
}

/** Полдень этого дня по UTC — удобная «точка» дня. */
export function keyToUtcNoon(k: DayKey): number {
  const { y, m, d } = parseKey(k);
  return Date.UTC(y, m - 1, d, 12);
}

export function addDays(k: DayKey, n: number): DayKey {
  const t = new Date(keyToUtcNoon(k) + n * 86400000);
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function weekday(k: DayKey): number {
  return new Date(keyToUtcNoon(k)).getUTCDay();
}

export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((keyToUtcNoon(b) - keyToUtcNoon(a)) / 86400000);
}

/** Учебный день: всё, что раньше границы (по умолчанию 03:30), относится к вчерашнему дню. */
export function studyDay(ts: number, boundaryMin = 210, tzMin = TZ_MIN): DayKey {
  const p = local(ts, tzMin);
  const k = keyOf(p.y, p.m, p.d);
  return p.min < boundaryMin ? addDays(k, -1) : k;
}

/** Минуты от полуночи учебного дня (после полуночи — больше 1440). */
export function minuteOfStudyDay(ts: number, boundaryMin = 210, tzMin = TZ_MIN): number {
  const p = local(ts, tzMin);
  return p.min < boundaryMin ? p.min + 1440 : p.min;
}

/** Момент (мс) для минуты дня k по местному времени. */
export function tsOf(k: DayKey, minute: number, tzMin = TZ_MIN): number {
  const { y, m, d } = parseKey(k);
  return Date.UTC(y, m - 1, d, 0, 0, 0) + minute * 60000 - tzMin * 60000;
}

export const parseHM = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const RU_MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const RU_WD = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
export const RU_WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function fmtDay(k: DayKey, withYear = false): string {
  const { y, m, d } = parseKey(k);
  return `${d} ${RU_MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}
export function fmtDayShort(k: DayKey): string {
  const { m, d } = parseKey(k);
  return `${d} ${RU_MONTHS_SHORT[m - 1]}`;
}
export const monthNameNom = (m: number) => RU_MONTHS_NOM[m - 1];
export const monthShort = (m: number) => RU_MONTHS_SHORT[m - 1];

/** Хиджрийская дата по календарю Умм аль-Кура (встроено в браузер). */
export function hijri(k: DayKey): { text: string; month: number; year: number; day: number } {
  const t = new Date(keyToUtcNoon(k));
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).formatToParts(t);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const text = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(t).replace(/\s*هـ$/, '');
    return { text, day: get('day'), month: get('month'), year: get('year') };
  } catch {
    return { text: '', day: 0, month: 0, year: 0 };
  }
}

/** Первый день следующего хиджрийского года (поиск по дням вперёд). */
export function nextHijriNewYear(from: DayKey): DayKey {
  const y0 = hijri(from).year;
  let k = from;
  for (let i = 0; i < 400; i++) {
    k = addDays(k, 1);
    if (hijri(k).year > y0) return k;
  }
  return k;
}
