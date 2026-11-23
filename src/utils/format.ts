const moneyFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

export const formatMoney = (v: number): string => (Number.isFinite(v) ? `₺${moneyFmt.format(Math.round(v))}` : 'Sınırsız');
export const formatNumber = (v: number): string => numFmt.format(v);

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Simulation calendar: 30-day months, 12-month years; minute 0 = Day 1, 08:00, Year 1. */
export interface GameDate {
  year: number;
  month: number; // 0-11
  day: number; // 1-30
  hour: number;
  minute: number;
}

import { START_MINUTE_OFFSET } from '../game/core/config';

export { START_MINUTE_OFFSET };

export function toGameDate(totalMinutes: number): GameDate {
  const m = Math.floor(totalMinutes + START_MINUTE_OFFSET);
  const minute = m % 60;
  const hour = Math.floor(m / 60) % 24;
  const dayIndex = Math.floor(m / 1440);
  const day = (dayIndex % 30) + 1;
  const month = Math.floor(dayIndex / 30) % 12;
  const year = Math.floor(dayIndex / 360) + 1;
  return { year, month, day, hour, minute };
}

export function formatGameDate(totalMinutes: number): { date: string; time: string } {
  const d = toGameDate(totalMinutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.day} ${MONTHS[d.month]} Yıl ${d.year}`, time: `${pad(d.hour)}:${pad(d.minute)}` };
}

export const formatMeters = (m: number): string =>
  m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
