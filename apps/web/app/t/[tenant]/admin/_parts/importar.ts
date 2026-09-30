/**
 * Lectura de planillas de clientes en el navegador (CSV y Excel .xlsx).
 * El archivo nunca sale del equipo: aquí se convierte en filas y solo se envían los datos mapeados.
 */

export type TargetField = 'name' | 'lastName' | 'phone' | 'email' | 'birthday' | 'notes' | 'tags' | 'visits' | 'lastVisit';

export interface Table {
  headers: string[];
  /** Filas de datos (sin la cabecera), ya sin filas vacías. */
  rows: string[][];
  /** Número de fila en la planilla original para cada fila de datos (1 = cabecera). */
  lines: number[];
}

export interface ImportRow {
  name?: string; phone?: string; email?: string; birthday?: string; notes?: string; tags?: string[]; visits?: number; lastVisit?: string;
}

export type Mapping = Record<TargetField, number | null>;

export const FIELDS: { id: TargetField; label: string; hint?: string }[] = [
  { id: 'name', label: 'Nombre' },
  { id: 'lastName', label: 'Apellido', hint: 'Se une al nombre.' },
  { id: 'phone', label: 'Celular', hint: 'Obligatorio. Con él reconocemos a cada cliente.' },
  { id: 'email', label: 'Correo' },
  { id: 'birthday', label: 'Cumpleaños' },
  { id: 'notes', label: 'Notas' },
  { id: 'tags', label: 'Etiquetas' },
  { id: 'visits', label: 'Visitas' },
  { id: 'lastVisit', label: 'Última visita' },
];

export const TEMPLATE_HEADERS = ['Nombre', 'Celular', 'Correo', 'Cumpleaños', 'Notas', 'Etiquetas', 'Visitas', 'Última visita'];

/* ---------------------------------- Lectura ---------------------------------- */

export const ACCEPT = '.csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ImportFileError extends Error {}

export async function readTable(file: File): Promise<Table> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  let grid: string[][];
  if (ext === 'xlsx') grid = await readXlsx(file);
  else if (ext === 'xls' || ext === 'numbers' || ext === 'ods') throw new ImportFileError('formato_antiguo');
  else grid = parseCsv(decodeText(await file.arrayBuffer()));

  const lines: number[] = [];
  const kept: string[][] = [];
  grid.forEach((r, i) => {
    if (r.some((c) => c.trim() !== '')) { kept.push(r); lines.push(i + 1); }
  });
  if (kept.length < 2) throw new ImportFileError('vacio');
  const width = Math.max(...kept.slice(0, 50).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => (kept[0][i] ?? '').trim() || `Columna ${i + 1}`);
  return { headers, rows: kept.slice(1), lines: lines.slice(1) };
}

async function readXlsx(file: File): Promise<string[][]> {
  const { readSheet } = await import('read-excel-file/browser');
  let data: unknown[][];
  try {
    data = (await readSheet(file)) as unknown as unknown[][];
  } catch {
    throw new ImportFileError('ilegible');
  }
  return data.map((row) => row.map(cellToString));
}

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  return String(v);
}

/** UTF-8 primero; si aparecen caracteres dañados es Latin-1 (Excel en Windows). */
export function decodeText(buf: ArrayBuffer): string {
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buf);
  return text.replace(/^\uFEFF/, '');
}

/** CSV con ; , o tabulador, campos entre comillas y saltos de línea dentro de comillas. */
export function parseCsv(text: string): string[][] {
  const delim = detectDelimiter(text);
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; }
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out;
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const count = (d: string) => {
    let n = 0; let q = false;
    for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch === d) n++; }
    return n;
  };
  const cands = [';', ',', '\t'].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1]);
  return cands[0][1] > 0 ? cands[0][0] : ',';
}

/* ---------------------------------- Columnas ---------------------------------- */

export const normHeader = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const EXACT: Record<TargetField, string[]> = {
  lastName: ['apellido', 'apellidos', 'last name', 'lastname', 'surname', 'family name', 'apellido paterno'],
  name: ['nombre', 'nombres', 'name', 'cliente', 'first name', 'firstname', 'given name', 'nombre completo', 'full name', 'customer', 'client', 'nombre del cliente', 'customer name', 'client name'],
  phone: ['celular', 'cel', 'telefono', 'telefonos', 'movil', 'phone', 'mobile', 'whatsapp', 'numero', 'mobile number', 'phone number', 'telefono movil', 'numero de celular', 'phone 1 value'],
  email: ['correo', 'email', 'e mail', 'mail', 'correo electronico', 'email address', 'e mail 1 value'],
  birthday: ['cumpleanos', 'fecha de nacimiento', 'nacimiento', 'birthday', 'date of birth', 'dob', 'birth date', 'birthdate', 'f nacimiento'],
  notes: ['notas', 'nota', 'notes', 'note', 'observaciones', 'observacion', 'comentarios', 'comments', 'comentario'],
  tags: ['etiquetas', 'etiqueta', 'tags', 'tag', 'labels', 'categoria', 'categorias'],
  visits: ['visitas', 'visits', 'citas', 'n visitas', 'numero de visitas', 'total visitas', 'total visits', 'total de visitas', 'appointments', 'total citas', 'reservas', 'total appointments', 'number of visits'],
  lastVisit: ['ultima visita', 'last visit', 'last appointment', 'ultima cita', 'fecha ultima visita', 'last booking', 'ultima reserva', 'last visit date', 'fecha de ultima visita'],
};

