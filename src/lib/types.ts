import type { PrayerKey } from './prayer';
import type { DayKey } from './time';

export type Unit = 'qpage' | 'page' | 'record' | 'video' | 'chunk' | 'hadith' | 'lesson';
export type SubjectMode = 'queue' | 'cycle' | 'alternate' | 'weekly';

interface Base { id: string; updatedAt: number; deleted?: boolean }

export interface Subject extends Base {
  ru: string;
  ar: string;
  color: string;
  order: number;
  archived?: boolean;
  mode: SubjectMode;
  /** На паузе в режиме экзаменов (новый материал). */
  pauseInExam: boolean;
  /** Переносить недобор на следующие дни. */
  carryDebt: boolean;
  /** Примерные минуты на единицу (для учёта часов и подсказок). */
  minPerUnit: number;
}

export interface Resource extends Base {
  subjectId: string;
  title: string;
  author?: string;
  unit: Unit;
  /** Номер первой ещё не пройденной единицы на момент начала учёта. */
  first: number;
  /** Номер последней единицы (null — объём не указан). */
  last: number | null;
  queuePos: number;
  /** Норма в день (единицы) — для книги; если нет — берётся у предыдущей книги с той же единицей. */
  perDay?: number;
  /** Норма в минутах вместо единиц (например, «читать около часа»). */
  minutesPerDay?: number;
  /** «Закончить до…» — норма считается сама. */
  deadline?: DayKey;
  /** Для аудиозаписей: страница книги, на которой начинается запись first, и последняя страница книги. */
  bookPages?: { atFirst: number; end: number };
  /** Тома (сквозной счёт страниц). */
  volumes?: { n: number; from: number; to: number }[];
  link?: string;
  note?: string;
}

export type Anchor = { kind: 'fixed'; time: string } | { kind: 'prayer'; prayer: PrayerKey; offset: number };

export interface Slot extends Base {
  subjectId: string;
  anchor: Anchor;
  duration: number;
  weekdays: number[];
  /** main — основное занятие; review — повторение заученного (без единиц). */
  role: 'main' | 'review';
  label?: string;
  ticktickTaskId?: string;
}

export interface LogEntry extends Base {
  resourceId: string;
  subjectId: string;
  day: DayKey;
  /** Пройдено единиц (может быть 0.5 — «половина записи»). */
  units: number;
  minutes?: number;
  from?: number;
  to?: number;
  note?: string;
  kind?: 'review';
  device: string;
  createdAt: number;
  group?: string;
}

export type DayModeKind = 'normal' | 'light' | 'off' | 'exam';
export interface DayMode extends Base { day: DayKey; mode: DayModeKind }

export interface Period { id: string; from: DayKey; to: DayKey; label: string; kind?: 'exam' | 'holiday' }

export interface Settings extends Base {
  lat: number; lng: number; city: string; tzMin: number;
  wake: string; sleep: string; boundary: string;
  offDays: number[];
  exams: Period[];
  countdown: { kind: 'custom' | 'greg' | 'hijri' | 'semester'; date?: DayKey; label?: string };
  theme: 'auto' | 'light' | 'dark';
  planStart: DayKey;
  onboarded: boolean;
  /** Окно добора хифза, если утром не отмечено. */
  makeup: { subjectId: string; deadline: string; at: string; duration: number };
}

export interface DB {
  subjects: Subject[];
  resources: Resource[];
  slots: Slot[];
  logs: LogEntry[];
  dayModes: DayMode[];
  settings: Settings;
}
