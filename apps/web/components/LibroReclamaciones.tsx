'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, CircleCheck, Loader2, MailCheck, Printer, Scale, ShieldCheck } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { onColor } from '@/lib/color';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

interface Info {
  provider: { tradeName: string; legalName: string; ruc: string | null; address: string | null; email: string | null };
  locations: { id: string; name: string; address: string | null; district: string | null }[];
  platform: boolean;
}
type Kind = 'reclamo' | 'queja';
type DocType = 'DNI' | 'CE' | 'Pasaporte' | 'RUC';
type ItemType = 'servicio' | 'producto';
interface Form {
  kind: Kind;
  consumerName: string;
  docType: DocType;
  docNumber: string;
  address: string;
  phone: string;
  email: string;
  isMinor: boolean;
  guardianName: string;
  itemType: ItemType;
  amount: string;
  itemDescription: string;
  detail: string;
  request: string;
  locationId: string;
  acceptTruth: boolean;
}
type FieldKey = keyof Form;
type Errors = Partial<Record<FieldKey, string>>;
interface Done { code: string; dueAt: string; createdAt: string; sent: Form }

const TZ = 'America/Lima';
const DOC_TYPES: DocType[] = ['DNI', 'CE', 'Pasaporte', 'RUC'];
const DOC_LABEL: Record<DocType, string> = { DNI: 'DNI', CE: 'Carné de extranjería', Pasaporte: 'Pasaporte', RUC: 'RUC' };
const EMPTY: Form = {
  kind: 'reclamo', consumerName: '', docType: 'DNI', docNumber: '', address: '', phone: '', email: '', isMinor: false, guardianName: '',
  itemType: 'servicio', amount: '', itemDescription: '', detail: '', request: '', locationId: '', acceptTruth: false,
};

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('es-PE', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString('es-PE', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
const toCents = (v: string): number | null => {
  const n = Number(v.replace(',', '.').trim());
  return v.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

function validate(f: Form, needLocation: boolean): Errors {
  const e: Errors = {};
  if (f.consumerName.trim().length < 3) e.consumerName = 'Escribe tu nombre completo';
  const doc = f.docNumber.trim();
  if (f.docType === 'DNI' && !/^\d{8}$/.test(doc)) e.docNumber = 'El DNI tiene 8 dígitos';
  else if (f.docType === 'RUC' && !/^\d{11}$/.test(doc)) e.docNumber = 'El RUC tiene 11 dígitos';
  else if (doc.length < 6 || doc.length > 20) e.docNumber = 'Revisa el número de documento';
  if (!isEmail(f.email)) e.email = 'Escribe un correo válido, ahí te llegará la constancia';
  if (f.phone.trim().length > 20) e.phone = 'Revisa el teléfono';
  if (f.isMinor && f.guardianName.trim().length < 3) e.guardianName = 'Falta el nombre del padre, madre o apoderado';
  if (f.amount.trim() && toCents(f.amount) == null) e.amount = 'Escribe solo el monto, por ejemplo 35.00';
  if (f.itemDescription.trim().length < 2) e.itemDescription = 'Describe el servicio o producto';
  if (f.detail.trim().length < 10) e.detail = 'Cuéntanos con más detalle lo que pasó (mínimo 10 caracteres)';
  if (f.request.trim().length < 3) e.request = 'Indica qué solicitas';
  if (needLocation && !f.locationId) e.locationId = 'Elige el local';
  if (!f.acceptTruth) e.acceptTruth = 'Debes marcar esta declaración para enviar';
  return e;
}

export function LibroReclamaciones({ tenantSlug, accent = '#0a0a0a' }: { tenantSlug?: string | null; accent?: string }) {
  const headers = useMemo<Record<string, string>>(
    () => ({ 'Content-Type': 'application/json', ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}) }),
    [tenantSlug],
  );
  const onAccent = onColor(accent);
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [today, setToday] = useState('');

  useEffect(() => {
    setToday(fmtDate(new Date()));
    fetch(`${API_BASE_CLIENT}/api/public/complaints/info`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Info) => setInfo(d))
      .catch(() => setLoadError(true));
  }, [headers]);

  const needLocation = (info?.locations.length ?? 0) > 1;

  function set<K extends FieldKey>(k: K, v: Form[K]) {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  }

  function focusFirst(e: Errors) {
    const first = (Object.keys(e) as FieldKey[])[0];
    if (!first) return;
    const el = document.querySelector<HTMLElement>(`[data-field="${first}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true });
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate(f, needLocation);
    setErrors(e);
    if (Object.keys(e).length) {
      haptic.error();
      focusFirst(e);
      return;
    }
    setBusy(true);
    const clean = (v: string) => (v.trim() ? v.trim() : undefined);
    const body = {
      kind: f.kind,
      consumerName: f.consumerName.trim(),
      docType: f.docType,
      docNumber: f.docNumber.trim(),
      address: clean(f.address),
      phone: clean(f.phone),
      email: f.email.trim(),
      isMinor: f.isMinor,
      guardianName: f.isMinor ? f.guardianName.trim() : undefined,
      itemType: f.itemType,
      amountCents: toCents(f.amount) ?? undefined,
      itemDescription: f.itemDescription.trim(),
      detail: f.detail.trim(),
      request: f.request.trim(),
      locationId: needLocation ? f.locationId : info?.locations.length === 1 ? info.locations[0].id : undefined,
      acceptTruth: true as const,
    };
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/complaints`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (res.status === 201 || res.ok) {
        const d = (await res.json()) as { code: string; dueAt: string; createdAt: string };
        haptic.success();
        setDone({ ...d, sent: f });
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.status === 429) {
        toast.error('Hiciste varios intentos seguidos. Espera unos minutos y vuelve a enviar.');
        return;
      }
      const d = await res.json().catch(() => null);
      const fe = (d?.detail?.fieldErrors ?? {}) as Record<string, string[] | undefined>;
      const mapped: Errors = {};
      for (const [k, msgs] of Object.entries(fe)) {
        const key = (k === 'amountCents' ? 'amount' : k) as FieldKey;
        if (key in EMPTY && msgs?.length) mapped[key] = msgs[0];
      }
      if (Object.keys(mapped).length) {
        setErrors(mapped);
        focusFirst(mapped);
        toast.error('Revisa los campos marcados.');
      } else toast.error('No pudimos registrar tu reclamo. Intenta de nuevo.');
    } catch {
      toast.error('Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-line p-6 text-[15px] text-mute">
        No pudimos cargar el Libro de Reclamaciones. Recarga la página en unos segundos.
      </div>
    );
  }
  if (!info) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-mute" aria-busy>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  const p = info.provider;
  const locationName = (id: string) => {
    const l = info.locations.find((x) => x.id === id);
    return l ? [l.name, l.address, l.district].filter(Boolean).join(', ') : '';
  };

  if (done) {
    const s = done.sent;
    return (
      <div className="min-w-0">
        <Toaster />
        <div className="print:hidden">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ok-tint text-ok">
            <CircleCheck size={28} strokeWidth={1.75} />
          </span>
          <h2 className="mt-6 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
            {s.kind === 'reclamo' ? 'Reclamo registrado' : 'Queja registrada'}
          </h2>
          <p className="mt-3 text-[17px] text-mute">Guarda este código para cualquier consulta.</p>
          <div className="mt-6 rounded-2xl border border-line p-5 md:p-6">
            <div className="text-[13px] font-medium uppercase tracking-[0.08em] text-soft">Código de la hoja</div>
            <div className="tnum mt-1 break-all text-[clamp(2rem,9vw,3rem)] font-semibold tracking-[-0.02em]">{done.code}</div>
            <div className="mt-4 grid gap-3 border-t border-line pt-4 text-[15px] sm:grid-cols-2">
              <div>
                <div className="text-soft">Registrado el</div>
                <div className="font-medium">{fmtDateTime(done.createdAt)}</div>
              </div>
              <div>
                <div className="text-soft">Respuesta a más tardar el</div>
                <div className="font-medium">{fmtDate(done.dueAt)}</div>
              </div>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-field p-4 text-[15px]">
            <MailCheck size={19} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span>
              Enviamos una copia de tu hoja a <span className="break-all font-medium">{s.email}</span>. Si no la ves, revisa la carpeta de spam.
            </span>
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-medium sm:w-auto sm:px-8"
            style={{ background: accent, color: onAccent }}
          >
            <Printer size={18} strokeWidth={1.75} /> Imprimir constancia
          </button>
          <h3 className="mt-10 text-[17px] font-semibold">Lo que enviaste</h3>
        </div>

        {/* Constancia: se ve en pantalla como resumen y es lo único que sale al imprimir */}
        <div className="mt-4 rounded-2xl border border-line p-5 text-[15px] print:mt-0 print:rounded-none print:border-0 print:p-0 print:text-[12px]">
          <div className="hidden print:block">
            <div className="text-[18px] font-semibold">Libro de Reclamaciones: constancia de hoja virtual</div>
            <div className="tnum mt-1 text-[16px] font-semibold">Hoja N.° {done.code}</div>
          </div>
          <SheetHeader p={p} date={fmtDateTime(done.createdAt)} />
          <Summary title="1. Identificación del consumidor" rows={[
            ['Nombre', s.consumerName],
            ['Documento', `${DOC_LABEL[s.docType]} ${s.docNumber}`],
            ['Domicilio', s.address],
            ['Teléfono', s.phone],
            ['Correo', s.email],
            ['Menor de edad', s.isMinor ? `Sí. Padre, madre o apoderado: ${s.guardianName}` : 'No'],
          ]} />
          <Summary title="2. Identificación del bien contratado" rows={[
            ['Tipo', s.itemType === 'servicio' ? 'Servicio' : 'Producto'],
            ['Monto reclamado', toCents(s.amount) != null ? `S/ ${((toCents(s.amount) as number) / 100).toFixed(2)}` : ''],
            ['Descripción', s.itemDescription],
            ...(s.locationId ? [['Local', locationName(s.locationId)] as [string, string]] : []),
          ]} />
          <Summary title="3. Detalle de la reclamación y pedido del consumidor" rows={[
            ['Tipo', s.kind === 'reclamo' ? 'Reclamo' : 'Queja'],
            ['Detalle', s.detail],
            ['Pedido', s.request],
          ]} />
          <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-[13px] text-mute print:text-[11px]">
            <p>Respuesta a más tardar el {fmtDate(done.dueAt)}.</p>
            <LegalNotes />
            <p>El consumidor declaró que los datos consignados son verdaderos.</p>
          </div>
        </div>
      </div>
    );
  }

  const err = (k: FieldKey) => errors[k];
  const fld = (k: FieldKey) =>
    `w-full min-w-0 rounded-xl border bg-white px-4 py-3.5 text-[16px] outline-none transition-colors focus:border-ink ${err(k) ? 'border-red' : 'border-line-2'}`;

  return (
    <form onSubmit={submit} noValidate className="min-w-0">
      <Toaster />
      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="border-b border-line bg-field px-5 py-5 md:px-7">
          <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-mute">
            <BookOpen size={15} strokeWidth={1.75} /> Hoja de reclamación virtual
          </div>
          <SheetHeader p={p} date={today} />
        </div>

        <div className="space-y-10 px-5 py-7 md:px-7">
          <Section n={1} title="Identificación del consumidor">
            <Field k="consumerName" label="Nombre completo" error={err('consumerName')}>
              <input value={f.consumerName} onChange={(e) => set('consumerName', e.target.value)} className={fld('consumerName')} autoComplete="name" maxLength={120} />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Field k="docType" label="Tipo de documento">
                <select value={f.docType} onChange={(e) => set('docType', e.target.value as DocType)} className={fld('docType')}>
                  {DOC_TYPES.map((d) => <option key={d} value={d}>{DOC_LABEL[d]}</option>)}
                </select>
              </Field>
              <Field k="docNumber" label="Número de documento" error={err('docNumber')}>
                <input
                  value={f.docNumber}
                  onChange={(e) => set('docNumber', f.docType === 'DNI' || f.docType === 'RUC' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                  className={fld('docNumber')}
                  inputMode={f.docType === 'DNI' || f.docType === 'RUC' ? 'numeric' : 'text'}
                  maxLength={f.docType === 'DNI' ? 8 : f.docType === 'RUC' ? 11 : 20}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Field k="address" label="Domicilio (opcional)">
              <input value={f.address} onChange={(e) => set('address', e.target.value)} className={fld('address')} autoComplete="street-address" maxLength={200} />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
              <Field k="phone" label="Teléfono (opcional)" error={err('phone')}>
                <input value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d +]/g, ''))} className={fld('phone')} inputMode="tel" autoComplete="tel" maxLength={20} />
              </Field>
              <Field k="email" label="Correo" error={err('email')} hint="Aquí te enviaremos la constancia y la respuesta.">
                <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className={fld('email')} inputMode="email" autoComplete="email" autoCapitalize="none" maxLength={160} />
              </Field>
            </div>
            <CheckRow k="isMinor" checked={f.isMinor} onChange={(v) => set('isMinor', v)}>
              Soy menor de edad
            </CheckRow>
            {f.isMinor && (
              <Field k="guardianName" label="Nombre del padre, madre o apoderado" error={err('guardianName')}>
                <input value={f.guardianName} onChange={(e) => set('guardianName', e.target.value)} className={fld('guardianName')} maxLength={120} />
              </Field>
            )}
          </Section>

          <Section n={2} title="Identificación del bien contratado">
            <Field k="itemType" label="Tipo" group>
              <Segmented
                value={f.itemType}
                onChange={(v) => set('itemType', v)}
                options={[{ v: 'servicio', l: 'Servicio' }, { v: 'producto', l: 'Producto' }]}
              />
            </Field>
            <Field k="amount" label="Monto reclamado (opcional)" error={err('amount')}>
              <div className={`flex min-w-0 items-center rounded-xl border bg-white focus-within:border-ink ${err('amount') ? 'border-red' : 'border-line-2'}`}>
                <span className="border-r border-line px-4 py-3.5 text-[16px] text-mute">S/</span>
                <input
                  value={f.amount}
                  onChange={(e) => set('amount', e.target.value.replace(/[^\d.,]/g, ''))}
                  className="w-full min-w-0 bg-transparent px-4 py-3.5 text-[16px] outline-none"
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </div>
            </Field>
            <Field k="itemDescription" label="Descripción" error={err('itemDescription')}>
              <input
                value={f.itemDescription}
                onChange={(e) => set('itemDescription', e.target.value)}
                className={fld('itemDescription')}
                placeholder={f.itemType === 'servicio' ? 'Ej. Corte y barba del 28 de septiembre' : 'Ej. Cera para cabello'}
                maxLength={300}
              />
            </Field>
            {needLocation && (
              <Field k="locationId" label="Local" error={err('locationId')}>
                <select value={f.locationId} onChange={(e) => set('locationId', e.target.value)} className={fld('locationId')}>
                  <option value="">Elige el local</option>
                  {info.locations.map((l) => (
                    <option key={l.id} value={l.id}>{[l.name, l.district].filter(Boolean).join(', ')}</option>
                  ))}
                </select>
              </Field>
            )}
          </Section>

          <Section n={3} title="Detalle de la reclamación y pedido del consumidor">
            <Field k="kind" label="Tipo" group>
              <Segmented value={f.kind} onChange={(v) => set('kind', v)} options={[{ v: 'reclamo', l: 'Reclamo' }, { v: 'queja', l: 'Queja' }]} />
              <div className="mt-2.5 space-y-1 text-[13px] leading-relaxed text-mute">
                <p><span className="font-medium text-ink">Reclamo:</span> disconformidad relacionada a los productos o servicios.</p>
                <p><span className="font-medium text-ink">Queja:</span> disconformidad no relacionada a los productos o servicios; o malestar o descontento respecto a la atención al público.</p>
              </div>
            </Field>
            <Field k="detail" label="Detalle" error={err('detail')} hint={`${f.detail.trim().length} de 3000`}>
              <textarea value={f.detail} onChange={(e) => set('detail', e.target.value)} rows={5} className={`${fld('detail')} resize-y`} placeholder="Cuéntanos qué pasó, cuándo y con quién." maxLength={3000} />
            </Field>
            <Field k="request" label="Pedido" error={err('request')}>
              <textarea value={f.request} onChange={(e) => set('request', e.target.value)} rows={3} className={`${fld('request')} resize-y`} placeholder="¿Qué solicitas al proveedor?" maxLength={1500} />
            </Field>
          </Section>

          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl bg-field p-4 text-[13px] leading-relaxed text-mute">
              <Scale size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" />
              <div className="space-y-1.5"><LegalNotes /></div>
            </div>
            <CheckRow k="acceptTruth" checked={f.acceptTruth} onChange={(v) => set('acceptTruth', v)} error={err('acceptTruth')}>
              Declaro que los datos consignados son verdaderos.
            </CheckRow>
            <button
              type="submit"
              disabled={busy}
              className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: accent, color: onAccent }}
            >
              {busy && <Loader2 size={18} className="animate-spin" />} Enviar {f.kind === 'reclamo' ? 'reclamo' : 'queja'}
            </button>
            <p className="flex items-start justify-center gap-2 text-center text-[13px] text-soft">
              <ShieldCheck size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              Recibirás una copia de esta hoja en tu correo con su número.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}

