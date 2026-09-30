'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Camera, Trash2, Users, Star, Loader2 } from 'lucide-react';
import { useAdmin, useApi } from './api';
import { PageHead, Btn, Switch, Drawer, Field, inputCls, Empty, Skeleton } from './ui';
import { uploadImage } from '@/lib/upload';
import { toast } from '@/lib/toast';

interface Staff { id: string; name: string; photo_url: string | null; bio: string | null; specialties: string[] | null; is_bookable: boolean; rating_avg: string; rating_count: number }

export function Equipo() {
  const { tenant, token } = useAdmin();
  const api = useApi();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [edit, setEdit] = useState<Partial<Staff> | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

  const load = useCallback(() => api<{ staff: Staff[] }>('/admin/staff').then((d) => setStaff(d.staff)).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!edit?.name?.trim()) return;
    setBusy(true);
    const body = {
      name: edit.name.trim(),
      bio: edit.bio ?? null,
      specialties: (edit.specialties ?? []).filter(Boolean),
    };
    try {
      if (edit.id) await api(`/admin/staff/${edit.id}`, { method: 'PATCH', body });
      else await api('/admin/staff', { method: 'POST', body: { ...body, isBookable: true } });
      toast.success(edit.id ? 'Cambios guardados' : `${body.name} ya aparece en tu página`);
      setEdit(null);
      load();
    } catch {
      toast.error('No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: Staff, v: boolean) {
    setStaff((prev) => prev?.map((x) => (x.id === s.id ? { ...x, is_bookable: v } : x)) ?? null);
    try {
      await api(`/admin/staff/${s.id}`, { method: 'PATCH', body: { isBookable: v } });
      toast.success(v ? `${s.name} ahora recibe reservas` : `${s.name} ya no aparece para reservar`);
    } catch {
      toast.error('No se pudo actualizar.');
      load();
    }
  }

  async function remove(s: Staff) {
    if (!confirm(`¿Eliminar a ${s.name}? Sus citas pasadas se conservan.`)) return;
    try {
      await api(`/admin/staff/${s.id}`, { method: 'DELETE' });
      toast.success(`${s.name} eliminado`);
      setEdit(null);
      load();
    } catch {
      toast.error('No se pudo eliminar.');
    }
  }

  async function onFile(file: File) {
    const id = uploadFor.current;
    if (!id) return;
    setUploading(id);
    try {
      const url = await uploadImage(file, 'staff', { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}` });
      await api(`/admin/staff/${id}`, { method: 'PATCH', body: { photoUrl: url } });
      toast.success('Foto actualizada');
      load();
    } catch {
      toast.error('No se pudo subir la foto. Usa JPG, PNG o WebP.');
    } finally {
      setUploading(null);
    }
  }

  return (
    <>
      <PageHead
        title="Equipo"
        sub="Quién atiende y quién aparece para reservar en tu página."
        actions={<Btn onClick={() => setEdit({ name: '', bio: '', specialties: [] })}><Plus size={16} strokeWidth={2} /> Agregar barbero</Btn>}
      />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

      {!staff ? (
        <Skeleton />
      ) : staff.length === 0 ? (
        <Empty icon={Users} title="Todavía no hay barberos" body="Agrega a tu equipo para que tus clientes puedan elegir con quién atenderse." action={<Btn onClick={() => setEdit({ name: '' })}><Plus size={16} /> Agregar barbero</Btn>} />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center gap-4 py-4">
              <button
                type="button"
                onClick={() => { uploadFor.current = s.id; fileRef.current?.click(); }}
                className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-field"
                aria-label={`Cambiar foto de ${s.name}`}
              >
                {s.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-[18px] font-medium">{s.name.charAt(0)}</span>
                )}
                <span className={`absolute inset-0 flex items-center justify-center bg-ink/50 text-white transition-opacity ${uploading === s.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {uploading === s.id ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} strokeWidth={1.75} />}
                </span>
              </button>
              <button type="button" onClick={() => setEdit(s)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-medium">{s.name}</span>
                  {s.rating_count > 0 && <span className="tnum flex items-center gap-1 text-[13px] text-mute"><Star size={12} strokeWidth={0} className="fill-ink" /> {Number(s.rating_avg).toFixed(1)}</span>}
                </div>
                <div className="line-clamp-2 text-[14px] text-mute">{s.bio || (s.specialties ?? []).join(', ') || 'Sin descripción'}</div>
              </button>
              <div className="flex items-center gap-3">
                <Switch checked={s.is_bookable} onChange={(v) => toggle(s, v)} label={`Reservas con ${s.name}`} states={['Reservable', 'Oculto']} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? `Editar a ${edit.name}` : 'Nuevo barbero'}
        footer={
          <>
            {edit?.id && <Btn variant="danger" className="mr-auto" onClick={() => remove(edit as Staff)}><Trash2 size={16} strokeWidth={1.75} /> Eliminar</Btn>}
            <Btn variant="ghost" onClick={() => setEdit(null)}>Cancelar</Btn>
            <Btn onClick={save} busy={busy} disabled={!edit?.name?.trim()}>Guardar</Btn>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Field label="Nombre"><input autoFocus value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputCls} /></Field>
            <Field label="Descripción corta" hint="Se muestra en tu página. Ej.: Fades y diseños a navaja.">
              <input value={edit.bio ?? ''} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} maxLength={80} className={inputCls} />
            </Field>
            <Field label="Especialidades" hint="Separadas por comas.">
              <input value={(edit.specialties ?? []).join(', ')} onChange={(e) => setEdit({ ...edit, specialties: e.target.value.split(',').map((x) => x.trim()) })} className={inputCls} />
            </Field>
          </div>
        )}
      </Drawer>
    </>
  );
}
