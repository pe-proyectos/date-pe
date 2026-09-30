import { DateTime, Interval } from 'luxon';
import type { Sql } from '../db.js';

export interface Slot {
  start: string; // ISO
  end: string; // ISO
  staffId: string;
}

interface AvailabilityParams {
  tenantId: string;
  locationId?: string | null;
  staffId?: string | null; // null/undefined => cualquiera disponible
  date: string; // YYYY-MM-DD (en la zona del tenant)
  durationMin: number;
  timezone: string;
  slotIntervalMin: number;
  /** Al reprogramar, la cita que se mueve no se bloquea a sí misma */
  excludeAppointmentId?: string | null;
}

/**
 * Calcula los slots libres para una fecha combinando:
 * turnos recurrentes (staff_schedules) - excepciones - citas existentes.
 * Corre dentro de withTenant (RLS filtra por tenant).
 */
export async function computeSlots(sql: Sql, p: AvailabilityParams): Promise<Slot[]> {
  const zone = p.timezone || 'America/Lima';
  const day = DateTime.fromISO(p.date, { zone });
  if (!day.isValid) return [];
  const dow = day.weekday % 7; // luxon: 1=lunes..7=domingo -> 0=domingo..6=sabado

  // Turnos del día (por barbero), opcionalmente filtrados por local/barbero.
  const schedules = await sql<{
    staff_id: string;
    location_id: string | null;
    start_time: string;
    end_time: string;
  }>(
    `SELECT ss.staff_id, ss.location_id, ss.start_time, ss.end_time
       FROM staff_schedules ss
       JOIN staff s ON s.id = ss.staff_id
      WHERE ss.day_of_week = $1
        AND s.is_bookable = true
        -- Sede: la del turno, o la del barbero; sin ninguna, atiende en todas
        AND ($2::uuid IS NULL OR COALESCE(ss.location_id, s.location_id) = $2 OR COALESCE(ss.location_id, s.location_id) IS NULL)
        AND ($3::uuid IS NULL OR ss.staff_id = $3)`,
    [dow, p.locationId ?? null, p.staffId ?? null],
  );
  if (schedules.rows.length === 0) return [];

  const staffIds = [...new Set(schedules.rows.map((r) => r.staff_id))];

  // Citas y bloqueos existentes de esos barberos para ese día.
  const dayStart = day.startOf('day').toUTC().toISO();
  const dayEnd = day.endOf('day').toUTC().toISO();

  const appts = await sql<{ staff_id: string; starts_at: string | Date; ends_at: string | Date }>(
    `SELECT staff_id, starts_at, ends_at FROM appointments
      WHERE staff_id = ANY($1) AND status <> 'cancelled'
        AND starts_at < $3 AND ends_at > $2
        AND ($4::uuid IS NULL OR id <> $4)`,
    [staffIds, dayStart, dayEnd, p.excludeAppointmentId ?? null],
  );
  const exceptions = await sql<{ staff_id: string; starts_at: string | Date; ends_at: string | Date }>(
    `SELECT staff_id, starts_at, ends_at FROM schedule_exceptions
      WHERE staff_id = ANY($1) AND starts_at < $3 AND ends_at > $2`,
    [staffIds, dayStart, dayEnd],
  );

  // pg devuelve timestamptz como Date; aceptamos Date o texto ISO.
  const toDT = (v: string | Date) => (v instanceof Date ? DateTime.fromJSDate(v) : DateTime.fromISO(v));
  const busyByStaff = new Map<string, Interval[]>();
  for (const row of [...appts.rows, ...exceptions.rows]) {
    const iv = Interval.fromDateTimes(toDT(row.starts_at), toDT(row.ends_at));
    if (!iv.isValid) continue;
    const list = busyByStaff.get(row.staff_id) ?? [];
    list.push(iv);
    busyByStaff.set(row.staff_id, list);
  }

  const now = DateTime.now();
  const step = Math.max(5, p.slotIntervalMin);
  const durationMs = p.durationMin * 60 * 1000;
  const slots: Slot[] = [];
  const seenStart = new Set<string>();

  // "Cualquiera disponible": ante empate, el barbero con menos citas ese día
  const load = new Map<string, number>();
  for (const r of appts.rows) load.set(r.staff_id, (load.get(r.staff_id) ?? 0) + 1);
  const ordered = p.staffId ? schedules.rows : [...schedules.rows].sort((a, b) => (load.get(a.staff_id) ?? 0) - (load.get(b.staff_id) ?? 0));

  for (const sch of ordered) {
    const [sh, sm] = sch.start_time.split(':').map(Number);
    const [eh, em] = sch.end_time.split(':').map(Number);
    let cursor = day.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const blockEnd = day.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    const busy = busyByStaff.get(sch.staff_id) ?? [];

    while (cursor.plus({ milliseconds: durationMs }) <= blockEnd) {
      const slotEnd = cursor.plus({ milliseconds: durationMs });
      const candidate = Interval.fromDateTimes(cursor, slotEnd);
      const overlaps = busy.some((b) => b.overlaps(candidate));
      if (!overlaps && cursor > now) {
        // Para "cualquiera disponible" evitamos duplicar la misma hora.
        const key = p.staffId ? `${sch.staff_id}|${cursor.toISO()}` : cursor.toISO()!;
        if (!seenStart.has(key)) {
          seenStart.add(key);
          slots.push({
            start: cursor.toUTC().toISO()!,
            end: slotEnd.toUTC().toISO()!,
            staffId: sch.staff_id,
          });
        }
      }
      cursor = cursor.plus({ minutes: step });
    }
  }

  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}