function LegalNotes() {
  return (
    <>
      <p>La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p>
      <p>El proveedor deberá dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles.</p>
    </>
  );
}

function SheetHeader({ p, date }: { p: Info['provider']; date: string }) {
  return (
    <dl className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2 print:grid-cols-2 print:text-[12px]">
      <div className="min-w-0">
        <dt className="text-soft">Proveedor</dt>
        <dd className="break-words font-medium">{p.legalName}{p.tradeName && p.tradeName !== p.legalName ? ` (${p.tradeName})` : ''}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-soft">RUC</dt>
        <dd className="tnum font-medium">{p.ruc ?? 'No registrado'}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-soft">Domicilio</dt>
        <dd className="break-words font-medium">{p.address ?? 'No registrado'}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-soft">Fecha</dt>
        <dd className="font-medium">{date}</dd>
      </div>
    </dl>
  );
}

function Summary({ title, rows }: { title: string; rows: [string, string][] }) {
  const shown = rows.filter(([, v]) => v && v.trim());
  return (
    <div className="mt-5 border-t border-line pt-4 print:break-inside-avoid">
      <div className="text-[14px] font-semibold print:text-[12px]">{title}</div>
      <dl className="mt-2 space-y-2">
        {shown.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)] gap-0.5 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4 print:grid-cols-[140px_minmax(0,1fr)] print:gap-4">
            <dt className="text-soft">{k}</dt>
            <dd className="whitespace-pre-wrap break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-5">
      <legend className="mb-5 flex items-center gap-3 text-[18px] font-semibold tracking-[-0.01em]">
        <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] text-white">{n}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ k, label, hint, error, group, children }: { k: FieldKey; label: string; hint?: string; error?: string; group?: boolean; children: React.ReactNode }) {
  const Wrap = group ? 'div' : 'label';
  return (
    <div data-field={k} className="min-w-0">
      <Wrap className="block">
        <span className="mb-2 block text-[15px] font-medium">{label}</span>
        {children}
      </Wrap>
      {error ? (
        <span role="alert" className="mt-1.5 block text-[13px] text-red">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-soft">{hint}</span>
      ) : null}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-full bg-field p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => { haptic.select(); onChange(o.v); }}
          className={`min-h-[44px] rounded-full text-[15px] font-medium transition-colors ${value === o.v ? 'bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-mute hover:text-ink'}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function CheckRow({ k, checked, onChange, error, children }: { k: FieldKey; checked: boolean; onChange: (v: boolean) => void; error?: string; children: React.ReactNode }) {
  return (
    <div data-field={k}>
      <label className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[15px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${error ? 'border-red' : checked ? 'border-ink' : 'border-line hover:border-ink'}`}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-ink bg-ink text-white' : 'border-line-2'}`} aria-hidden>
          {checked && <Check size={13} strokeWidth={3} />}
        </span>
        <span>{children}</span>
      </label>
      {error && <span role="alert" className="mt-1.5 block text-[13px] text-red">{error}</span>}
    </div>
  );
}