/** Palabras que alcanzan si aparecen dentro del encabezado (orden de prioridad). */
const CONTAINS: [TargetField, string[]][] = [
  ['lastVisit', ['ultima visita', 'last visit', 'ultima cita', 'last appointment', 'ultima reserva']],
  ['lastName', ['apellido', 'last name', 'surname']],
  ['birthday', ['nacimiento', 'cumple', 'birth']],
  ['phone', ['celular', 'telefono', 'movil', 'whatsapp', 'phone', 'mobile']],
  ['email', ['correo', 'email', 'e mail']],
  ['visits', ['visitas', 'visits']],
  ['notes', ['nota', 'observacion', 'comentario', 'notes']],
  ['tags', ['etiqueta', 'tags', 'label']],
  ['name', ['nombre', 'name', 'cliente']],
];

export function emptyMapping(): Mapping {
  return { name: null, lastName: null, phone: null, email: null, birthday: null, notes: null, tags: null, visits: null, lastVisit: null };
}

export function autoMap(headers: string[]): Mapping {
  const m = emptyMapping();
  const used = new Set<number>();
  const norm = headers.map(normHeader);
  for (const f of Object.keys(EXACT) as TargetField[]) {
    const i = norm.findIndex((h, j) => !used.has(j) && EXACT[f].includes(h));
    if (i >= 0) { m[f] = i; used.add(i); }
  }
  for (const [f, words] of CONTAINS) {
    if (m[f] !== null) continue;
    const i = norm.findIndex((h, j) => !used.has(j) && words.some((w) => h.includes(w)));
    if (i >= 0) { m[f] = i; used.add(i); }
  }
  return m;
}

/* ---------------------------------- Valores ---------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

function validYmd(y: number, mo: number, d: number): string | undefined {
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return undefined;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** DD/MM/AAAA, D/M/AA, AAAA-MM-DD, número de serie de Excel o fechas en inglés. */
export function parseDate(raw: string | undefined): string | undefined {
  const s = (raw ?? '').trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
  if (m) {
    let d = +m[1]; let mo = +m[2];
    // Exportaciones en formato de EE. UU. (mes primero): si el segundo número no puede ser mes, se invierte
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    let y = +m[3];
    if (m[3].length === 2) y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
    return validYmd(y, mo, d);
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n < 1 || n > 80000) return undefined;
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    return validYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  if (/[a-z]/i.test(s)) {
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return validYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return undefined;
}

export function parseVisits(raw: string | undefined): number | undefined {
  const s = (raw ?? '').trim();
  if (!/\d/.test(s)) return undefined;
  const n = Math.floor(Number(s.replace(',', '.').replace(/[^\d.]/g, '')));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100000) : undefined;
}

export function parseTags(raw: string | undefined): string[] | undefined {
  const out: string[] = [];
  for (const t of (raw ?? '').split(/[,;|]/)) {
    const v = t.trim().slice(0, 30);
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.length ? out.slice(0, 10) : undefined;
}

function cleanPhone(raw: string | undefined): string | undefined {
  let s = (raw ?? '').trim();
  if (!s) return undefined;
  // Excel a veces guarda el número como 5.19876E+10
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) s = Number(s).toFixed(0);
  return s.slice(0, 40);
}

const clip = (s: string | undefined, n: number) => {
  const v = (s ?? '').replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, n) : undefined;
};

export function mapRow(row: string[], m: Mapping): ImportRow {
  const get = (f: TargetField) => (m[f] === null ? undefined : row[m[f] as number]);
  const name = clip([get('name'), get('lastName')].filter(Boolean).join(' '), 120);
  const email = clip(get('email'), 160)?.toLowerCase();
  const notes = (get('notes') ?? '').trim().slice(0, 1000) || undefined;
  const out: ImportRow = {
    name, phone: cleanPhone(get('phone')), email, birthday: parseDate(get('birthday')), notes,
    tags: parseTags(get('tags')), visits: parseVisits(get('visits')), lastVisit: parseDate(get('lastVisit')),
  };
  for (const k of Object.keys(out) as (keyof ImportRow)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Misma regla que el servidor: últimos 9 dígitos si el número es válido en Perú. */
export function phoneKey(raw: string | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0051')) d = d.slice(2);
  if (d.length === 9 || (d.length === 11 && d.startsWith('51'))) return d.slice(-9);
  if (raw.trim().startsWith('+') && d.length >= 10 && d.length <= 15) return d;
  return null;
}

/* ---------------------------------- Plantilla ---------------------------------- */

export function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS,
    ['Juan Pérez', '987654321', 'juan@correo.com', '15/03/1994', 'Fade bajo, número 2', 'VIP', '12', '20/09/2026'],
  ];
  const csv = rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-clientes-datepe.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
