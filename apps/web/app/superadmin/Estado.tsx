'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Server, ShieldCheck, Clock, HardDrive, Database, Archive, Bell, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Info, ChevronDown, Mail } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { Card, Pill, TONES, ago, fechaHora, minutesSince, type Tone } from './ui';

interface Check {
  id: string;
  label: string;
  url: string;
  up: boolean;
  fails: number;
  error: string | null;
  ms: number | null;
  lastOkAt: string | null;
  downSince: string | null;
}
interface Backup {
  id: string;
  status: 'running' | 'ok' | 'failed';
  object_key: string | null;
  size_bytes: number | string | null;
  error: string | null;
  verify_note: string | null;
  verified_at: string | null;
  started_at: string;
  finished_at: string | null;
  deleted_at: string | null;
}
interface Alert {
  id: string;
  kind: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  detail: string | null;
  emailed: boolean;
  created_at: string;
}
interface Status {
  watchdog: { at: string; checks: Check[]; certs: Record<string, number | null>; updatedAt: string } | null;
  schedulerAt: string | null;
  backupsConfigured: boolean;
  backups: Backup[];
  alerts: Alert[];
  dbSize: string | null;
  disk: { totalGb: number; freeGb: number; usedPct: number } | null;
}

const BACKUP_STATUS: Record<Backup['status'], [string, Tone]> = {
  ok: ['Correcto', 'ok'],
  running: ['En curso', 'warn'],
  failed: ['Falló', 'bad'],
};
const ALERT_LEVEL: Record<Alert['level'], [string, Tone]> = {
  error: ['Falla', 'bad'],
  warn: ['Atención', 'warn'],
  info: ['Info', 'mute'],
};

