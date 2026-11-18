// Хранилище на устройстве: IndexedDB (основное) + localStorage (запасная копия).
// Каждое изменение сразу сохраняется. Синхронизация с облаком подключается на этапе 5.
import { useSyncExternalStore } from 'react';
import type { DB, LogEntry, Resource, Slot, Subject, DayMode, Settings } from './types';
import { seed } from './seed';
import { makeLogs, type NewLog } from './engine';
import { studyDay, parseHM } from './time';

const DB_NAME = 'minhaj';
const KEY = 'db-v1';
const LS_KEY = 'minhaj-backup-v1';

export const uuid = (): string =>
  (globalThis.crypto && 'randomUUID' in crypto) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

export function deviceId(): string {
  try {
    let id = localStorage.getItem('minhaj-device');
    if (!id) {
      const ua = navigator.userAgent;
      const kind = /iPad|Macintosh.*Mobile|Macintosh/.test(ua) && 'ontouchend' in document ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : 'Браузер';
      id = `${kind}-${uuid().slice(0, 6)}`;
      localStorage.setItem('minhaj-device', id);
    }
    return id;
  } catch { return 'device'; }
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await idb(); if (!d) return undefined;
  return new Promise((res) => {
    try {
      const r = d.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => res(r.result as T); r.onerror = () => res(undefined);
    } catch { res(undefined); }
  });
}
async function idbSet(key: string, val: unknown): Promise<void> {
  const d = await idb(); if (!d) return;
  return new Promise((res) => {
    try {
      const tx = d.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res(); tx.onerror = () => res();
    } catch { res(); }
  });
}

/* ---------------- состояние ---------------- */
let state: DB | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const nowTs = () => (window as unknown as { __MINHAJ_NOW?: number }).__MINHAJ_NOW ?? Date.now();
export const today = (db?: DB) => studyDay(nowTs(), parseHM((db ?? state)?.settings.boundary ?? '03:30'));

export async function init(): Promise<void> {
  let loaded = await idbGet<DB>(KEY);
  if (!loaded) {
    try { const ls = localStorage.getItem(LS_KEY); if (ls) loaded = JSON.parse(ls); } catch { /* пусто */ }
  }
  state = loaded ? migrate(loaded) : seed(studyDay(nowTs()), nowTs());
  try { await navigator.storage?.persist?.(); } catch { /* не важно */ }
  if (!loaded) await persist();
  emit();
}

function migrate(db: DB): DB {
  const resources = db.resources.map((r) => {
    if (r.subjectId === 'sarf' && r.bookPages?.end === 200) return { ...r, bookPages: { ...r.bookPages, end: 197 }, note: 'Аудиоуроки · книга 197 стр.' };
    if (r.subjectId === 'lesson' && r.unit === 'lesson') return { ...r, unit: 'page' as const, perDay: undefined, note: 'Раз в неделю, сокращённо · отмечайте страницы' };
    return r;
  });
  // по просьбе студента: пропущенное не раскладывается на другие дни
  const subjects = db.subjects.map((x) => (x.carryDebt ? { ...x, carryDebt: false } : x));
  // по просьбе студента убраны: «Хифз · закрепление» и «Заучивание · повтор»
  const slots = db.slots.map((x) => (!x.deleted && ((x.subjectId === 'hifz' && x.label === 'закрепление') || (x.subjectId === 'mutun' && x.role === 'review'))
    ? { ...x, deleted: true, updatedAt: Date.now() } : x));
  return { ...db, subjects, resources, slots, dayModes: db.dayModes ?? [], logs: db.logs ?? [] };
}

let saveTimer: number | undefined;
async function persist(): Promise<void> {
  if (!state) return;
  await idbSet(KEY, state);
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* квота */ } }, 400);
}

function set(next: DB) { state = next; emit(); void persist(); }

export function useDB(): DB | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
export const getDB = () => state!;

/* ---------------- действия ---------------- */
export function addLog(input: NewLog, day?: string): LogEntry[] {
  const db = state!;
  const created = makeLogs(db, input, day ?? today(db), deviceId(), nowTs(), uuid);
  set({ ...db, logs: [...db.logs, ...created] });
  return created;
}

export function undoGroup(group: string) {
  const db = state!; const t = nowTs();
  set({ ...db, logs: db.logs.map((l) => (l.group === group ? { ...l, deleted: true, updatedAt: t } : l)) });
}
export function restoreLog(id: string) {
  const db = state!; const t = nowTs();
  set({ ...db, logs: db.logs.map((l) => (l.id === id ? { ...l, deleted: false, updatedAt: t } : l)) });
}
export function updateLog(id: string, patch: Partial<LogEntry>) {
  const db = state!; const t = nowTs();
  set({ ...db, logs: db.logs.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: t } : l)) });
}

type Table = 'subjects' | 'resources' | 'slots' | 'dayModes';
type Row = Subject | Resource | Slot | DayMode;
export function upsert(table: Table, row: Row) {
  const db = state!; const t = nowTs();
  const list = db[table] as Row[];
  const exists = list.some((x) => x.id === row.id);
  const next = exists ? list.map((x) => (x.id === row.id ? { ...row, updatedAt: t } : x)) : [...list, { ...row, updatedAt: t }];
  set({ ...db, [table]: next } as DB);
}
export function remove(table: Table, id: string) {
  const db = state!; const t = nowTs();
  set({ ...db, [table]: (db[table] as Row[]).map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: t } : x)) } as DB);
}
export function reorder(sid: string, ids: string[]) {
  const db = state!; const t = nowTs();
  set({ ...db, resources: db.resources.map((r) => (r.subjectId === sid && ids.includes(r.id) ? { ...r, queuePos: ids.indexOf(r.id) + 1, updatedAt: t } : r)) });
}
export function setSettings(patch: Partial<Settings>) {
  const db = state!;
  set({ ...db, settings: { ...db.settings, ...patch, updatedAt: nowTs() } });
}
export function setDayMode(day: string, mode: DayMode['mode']) {
  const db = state!; const t = nowTs();
  const ex = db.dayModes.find((m) => m.day === day);
  const row: DayMode = { id: ex?.id ?? `dm-${day}`, day, mode, updatedAt: t };
  set({ ...db, dayModes: ex ? db.dayModes.map((m) => (m.day === day ? row : m)) : [...db.dayModes, row] });
}

/* ---------------- резервная копия ---------------- */
export function exportJSON(): string {
  return JSON.stringify({ app: 'minhaj', version: 1, exportedAt: new Date(nowTs()).toISOString(), data: state }, null, 1);
}
export function importJSON(text: string): void {
  const parsed = JSON.parse(text);
  const data: DB = parsed?.data ?? parsed;
  if (!data?.subjects || !data?.resources || !data?.logs || !data?.settings) throw new Error('Файл не похож на копию «Минхаджа»');
  set(migrate(data));
}
export function resetAll(): void {
  set(seed(today(), nowTs()));
}
