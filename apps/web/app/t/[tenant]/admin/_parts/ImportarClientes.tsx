'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, Download, UserPlus, UserCheck, CircleSlash, ChevronDown, CircleCheck, Lock } from 'lucide-react';
import { useApi } from './api';
import { Btn, Switch, inputCls } from './ui';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import {
  ACCEPT, FIELDS, ImportFileError, autoMap, downloadTemplate, mapRow, phoneKey, readTable,
  type ImportRow, type Mapping, type Table, type TargetField,
} from './importar';

/** Hash que abre el importador al entrar (lo usa la guía de primeros pasos). */
export const IMPORT_HASHES = ['#clientes?importar', '#clientes-importar'];

type Step = 'archivo' | 'columnas' | 'permiso' | 'revision' | 'importando' | 'listo';
type Reason = 'sin_celular' | 'celular_invalido' | 'repetido_en_archivo';
interface ApiResult { total: number; created: number; updated: number; skipped: { row: number; reason: Reason; value?: string }[]; dryRun: boolean }
interface Chunk { rows: ImportRow[]; lines: number[] }
interface Summary { created: number; updated: number; skipped: { line: number; reason: Reason; value?: string }[] }

const CHUNK = 1000;
const STEP_NO: Partial<Record<Step, number>> = { archivo: 1, columnas: 2, permiso: 3, revision: 4 };
const FILE_ERRORS: Record<string, string> = {
  formato_antiguo: 'Ese formato no se puede leer aquí. Ábrelo en Excel y guárdalo como .xlsx o .csv.',
  vacio: 'El archivo no tiene filas de clientes.',
  ilegible: 'No pudimos leer el archivo. Prueba guardarlo de nuevo como .xlsx o .csv.',
};

const reasonText = (r: Reason, value?: string) =>
  r === 'sin_celular' ? 'Sin celular' : r === 'celular_invalido' ? `Celular no válido${value ? `: ${value}` : ''}` : 'Repetido en el archivo';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-PE')} ${n === 1 ? one : many}`;

/** Agrupa por celular para que los repetidos caigan en el mismo envío y el servidor los junte. */
function buildChunks(table: Table, m: Mapping): Chunk[] {
  const groups = new Map<string, { row: ImportRow; line: number }[]>();
  table.rows.forEach((r, i) => {
    const row = mapRow(r, m);
    const key = phoneKey(row.phone) ?? `sin-${i}`;
    const g = groups.get(key);
    const item = { row, line: table.lines[i] };
    if (g) g.push(item); else groups.set(key, [item]);
  });
  const chunks: Chunk[] = [];
  let cur: Chunk = { rows: [], lines: [] };
  for (const g of groups.values()) {
    if (cur.rows.length && cur.rows.length + g.length > CHUNK) { chunks.push(cur); cur = { rows: [], lines: [] }; }
    for (const it of g) { cur.rows.push(it.row); cur.lines.push(it.line); }
  }
  if (cur.rows.length) chunks.push(cur);
  return chunks;
}

