'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Scissors, Trash2, Clock, PlusCircle } from 'lucide-react';
import { useApi, soles } from './api';
import { PageHead, Btn, Switch, Drawer, Field, inputCls, Empty, Skeleton } from './ui';
import { toast } from '@/lib/toast';

interface Service { id: string; name: string; description: string | null; duration_min: number; buffer_min: number; price_cents: number; is_active: boolean; is_addon?: boolean }
interface Draft { id?: string; name: string; description: string; duration: string; buffer: string; price: string; isAddon: boolean }

const toDraft = (s?: Service, isAddon = false): Draft => ({
  id: s?.id,
  name: s?.name ?? '',
  description: s?.description ?? '',
  duration: String(s?.duration_min ?? 30),
  buffer: String(s?.buffer_min ?? 5),
  price: s ? (s.price_cents / 100).toFixed(2) : '',
  isAddon: s ? !!s.is_addon : isAddon,
});

export function Servicios() {
  const api = useApi();
  const [list, setList] = useState<Service[] | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<{ services: Service[] }>('/admin/services').then((d) => setList(d.services)).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const services = (list ?? []).filter((s) => !s.is_addon);
  const addons = (list ?? []).filter((s) => s.is_addon);

  const priceCents = edit ? Math.round(Number(edit.price.replace(',', '.')) * 100) : 0;
  const valid = !!edit && edit.name.trim().length > 1 && Number(edit.duration) >= 5 && priceCents >= 0 && !Number.isNaN(priceCents);

  async function save() {
    if (!edit || !valid) return;
    setBusy(true);
    const body = { name: edit.name.trim(), description: edit.description.trim() || null, durationMin: Number(edit.duration), bufferMin: Number(edit.buffer) || 0, priceCents, isAddon: edit.isAddon };
    try {
      if (edit.id) await api(`/admin/services/${edit.id}`, { method: 'PATCH', body });
      else await api('/admin/services', { method: 'POST', body });
      toast.success(edit.isAddon ? 'Extra guardado' : 'Servicio guardado');
      setEdit(null);
      load();
    } catch {
      toast.error('No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: Service, v: boolean) {
    setList((p) => p?.map((x) => (x.id === s.id ? { ...x, is_active: v } : x)) ?? null);
    try {
      await api(`/admin/services/${s.id}`, { method: 'PATCH', body: { isActive: v } });
    } catch {
      toast.error('No se pudo actualizar.');
      load();
    }
  }

  async function remove() {
    if (!edit?.id || !confirm(`¿Eliminar "${edit.name}"? Si tiene citas, mejor desactívalo.`)) return;
    try {
      await api(`/admin/services/${edit.id}`, { method: 'DELETE' });
      toast.success(edit.isAddon ? 'Extra eliminado' : 'Servicio eliminado');
      setEdit(null);
      load();
    } catch {
      toast.error('Tiene citas asociadas. Desactívalo en lugar de eliminarlo.');
    }
  }

  return (
    <>
      <PageHead
        title="Servicios"
        sub="Lo que ofreces, cuánto dura y cuánto cuesta."
        actions={
          <>
            <Btn variant="secondary" onClick={() => setEdit(toDraft(undefined, true))}><PlusCircle size={16} strokeWidth={1.75} /> Nuevo extra</Btn>
            <Btn onClick={() => setEdit(toDraft())}><Plus size={16} strokeWidth={2} /> Nuevo servicio</Btn>
          </>
        }
      />
      {!list ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <Empty icon={Scissors} title="Aún no tienes servicios" body="Empieza por los que más pides: corte, barba, fade." action={<Btn onClick={() => setEdit(toDraft())}><Plus size={16} /> Nuevo servicio</Btn>} />
      ) : (
        <>
          <h2 className="mb-2 text-[17px] font-semibold tracking-[-0.02em]">Servicios</h2>
          {services.length === 0 ? (
            <p className="border-y border-line py-4 text-[15px] text-mute">Aún no tienes servicios principales. Los extras necesitan uno para reservarse.</p>
          ) : (
            <ServiceList items={services} onEdit={(s) => setEdit(toDraft(s))} onToggle={toggle} />
          )}

          <div className="mb-2 mt-12">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Extras</h2>
            <p className="mt-0.5 text-[14px] text-mute">Se suman a un servicio al reservar y alargan la cita.</p>
          </div>
          {addons.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-2 px-4 py-4">
              <p className="text-[15px] text-mute">Ofrece lavado, diseño o cejas como extra del corte.</p>
              <Btn variant="secondary" onClick={() => setEdit(toDraft(undefined, true))}><PlusCircle size={16} strokeWidth={1.75} /> Nuevo extra</Btn>
            </div>
          ) : (
            <ServiceList items={addons} onEdit={(s) => setEdit(toDraft(s))} onToggle={toggle} addon />
          )}
        </>
      )}

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.isAddon ? (edit.id ? 'Editar extra' : 'Nuevo extra') : edit?.id ? 'Editar servicio' : 'Nuevo servicio'}
        footer={
          <>
            {edit?.id && <Btn variant="danger" className="mr-auto" onClick={remove}><Trash2 size={16} strokeWidth={1.75} /> Eliminar</Btn>}
            <Btn variant="ghost" onClick={() => setEdit(null)}>Cancelar</Btn>
            <Btn onClick={save} busy={busy} disabled={!valid}>Guardar</Btn>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Field label="Nombre"><input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputCls} placeholder={edit.isAddon ? 'Lavado y masaje' : 'Fade'} /></Field>
            <Field label="Descripción" hint="Una línea. Se muestra en tu página.">
              <input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={90} className={inputCls} placeholder="Degradado a piel con perfilado" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio (S/)"><input inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} className={`tnum ${inputCls}`} placeholder="30.00" /></Field>
              <Field label="Duración (min)"><input inputMode="numeric" value={edit.duration} onChange={(e) => setEdit({ ...edit, duration: e.target.value.replace(/\D/g, '') })} className={`tnum ${inputCls}`} /></Field>
            </div>
            <Field label="Tiempo de limpieza (min)" hint="Se bloquea después de cada cita para preparar el sillón.">
              <input inputMode="numeric" value={edit.buffer} onChange={(e) => setEdit({ ...edit, buffer: e.target.value.replace(/\D/g, '') })} className={`tnum ${inputCls}`} />
            </Field>
            <div className="flex items-start justify-between gap-4 border-t border-line pt-4">
              <div>
                <span className="block text-[15px] font-medium">Es un extra</span>
                <span className="mt-0.5 block text-[13px] text-soft">Los extras se suman a un servicio (lavado, diseño, cejas) y no se reservan solos.</span>
              </div>
              <Switch checked={edit.isAddon} onChange={(v) => setEdit({ ...edit, isAddon: v })} label="Es un extra" states={['Sí', 'No']} />
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

function ServiceList({ items, onEdit, onToggle, addon }: { items: Service[]; onEdit: (s: Service) => void; onToggle: (s: Service, v: boolean) => void; addon?: boolean }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((s) => (
        <li key={s.id} className="flex items-center gap-4 py-4">
          <button type="button" onClick={() => onEdit(s)} className="min-w-0 flex-1 text-left">
            <div className={`text-[16px] font-medium ${s.is_active ? '' : 'text-soft'}`}>{s.name}</div>
            <div className="flex items-center gap-3 text-[14px] text-mute">
              <span className="flex items-center gap-1"><Clock size={13} strokeWidth={1.75} /> {addon ? '+' : ''}{s.duration_min} min</span>
              {s.description && <span className="hidden truncate sm:inline">{s.description}</span>}
            </div>
          </button>
          <span className="tnum w-24 text-right text-[16px] font-medium">{addon ? '+' : ''}{soles(s.price_cents)}</span>
          <Switch checked={s.is_active} onChange={(v) => onToggle(s, v)} label={`${addon ? 'Extra' : 'Servicio'} ${s.name}`} states={['Visible', 'Oculto']} />
        </li>
      ))}
    </ul>
  );
}
