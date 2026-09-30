import { DAY_NAMES } from '@/lib/color';

export type HourRow = { day_of_week: number; open: string; close: string };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
/** "00:00" como hora de cierre significa medianoche del mismo día. */
const closeMin = (r: HourRow) => {
  const c = toMin(r.close);
  return c <= toMin(r.open) ? c + 24 * 60 : c;
};
const short = (hhmm: string) => hhmm.slice(0, 5);

/** Día de la semana (0 = domingo) y minuto del día en la zona horaria de la barbería. */
export function nowIn(tz: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { dow: dow < 0 ? 0 : dow, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

export interface OpenState { open: boolean; label: string }

/** "Abierto ahora, cierra a las 20:00" o "Cerrado, abre mañana a las 10:00". */
export function openState(hours: HourRow[] | undefined | null, tz = 'America/Lima', at = new Date()): OpenState | null {
  if (!hours || hours.length === 0) return null;
  const { dow, min } = nowIn(tz, at);
  const byDay = (d: number) => hours.filter((h) => h.day_of_week === d).sort((a, b) => toMin(a.open) - toMin(b.open));

  // Turno de ayer que cruza la medianoche
  const yesterday = byDay((dow + 6) % 7).find((r) => closeMin(r) > 24 * 60 && min < closeMin(r) - 24 * 60);
  if (yesterday) return { open: true, label: `Abierto ahora, cierra a las ${short(yesterday.close)}` };

  const today = byDay(dow);
  const current = today.find((r) => min >= toMin(r.open) && min < closeMin(r));
  if (current) return { open: true, label: `Abierto ahora, cierra a las ${short(current.close)}` };

  const later = today.find((r) => toMin(r.open) > min);
  if (later) return { open: false, label: `Cerrado, abre hoy a las ${short(later.open)}` };

  for (let i = 1; i <= 7; i++) {
    const d = (dow + i) % 7;
    const first = byDay(d)[0];
    if (first) {
      const when = i === 1 ? 'mañana' : `el ${DAY_NAMES[d].toLowerCase()}`;
      return { open: false, label: `Cerrado, abre ${when} a las ${short(first.open)}` };
    }
  }
  return { open: false, label: 'Cerrado' };
}

/** Semana completa empezando el lunes, con los días sin atención como "Cerrado". */
export function weekTable(hours: HourRow[] | undefined | null) {
  return [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const rows = (hours ?? []).filter((h) => h.day_of_week === d).sort((a, b) => toMin(a.open) - toMin(b.open));
    return { dow: d, day: DAY_NAMES[d], time: rows.length ? rows.map((r) => `${short(r.open)} a ${short(r.close)}`).join(', ') : null };
  });
}
