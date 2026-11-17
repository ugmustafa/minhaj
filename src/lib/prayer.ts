// Время намаза: метод Умм аль-Кура (Фаджр 18.5°, Иша = Магриб + 90 мин, в Рамадан + 120),
// Аср по шафиитскому мазхабу (тень = 1). Считается на устройстве, без интернета.

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYER_RU: Record<PrayerKey, string> = {
  fajr: 'Фаджр', sunrise: 'Восход', dhuhr: 'Зухр', asr: 'Аср', maghrib: 'Магриб', isha: 'Иша',
};
export const PRAYER_GEN: Record<PrayerKey, string> = {
  fajr: 'Фаджра', sunrise: 'восхода', dhuhr: 'Зухра', asr: 'Асра', maghrib: 'Магриба', isha: 'Иша',
};
export const PRAYER_AR: Record<PrayerKey, string> = {
  fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء',
};
export const PRAYERS: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** Минуты от полуночи по местному времени. */
export type PrayerTimes = Record<PrayerKey, number>;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function julianDay(y: number, m: number, d: number): number {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/** Склонение солнца (рад) и уравнение времени (мин) по Миусу (низкая точность). */
function sun(jd: number) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T)
    + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqt = 4 * deg(
    y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M))
    + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)),
  );
  return { decl, eqt };
}

/** Часовой угол (в часах) для высоты солнца alt (град). */
function hourAngle(lat: number, decl: number, alt: number): number {
  const v = (Math.sin(rad(alt)) - Math.sin(rad(lat)) * Math.sin(decl)) / (Math.cos(rad(lat)) * Math.cos(decl));
  return deg(Math.acos(Math.max(-1, Math.min(1, v)))) / 15;
}

export interface Place { lat: number; lng: number; tzMin: number }
export const MEDINA: Place = { lat: 24.4672, lng: 39.6111, tzMin: 180 };

/** isRamadan — передаётся снаружи (по календарю Умм аль-Кура). */
export function prayerTimes(y: number, m: number, d: number, place: Place = MEDINA, isRamadan = false): PrayerTimes {
  const tz = place.tzMin / 60;
  const jd0 = julianDay(y, m, d);
  // приближённое время события → уточнённое склонение
  const at = (hours: number) => sun(jd0 + (hours - tz) / 24);
  const noonGuess = 12 + tz - place.lng / 15;
  const s0 = at(noonGuess);
  const transit = 12 + tz - place.lng / 15 - s0.eqt / 60;

  const event = (alt: number | ((decl: number) => number), sign: -1 | 1) => {
    let t = transit;
    for (let i = 0; i < 3; i++) {
      const s = at(t);
      const a = typeof alt === 'function' ? alt(s.decl) : alt;
      const tr = 12 + tz - place.lng / 15 - s.eqt / 60;
      t = tr + sign * hourAngle(place.lat, s.decl, a);
    }
    return t;
  };

  const fajr = event(-18.5, -1);
  const sunrise = event(-0.833, -1);
  const asr = event((decl) => deg(Math.atan(1 / (1 + Math.tan(Math.abs(rad(place.lat) - decl))))), 1);
  const maghrib = event(-0.833, 1);
  const toMin = (h: number) => Math.round(h * 60);
  const mg = toMin(maghrib);
  return {
    fajr: toMin(fajr),
    sunrise: toMin(sunrise),
    dhuhr: toMin(transit),
    asr: toMin(asr),
    maghrib: mg,
    isha: mg + (isRamadan ? 120 : 90),
  };
}

export function fmtMin(m: number): string {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}