const mb = (b: number | string | null) => (b == null ? null : `${(Number(b) / 1048576).toFixed(1)} MB`);
const fmtMin = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} días`);

/** Lo que hay que revisar, en palabras simples. */
function issuesOf(s: Status): { text: string; tone: Tone }[] {
  const out: { text: string; tone: Tone }[] = [];
  if (!s.watchdog) out.push({ text: 'El vigía todavía no reporta.', tone: 'warn' });
  else {
    const stale = minutesSince(s.watchdog.updatedAt);
    if (stale > 10) out.push({ text: `El vigía no reporta hace ${fmtMin(stale)}.`, tone: 'warn' });
    for (const c of s.watchdog.checks) if (!c.up) out.push({ text: `${c.label} no responde.`, tone: 'bad' });
    for (const [host, days] of Object.entries(s.watchdog.certs ?? {})) {
      if (days == null) out.push({ text: `No se pudo leer el certificado de ${host}.`, tone: 'warn' });
      else if (days < 14) out.push({ text: `El certificado de ${host} vence en ${days} ${days === 1 ? 'día' : 'días'}.`, tone: days < 5 ? 'bad' : 'warn' });
    }
  }
  const sched = minutesSince(s.schedulerAt);
  if (sched >= 15) out.push({ text: s.schedulerAt ? `El planificador no corre hace ${fmtMin(sched)}.` : 'El planificador nunca corrió.', tone: 'bad' });
  if (!s.backupsConfigured) out.push({ text: 'Los respaldos no están configurados.', tone: 'bad' });
  else {
    const lastOk = s.backups.find((b) => b.status === 'ok' && !b.deleted_at);
    if (!lastOk || minutesSince(lastOk.finished_at ?? lastOk.started_at) > 26 * 60) out.push({ text: 'No hay un respaldo correcto en las últimas 26 horas.', tone: 'bad' });
  }
  if (s.disk && s.disk.usedPct >= 90) out.push({ text: `El disco del servidor está al ${Math.round(s.disk.usedPct)}%.`, tone: s.disk.usedPct >= 95 ? 'bad' : 'warn' });
  return out;
}

/** Salud de la plataforma: servicios, certificados, planificador, disco, respaldos y alertas. */
export function Estado({ headers }: { headers: Record<string, string> }) {
  const [data, setData] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_CLIENT}/api/platform/status`, { headers });
      if (!r.ok) throw new Error();
      setData(await r.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [headers]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30_000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  async function runBackup() {
    haptic.tap();
    setRunning(true);
    try {
      const r = await fetch(`${API_BASE_CLIENT}/api/platform/backups/run`, { method: 'POST', headers, body: '{}' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        haptic.success();
        toast.success('Respaldo listo y verificado');
      } else if (r.status === 409) toast.info('Ya hay un respaldo en curso. Espera unos segundos.');
      else toast.error(d.error ? `No se pudo respaldar: ${d.error}` : 'No se pudo respaldar.');
    } catch {
      toast.error('No se pudo respaldar.');
    } finally {
      setRunning(false);
      load();
    }
  }

  if (!data) {
    return failed ? (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-2 p-8 text-mute">
        <AlertTriangle size={20} strokeWidth={1.5} /> No se pudo cargar el estado.
        <button type="button" onClick={load} className="rounded-full border border-line px-4 py-2 text-[14px] font-medium text-ink hover:border-ink">Reintentar</button>
      </div>
    ) : (
      <div className="mt-6 h-40 animate-pulse rounded-xl bg-field" />
    );
  }

  const issues = issuesOf(data);
  const allOk = issues.length === 0;
  const worst: Tone = issues.some((i) => i.tone === 'bad') ? 'bad' : 'warn';
  const wd = data.watchdog;
  const wdStale = wd ? minutesSince(wd.updatedAt) : Infinity;
  const sched = minutesSince(data.schedulerAt);
  const lastOk = data.backups.find((b) => b.status === 'ok' && !b.deleted_at) ?? null;
  const lastOkAt = lastOk ? lastOk.finished_at ?? lastOk.started_at : null;
  const backupStale = minutesSince(lastOkAt) > 26 * 60;
  const disk = data.disk;
  const diskTone: Tone = !disk ? 'mute' : disk.usedPct >= 95 ? 'bad' : disk.usedPct >= 90 ? 'warn' : 'ok';
  const certs = Object.entries(wd?.certs ?? {});

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3">
      {/* Resumen en un vistazo */}
      <section className={`min-w-0 rounded-xl p-5 md:p-6 ${allOk ? TONES.ok : TONES[worst]}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {allOk ? <CheckCircle2 size={28} strokeWidth={1.75} className="mt-0.5 shrink-0" /> : <AlertTriangle size={28} strokeWidth={1.75} className="mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className="text-[22px] font-semibold tracking-[-0.03em]">{allOk ? 'Todo funciona' : issues.length === 1 ? 'Hay 1 cosa por revisar' : `Hay ${issues.length} cosas por revisar`}</p>
              {allOk ? (
                <p className="mt-1 text-[14px] opacity-80">Servicios arriba, planificador al día, respaldo reciente y disco con espacio.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-[15px]">
                  {issues.map((i) => (
                    <li key={i.text} className="break-words">{i.text}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button type="button" onClick={() => { haptic.tap(); load(); }} aria-label="Actualizar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/60">
            <RefreshCw size={17} strokeWidth={1.75} />
          </button>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 lg:grid-cols-3">
        {/* Servicios */}
        <Card title="Servicios" icon={Server} className="md:col-span-2 lg:col-span-2" right={wd ? <span className="shrink-0 text-[12px] text-soft">Revisado {ago(wd.updatedAt)}</span> : undefined}>
          {!wd ? (
            <p className="text-[14px] text-mute">El vigía todavía no envió ninguna revisión.</p>
          ) : (
            <>
              {wdStale > 10 && <p className={`mb-3 rounded-lg px-3 py-2 text-[14px] ${TONES.warn}`}>El vigía no reporta hace {fmtMin(wdStale)}.</p>}
              <ul className="divide-y divide-line">
                {wd.checks.map((c) => (
                  <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.label}</p>
                        <p className="truncate text-[13px] text-soft">{c.url.replace(/^https?:\/\//, '')}</p>
                      </div>
                      <Pill label={c.up ? 'Funciona' : 'Caído'} tone={c.up ? 'ok' : 'bad'} />
                    </div>
                    <p className="tnum mt-1 text-[13px] text-mute">
                      {c.ms != null ? `${c.ms} ms, ` : ''}
                      {c.up ? `bien ${ago(c.lastOkAt)}` : `caído desde ${c.downSince ? ago(c.downSince) : 'hace poco'}, ${c.fails} ${c.fails === 1 ? 'fallo' : 'fallos'} seguidos`}
                    </p>
                    {!c.up && c.error && <p className="mt-1 break-words text-[13px] text-red-deep">{c.error}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Certificados */}
        <Card title="Certificados HTTPS" icon={ShieldCheck}>
          {certs.length === 0 ? (
            <p className="text-[14px] text-mute">Sin datos todavía.</p>
          ) : (
            <ul className="space-y-2.5">
              {certs.map(([host, days]) => (
                <li key={host} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[14px]">{host}</span>
                  <Pill label={days == null ? 'Sin leer' : `${days} ${days === 1 ? 'día' : 'días'}`} tone={days == null ? 'warn' : days < 5 ? 'bad' : days < 14 ? 'warn' : 'ok'} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Planificador */}
        <Card title="Planificador" icon={Clock} right={<Pill label={sched < 15 ? 'Al día' : 'Detenido'} tone={sched < 15 ? 'ok' : 'bad'} />}>
          <p className="text-[28px] font-semibold leading-none tracking-[-0.03em]">{data.schedulerAt ? ago(data.schedulerAt) : 'Nunca'}</p>
          <p className="mt-2 text-[13px] text-soft">Última vuelta de las tareas automáticas: recordatorios, avisos y cierres.</p>
        </Card>

        {/* Disco */}
        <Card title="Disco del servidor" icon={HardDrive} right={disk ? <Pill label={diskTone === 'ok' ? 'Con espacio' : diskTone === 'warn' ? 'Casi lleno' : 'Crítico'} tone={diskTone} /> : undefined}>
          {!disk ? (
            <p className="text-[14px] text-mute">No se pudo leer el disco.</p>
          ) : (
            <>
              <p className="tnum text-[28px] font-semibold leading-none tracking-[-0.03em]">{Math.round(disk.usedPct)}%</p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-field" role="meter" aria-valuenow={Math.round(disk.usedPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Uso del disco">
                <div className={`h-full rounded-full ${diskTone === 'bad' ? 'bg-red' : diskTone === 'warn' ? 'bg-[#c27400]' : 'bg-ok'}`} style={{ width: `${Math.min(100, Math.max(0, disk.usedPct))}%` }} />
              </div>
              <p className="tnum mt-2 text-[13px] text-soft">
                {disk.freeGb.toFixed(1)} GB libres de {disk.totalGb.toFixed(1)} GB
              </p>
              {disk.usedPct >= 90 && <p className={`mt-3 rounded-lg px-3 py-2 text-[14px] ${TONES[diskTone]}`}>Si el disco se llena, la base de datos deja de guardar citas y ventas.</p>}
            </>
          )}
        </Card>

        {/* Base de datos */}
        <Card title="Base de datos" icon={Database}>
          <p className="tnum text-[28px] font-semibold leading-none tracking-[-0.03em]">{data.dbSize ?? 'Sin dato'}</p>
          <p className="mt-2 text-[13px] text-soft">Tamaño total de la base de datos.</p>
        </Card>
      </div>

      {/* Respaldos */}
      <Card
        title="Respaldos"
        icon={Archive}
        right={
          <button type="button" onClick={runBackup} disabled={running || !data.backupsConfigured} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink-2 disabled:opacity-40">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} strokeWidth={1.75} />} {running ? 'Respaldando' : 'Respaldar ahora'}
          </button>
        }
      >
        {!data.backupsConfigured && <p className={`mb-4 rounded-lg px-3 py-2 text-[14px] ${TONES.bad}`}>Los respaldos no están configurados en el servidor. Revisa las variables de R2 y la clave de cifrado.</p>}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl bg-field p-4">
            <p className="text-[14px] text-mute">Último respaldo correcto</p>
            <p className={`mt-1 text-[22px] font-semibold tracking-[-0.03em] ${backupStale ? 'text-red-deep' : ''}`}>{lastOkAt ? ago(lastOkAt) : 'Ninguno'}</p>
            {lastOk && <p className="tnum mt-1 text-[13px] text-soft">{fechaHora(lastOkAt!)}{mb(lastOk.size_bytes) ? `, ${mb(lastOk.size_bytes)}` : ''}</p>}
          </div>
          <div className="min-w-0 rounded-xl bg-field p-4">
            <p className="text-[14px] text-mute">Prueba de restauración</p>
            <p className="mt-1 break-words text-[14px]">{lastOk?.verify_note ?? 'Sin prueba registrada.'}</p>
            {lastOk?.verified_at && <p className="mt-1 text-[13px] text-soft">{ago(lastOk.verified_at)}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-line p-4 text-[14px] text-mute">
          <Info size={17} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <p>
            Cada día a las 3 am (Lima) se respalda la base de datos cifrada en Cloudflare R2 y se guarda 30 días; cada respaldo se restaura en prueba para confirmar que sirve. Para restaurar, sigue los pasos de docs/operacion.md.
          </p>
        </div>
        {data.backups.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {data.backups.slice(0, 14).map((b) => (
              <li key={b.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <p className="tnum text-[14px] font-medium">{fechaHora(b.started_at)}</p>
                  <p className="tnum text-[13px] text-soft">
                    {mb(b.size_bytes) ?? 'Sin tamaño'}
                    {b.deleted_at ? ', borrado' : ''}
                  </p>
                  {b.status === 'failed' && b.error && <p className="mt-1 break-words text-[13px] text-red-deep">{b.error}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {b.deleted_at && <Pill label="Borrado" tone="mute" />}
                  <Pill label={BACKUP_STATUS[b.status][0]} tone={BACKUP_STATUS[b.status][1]} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Alertas */}
      <Card title="Alertas recientes" icon={Bell}>
        {data.alerts.length === 0 ? (
          <p className="flex items-center gap-2 text-[14px] text-mute"><Activity size={16} strokeWidth={1.75} /> Sin alertas. Cuando algo falle aparecerá aquí y te llegará por correo.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.alerts.map((a) => (
              <AlertRow key={a.id} a={a} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AlertRow({ a }: { a: Alert }) {
  const [open, setOpen] = useState(false);
  const [label, tone] = ALERT_LEVEL[a.level] ?? ALERT_LEVEL.info;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <button type="button" onClick={() => a.detail && setOpen((o) => !o)} className={`flex w-full items-start gap-3 text-left ${a.detail ? '' : 'cursor-default'}`} aria-expanded={a.detail ? open : undefined}>
        <Pill label={label} tone={tone} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[15px]">{a.message}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-soft">
            <span>{ago(a.created_at)}</span>
            <span className="inline-flex items-center gap-1">
              <Mail size={13} strokeWidth={1.75} /> {a.emailed ? 'Enviada por correo' : 'Sin correo'}
            </span>
          </p>
        </div>
        {a.detail && <ChevronDown size={17} strokeWidth={1.75} className={`mt-0.5 shrink-0 text-soft transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && a.detail && (
        <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-field p-3 text-[12px] leading-relaxed text-ink-2">{a.detail}</pre>
      )}
    </li>
  );
}