export function ImportarClientes({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const api = useApi();
  const [step, setStep] = useState<Step>('archivo');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [optIn, setOptIn] = useState(false);
  const [reading, setReading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [progress, setProgress] = useState(0);
  const [showSkipped, setShowSkipped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep('archivo'); setFileName(''); setTable(null); setMapping(null); setOptIn(false);
    setReview(null); setResult(null); setProgress(0); setShowSkipped(false); setDragging(false);
  }, [open]);

  const chunks = useMemo(() => (table && mapping ? buildChunks(table, mapping) : []), [table, mapping]);
  const preview = useMemo(() => (table && mapping ? table.rows.slice(0, 5).map((r) => mapRow(r, mapping)) : []), [table, mapping]);

  async function onFile(file: File) {
    setReading(true);
    try {
      const t = await readTable(file);
      if (t.rows.length > 20000) { toast.error('El archivo tiene más de 20 000 filas. Divídelo en partes.'); return; }
      setTable(t);
      setMapping(autoMap(t.headers));
      setFileName(file.name);
      haptic.success();
      setStep('columnas');
    } catch (e) {
      toast.error(e instanceof ImportFileError ? FILE_ERRORS[e.message] ?? FILE_ERRORS.ilegible : FILE_ERRORS.ilegible);
    } finally {
      setReading(false);
    }
  }

  /** Envía todos los tramos y suma los resultados; las filas omitidas vuelven con su número en la planilla. */
  async function send(dryRun: boolean): Promise<Summary> {
    const sum: Summary = { created: 0, updated: 0, skipped: [] };
    let done = 0;
    for (const c of chunks) {
      const r = await api<ApiResult>('/admin/clients/import', { method: 'POST', body: { rows: c.rows, marketingOptIn: optIn, dryRun } });
      sum.created += r.created;
      sum.updated += r.updated;
      for (const s of r.skipped) sum.skipped.push({ line: c.lines[s.row - 1] ?? s.row, reason: s.reason, value: s.value });
      done += c.rows.length;
      if (!dryRun) setProgress(done / Math.max(1, table?.rows.length ?? 1));
    }
    sum.skipped.sort((a, b) => a.line - b.line);
    return sum;
  }

  function failMsg(e: unknown) {
    const status = (e as { status?: number }).status;
    return status === 403 ? 'No tienes permiso para importar clientes.' : status === 400 ? 'Hay datos que no pudimos leer. Revisa las columnas elegidas.' : 'No se pudo conectar. Intenta de nuevo.';
  }

  async function toReview() {
    setChecking(true);
    try {
      setReview(await send(true));
      setShowSkipped(false);
      setStep('revision');
    } catch (e) {
      toast.error(failMsg(e));
    } finally {
      setChecking(false);
    }
  }

  async function runImport() {
    setProgress(0);
    setStep('importando');
    try {
      const r = await send(false);
      setResult(r);
      setStep('listo');
      haptic.success();
      onDone();
    } catch (e) {
      toast.error(`${failMsg(e)} Lo que ya se importó queda guardado; puedes volver a intentarlo sin duplicar.`);
      setStep('revision');
    }
  }

  const close = () => { if (step !== 'importando') onClose(); };
  const no = STEP_NO[step];

  const footer = (() => {
    switch (step) {
      case 'archivo':
        return <Btn variant="ghost" onClick={close}>Cancelar</Btn>;
      case 'columnas':
        return <><Btn variant="ghost" onClick={() => setStep('archivo')}>Atrás</Btn><Btn onClick={() => setStep('permiso')} disabled={mapping?.phone == null}>Continuar</Btn></>;
      case 'permiso':
        return <><Btn variant="ghost" onClick={() => setStep('columnas')}>Atrás</Btn><Btn onClick={toReview} busy={checking}>Revisar</Btn></>;
      case 'revision':
        return <><Btn variant="ghost" onClick={() => setStep('permiso')}>Atrás</Btn><Btn onClick={runImport} disabled={!review || review.created + review.updated === 0}>Importar clientes</Btn></>;
      case 'importando':
        return <Btn disabled busy>Importando</Btn>;
      case 'listo':
        return <Btn onClick={onClose}>Ver mis clientes</Btn>;
    }
  })();

  return (
    <Sheet open={open} onClose={close} full title="Importar clientes" footer={footer}>
      <div className="min-w-0 space-y-6">
        {no && <p className="text-[13px] font-medium text-soft">Paso {no} de 4</p>}

        {/* 1. Archivo */}
        {step === 'archivo' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-[19px] font-semibold tracking-[-0.02em]">Elige tu archivo</h3>
              <p className="mt-1 text-[15px] text-mute">Sirve la exportación de AgendaPro, Booksy, Fresha, Google Contactos o tu propio Excel.</p>
            </div>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
              disabled={reading}
              className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center transition-colors ${dragging ? 'border-ink bg-field' : 'border-line-2 hover:border-ink'}`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-field">
                {reading ? <Upload size={22} strokeWidth={1.5} className="animate-pulse" /> : <FileSpreadsheet size={22} strokeWidth={1.5} />}
              </span>
              <span className="text-[16px] font-medium">{reading ? 'Leyendo archivo' : 'Toca para elegir un archivo'}</span>
              <span className="hidden text-[14px] text-mute md:block">o arrástralo aquí</span>
              <span className="text-[13px] text-soft">Excel (.xlsx) o CSV</span>
            </button>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={downloadTemplate} className="inline-flex min-h-11 items-center gap-2 text-[14px] font-medium underline-offset-4 hover:underline">
                <Download size={16} strokeWidth={1.75} /> Descargar plantilla
              </button>
              <p className="flex items-center gap-1.5 text-[13px] text-soft"><Lock size={13} strokeWidth={1.75} /> El archivo se lee en tu equipo, no se sube.</p>
            </div>
          </div>
        )}

        {/* 2. Columnas */}
        {step === 'columnas' && table && mapping && (
          <div className="space-y-5">
            <div>
              <h3 className="text-[19px] font-semibold tracking-[-0.02em]">Revisa las columnas</h3>
              <p className="mt-1 break-words text-[15px] text-mute">
                {fileName}, {plural(table.rows.length, 'fila', 'filas')}. Ya elegimos las que reconocimos; cambia lo que haga falta.
              </p>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {FIELDS.map((f) => (
                <FieldMap key={f.id} field={f} table={table} value={mapping[f.id]} onChange={(v) => setMapping({ ...mapping, [f.id]: v })} />
              ))}
            </div>
            {mapping.phone == null && (
              <p className="rounded-xl bg-[#fff4e0] px-4 py-3 text-[14px] text-[#8a5300]">Elige la columna del celular para continuar.</p>
            )}
            <div className="min-w-0">
              <p className="mb-2 text-[14px] font-medium">Así se verán los primeros clientes</p>
              <Preview rows={preview} mapping={mapping} />
            </div>
          </div>
        )}

        {/* 3. Permiso */}
        {step === 'permiso' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-[19px] font-semibold tracking-[-0.02em]">Promociones</h3>
              <p className="mt-1 text-[15px] text-mute">La ley pide permiso para enviar publicidad. Los recordatorios de citas no la necesitan.</p>
            </div>
            <div className="flex items-center justify-between gap-4 border-y border-line py-4">
              <div className="min-w-0">
                <p className="text-[15px] font-medium">Estos clientes aceptaron recibir promociones</p>
                <p className="text-[14px] text-mute">Si no estás seguro, déjalo apagado. Igual recibirán sus recordatorios de citas.</p>
              </div>
              <Switch checked={optIn} onChange={(v) => { haptic.select(); setOptIn(v); }} label="Estos clientes aceptaron recibir promociones" states={['Sí', 'No']} />
            </div>
            <p className="text-[14px] text-soft">Solo se aplica a los clientes nuevos. Los que ya tenías conservan su preferencia.</p>
          </div>
        )}

        {/* 4. Revisión */}
        {step === 'revision' && review && (
          <div className="space-y-5">
            <div>
              <h3 className="text-[19px] font-semibold tracking-[-0.02em]">Todo listo para importar</h3>
              <p className="mt-1 text-[15px] text-mute">Nunca borramos ni cambiamos lo que ya tenías: solo completamos los datos que faltan.</p>
            </div>
            <ul className="divide-y divide-line border-y border-line">
              <SummaryRow icon={UserPlus} text={`${review.created === 1 ? 'Se creará' : 'Se crearán'} ${plural(review.created, 'cliente nuevo', 'clientes nuevos')}`} />
              <SummaryRow icon={UserCheck} text={`${review.updated === 1 ? 'Se completará' : 'Se completarán'} ${plural(review.updated, 'cliente que ya tenías', 'clientes que ya tenías')}`} />
              <SummaryRow icon={CircleSlash} text={`${review.skipped.length === 1 ? 'Se omitirá' : 'Se omitirán'} ${plural(review.skipped.length, 'fila', 'filas')}`} muted={review.skipped.length === 0} />
            </ul>
            {review.skipped.length > 0 && <Skipped list={review.skipped} open={showSkipped} onToggle={() => setShowSkipped(!showSkipped)} />}
            {review.created + review.updated === 0 && (
              <p className="rounded-xl bg-[#fff4e0] px-4 py-3 text-[14px] text-[#8a5300]">No encontramos celulares válidos. Revisa que elegiste la columna correcta.</p>
            )}
          </div>
        )}

        {/* Importando */}
        {step === 'importando' && (
          <div className="space-y-4 py-6">
            <h3 className="text-[19px] font-semibold tracking-[-0.02em]">Importando clientes</h3>
            <div className="h-2 overflow-hidden rounded-full bg-field" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} />
            </div>
            <p className="tnum text-[14px] text-mute">{Math.round(progress * 100)}%. No cierres esta ventana.</p>
          </div>
        )}

        {/* Listo */}
        {step === 'listo' && result && (
          <div className="space-y-5 py-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-tint text-ok"><CircleCheck size={24} strokeWidth={1.75} /></span>
            <div>
              <h3 className="text-[22px] font-semibold tracking-[-0.03em]">Clientes importados</h3>
              <p className="mt-1 text-[15px] text-mute">
                {plural(result.created, 'cliente nuevo', 'clientes nuevos')} y {plural(result.updated, 'ficha completada', 'fichas completadas')}.
                {' '}Sus visitas anteriores quedan como historial.
              </p>
            </div>
            {result.skipped.length > 0 && <Skipped list={result.skipped} open={showSkipped} onToggle={() => setShowSkipped(!showSkipped)} />}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function FieldMap({ field, table, value, onChange }: { field: (typeof FIELDS)[number]; table: Table; value: number | null; onChange: (v: number | null) => void }) {
  const sample = (i: number) => table.rows.slice(0, 20).map((r) => (r[i] ?? '').trim()).find(Boolean);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{field.label}{field.id === 'phone' && <span className="text-red"> *</span>}</p>
        {field.hint && <p className="text-[13px] text-soft">{field.hint}</p>}
      </div>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        aria-label={`Columna para ${field.label}`}
        className={`min-w-0 truncate ${inputCls} ${value == null ? 'text-soft' : ''}`}
      >
        <option value="">No importar</option>
        {table.headers.map((h, i) => {
          const s = sample(i);
          return <option key={i} value={i}>{h}{s ? ` (${s.length > 24 ? `${s.slice(0, 24)}...` : s})` : ''}</option>;
        })}
      </select>
    </div>
  );
}

const PREVIEW_COLS: [keyof ImportRow, string, TargetField[]][] = [
  ['name', 'Nombre', ['name', 'lastName']],
  ['phone', 'Celular', ['phone']],
  ['email', 'Correo', ['email']],
  ['birthday', 'Cumpleaños', ['birthday']],
  ['visits', 'Visitas', ['visits']],
  ['lastVisit', 'Última visita', ['lastVisit']],
  ['tags', 'Etiquetas', ['tags']],
  ['notes', 'Notas', ['notes']],
];

const ymd = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

function Preview({ rows, mapping }: { rows: ImportRow[]; mapping: Mapping }) {
  const cols = PREVIEW_COLS.filter(([, , fs]) => fs.some((f) => mapping[f] != null));
  if (!cols.length) return <p className="rounded-xl border border-dashed border-line-2 p-4 text-[14px] text-mute">Elige al menos una columna para ver cómo quedan.</p>;
  const show = (r: ImportRow, k: keyof ImportRow) => {
    const v = r[k];
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (k === 'birthday' || k === 'lastVisit') return ymd(String(v));
    return String(v);
  };
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-max text-left text-[14px]">
        <thead>
          <tr className="border-b border-line bg-field text-[13px] text-mute">
            {cols.map(([k, label]) => <th key={k} className="whitespace-nowrap px-3 py-2 font-medium">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {cols.map(([k]) => {
                const v = show(r, k);
                return (
                  <td key={k} className={`max-w-[220px] truncate whitespace-nowrap px-3 py-2 ${k === 'phone' || k === 'visits' ? 'tnum' : ''} ${v ? '' : 'text-soft'}`}>
                    {v || (k === 'phone' ? 'Falta' : 'Vacío')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({ icon: Icon, text, muted }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; text: string; muted?: boolean }) {
  return (
    <li className={`flex items-center gap-3 py-3.5 text-[16px] ${muted ? 'text-mute' : 'font-medium'}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field"><Icon size={18} strokeWidth={1.75} /></span>
      <span className="tnum min-w-0">{text}</span>
    </li>
  );
}

function Skipped({ list, open, onToggle }: { list: Summary['skipped']; open: boolean; onToggle: () => void }) {
  const MAX = 300;
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-medium">
        {open ? 'Ocultar filas omitidas' : 'Ver filas omitidas'}
        <ChevronDown size={16} strokeWidth={1.75} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-1 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {list.slice(0, MAX).map((s, i) => (
            <li key={i} className="flex items-baseline gap-3 px-4 py-2.5 text-[14px]">
              <span className="tnum w-16 shrink-0 text-soft">Fila {s.line}</span>
              <span className="min-w-0 break-words">{reasonText(s.reason, s.value)}</span>
            </li>
          ))}
          {list.length > MAX && <li className="px-4 py-2.5 text-[14px] text-mute">Y {plural(list.length - MAX, 'fila más', 'filas más')}.</li>}
        </ul>
      )}
    </div>
  );
}
