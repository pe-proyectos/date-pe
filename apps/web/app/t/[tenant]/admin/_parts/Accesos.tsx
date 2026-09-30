'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, KeyRound, Mail, Send, Trash2, Copy, MessageCircle, Scissors, Wallet, Briefcase, CircleCheck, Clock } from 'lucide-react';
import { useApi } from './api';
import { PageHead, Btn, Drawer, Field, inputCls, Empty, Skeleton, usePanel, ROLE_LABEL, type Role } from './ui';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

interface Member { user_id: string; name: string | null; email: string; role: Role; staff_id: string | null; staff_name: string | null }
interface Invite { email: string; role: Exclude<Role, 'owner'>; staff_id?: string | null; staff_name: string | null; expires_at: string }
interface Staff { id: string; name: string }
type TeamRole = Exclude<Role, 'owner'>;

const ROLES: { id: TeamRole; title: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; can: string }[] = [
  { id: 'staff', title: 'Barbero', icon: Scissors, can: 'Ve su día, sus clientes con sus preferencias, la fila y puede cobrar. No ve la plata del negocio.' },
  { id: 'cashier', title: 'Caja', icon: Wallet, can: 'Cobra, abre y cierra la caja, llama a la fila y ve la agenda y los clientes.' },
  { id: 'manager', title: 'Encargado', icon: Briefcase, can: 'Todo el panel menos el pago del plan: agenda, equipo, caja, reportes y ajustes.' },
];

const ROLE_PILL: Record<Role, string> = {
  owner: 'bg-ink text-white',
  manager: 'bg-field text-ink',
  cashier: 'bg-field text-ink',
  staff: 'bg-field text-ink',
};

const ERRORS: Record<string, string> = {
  ya_es_parte_del_equipo: 'Esa persona ya es parte de tu equipo.',
  elige_el_barbero: 'Elige qué barbero es para ver su agenda.',
  no_se_puede_cambiar_al_dueno: 'No se puede cambiar el rol del dueño.',
  no_puedes_quitarte: 'No puedes quitarte a ti mismo.',
  no_se_puede_quitar: 'No se puede quitar a esta persona.',
};

const expiresText = (iso: string) => {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
  return days <= 1 ? 'Vence hoy' : `Vence en ${days} días`;
};

/** Cuentas del equipo: quién entra al panel y qué puede hacer. */
export function Accesos() {
  const api = useApi();
  const { me } = usePanel();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [edit, setEdit] = useState<Member | null>(null);
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ members: Member[]; invites: Invite[] }>('/admin/team');
      setMembers(d.members);
      setInvites(d.invites);
    } catch {
      setMembers((m) => m ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
    api<{ staff: Staff[] }>('/admin/staff').then((d) => setStaff(d.staff)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function saveMember(m: Member, role: TeamRole, staffId: string | null) {
    if (role === 'staff' && !staffId) return toast.error(ERRORS.elige_el_barbero);
    setBusy('member');
    try {
      await api(`/admin/team/${m.user_id}`, { method: 'PATCH', body: { role, staffId: role === 'staff' ? staffId : null } });
      toast.success('Acceso actualizado');
      setEdit(null);
      load();
    } catch (e) {
      toast.error(ERRORS[(e as Error).message] ?? 'No se pudo guardar.');
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(m: Member) {
    if (!confirm(`¿Quitar el acceso de ${m.name || m.email}? Ya no podrá entrar al panel.`)) return;
    setBusy('remove');
    try {
      await api(`/admin/team/${m.user_id}`, { method: 'DELETE' });
      toast.success('Acceso quitado');
      setEdit(null);
      setMembers((p) => p?.filter((x) => x.user_id !== m.user_id) ?? null);
    } catch (e) {
      toast.error(ERRORS[(e as Error).message] ?? 'No se pudo quitar.');
    } finally {
      setBusy(null);
    }
  }

  async function resend(i: Invite) {
    haptic.tap();
    setBusy(`resend:${i.email}`);
    const staffId = i.staff_id ?? staff.find((s) => s.name === i.staff_name)?.id ?? null;
    try {
      await api('/admin/team/invite', { method: 'POST', body: { email: i.email, role: i.role, staffId } });
      toast.success(`Invitación reenviada a ${i.email}`);
      load();
    } catch (e) {
      toast.error(ERRORS[(e as Error).message] ?? 'No se pudo reenviar.');
    } finally {
      setBusy(null);
    }
  }

  async function revoke(i: Invite) {
    if (!confirm(`¿Anular la invitación de ${i.email}? El enlace dejará de funcionar.`)) return;
    setInvites((p) => p.filter((x) => x.email !== i.email));
    try {
      await api(`/admin/team/invites/${encodeURIComponent(i.email)}`, { method: 'DELETE' });
      toast.success('Invitación anulada');
    } catch {
      toast.error('No se pudo anular.');
      load();
    }
  }

  return (
    <>
      <PageHead
        title="Accesos"
        sub="Cada persona entra con su propia cuenta y ve solo lo que necesita."
        actions={<Btn onClick={() => setInviting(true)}><UserPlus size={16} strokeWidth={1.75} /> Invitar</Btn>}
      />

      {!members ? (
        <Skeleton rows={3} />
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-2 text-[17px] font-semibold tracking-[-0.02em]">Equipo con acceso</h2>
            {members.length <= 1 && (
              <p className="mb-3 text-[15px] text-mute">Invita a tus barberos: verán su día, su siguiente cliente y lo que llevan ganado desde el celular.</p>
            )}
            <ul className="divide-y divide-line border-y border-line">
              {members.map((m) => {
                const editable = m.role !== 'owner' && m.user_id !== me?.id;
                return (
                  <li key={m.user_id}>
                    <button type="button" disabled={!editable} onClick={() => setEdit(m)} className="flex w-full items-center gap-3 py-3.5 text-left disabled:cursor-default">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-field text-[15px] font-semibold">{(m.name || m.email).charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.name || m.email}{m.user_id === me?.id ? ' (tú)' : ''}</span>
                        <span className="block truncate text-[14px] text-mute">{m.email}{m.role === 'staff' && m.staff_name ? `, agenda de ${m.staff_name}` : ''}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${ROLE_PILL[m.role]}`}>{ROLE_LABEL[m.role]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-[17px] font-semibold tracking-[-0.02em]">Invitaciones pendientes</h2>
            {invites.length === 0 ? (
              <Empty icon={Mail} title="Sin invitaciones pendientes" body="Cuando invites a alguien, aparece aquí hasta que acepte." />
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {invites.map((i) => (
                  <li key={i.email} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-line-2 text-mute"><Clock size={17} strokeWidth={1.75} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.email}</p>
                      <p className="text-[14px] text-mute">{ROLE_LABEL[i.role]}{i.staff_name ? `, ${i.staff_name}` : ''}. {expiresText(i.expires_at)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Btn variant="secondary" className="min-h-11" busy={busy === `resend:${i.email}`} onClick={() => resend(i)}><Send size={15} strokeWidth={1.75} /> Reenviar</Btn>
                      <button type="button" onClick={() => revoke(i)} className="flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-red-tint hover:text-red" aria-label={`Anular invitación de ${i.email}`}>
                        <Trash2 size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl bg-field p-5">
            <p className="flex items-center gap-2 text-[15px] font-medium"><KeyRound size={17} strokeWidth={1.75} /> Qué puede hacer cada rol</p>
            <dl className="mt-3 space-y-2 text-[14px]">
              {ROLES.map((r) => (
                <div key={r.id}><dt className="inline font-medium">{r.title}: </dt><dd className="inline text-mute">{r.can}</dd></div>
              ))}
            </dl>
          </section>
        </div>
      )}

      <MemberDrawer member={edit} staff={staff} busy={busy} onClose={() => setEdit(null)} onSave={saveMember} onRemove={removeMember} />
      <InviteDrawer open={inviting} staff={staff} onClose={() => setInviting(false)} onDone={load} />
    </>
  );
}

function RolePicker({ value, onChange }: { value: TeamRole; onChange: (r: TeamRole) => void }) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Rol">
      {ROLES.map((r) => {
        const on = value === r.id;
        const Icon = r.icon;
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => { haptic.select(); onChange(r.id); }}
            className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${on ? 'border-ink bg-white shadow-lift' : 'border-line hover:border-line-2'}`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-ink text-white' : 'bg-field'}`}><Icon size={18} strokeWidth={1.75} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium">{r.title}</span>
              <span className="block text-[14px] text-mute">{r.can}</span>
            </span>
            {on && <CircleCheck size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

function StaffSelect({ staff, value, onChange }: { staff: Staff[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="¿Qué barbero es?" hint="Verá la agenda, los clientes y las ganancias de este barbero.">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Elige un barbero</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </Field>
  );
}

function MemberDrawer({ member, staff, busy, onClose, onSave, onRemove }: {
  member: Member | null; staff: Staff[]; busy: string | null; onClose: () => void;
  onSave: (m: Member, role: TeamRole, staffId: string | null) => void; onRemove: (m: Member) => void;
}) {
  const [role, setRole] = useState<TeamRole>('staff');
  const [staffId, setStaffId] = useState('');
  useEffect(() => {
    if (!member || member.role === 'owner') return;
    setRole(member.role);
    setStaffId(member.staff_id ?? '');
  }, [member]);

  return (
    <Drawer
      open={!!member}
      onClose={onClose}
      title={member ? member.name || member.email : 'Acceso'}
      footer={member && (
        <>
          <Btn variant="danger" className="mr-auto" busy={busy === 'remove'} onClick={() => onRemove(member)}><Trash2 size={16} strokeWidth={1.75} /> Quitar acceso</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn busy={busy === 'member'} disabled={role === 'staff' && !staffId} onClick={() => onSave(member, role, staffId || null)}>Guardar</Btn>
        </>
      )}
    >
      {member && (
        <div className="space-y-5">
          <p className="text-[15px] text-mute">{member.email}</p>
          <RolePicker value={role} onChange={setRole} />
          {role === 'staff' && <StaffSelect staff={staff} value={staffId} onChange={setStaffId} />}
        </div>
      )}
    </Drawer>
  );
}

function InviteDrawer({ open, staff, onClose, onDone }: { open: boolean; staff: Staff[]; onClose: () => void; onDone: () => void }) {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('staff');
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setRole('staff');
    setStaffId('');
    setUrl(null);
  }, [open]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = emailOk && (role !== 'staff' || !!staffId);
  const roleTitle = ROLES.find((r) => r.id === role)?.title.toLowerCase() ?? '';

  async function send() {
    if (!valid) return;
    setBusy(true);
    try {
      const d = await api<{ ok: boolean; url: string }>('/admin/team/invite', { method: 'POST', body: { email: email.trim(), role, staffId: role === 'staff' ? staffId : null } });
      setUrl(d.url);
      haptic.success();
      onDone();
    } catch (e) {
      toast.error(ERRORS[(e as Error).message] ?? 'No se pudo enviar la invitación.');
    } finally {
      setBusy(false);
    }
  }

  const waText = url ? `Hola, te invito al panel de nuestra barbería como ${roleTitle}. Entra aquí para crear tu acceso: ${url}` : '';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={url ? 'Invitación enviada' : 'Invitar al equipo'}
      footer={url ? <Btn onClick={onClose}>Listo</Btn> : <><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={send} busy={busy} disabled={!valid}><Send size={15} strokeWidth={1.75} /> Enviar invitación</Btn></>}
    >
      {url ? (
        <div className="space-y-5">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ok-tint text-ok"><CircleCheck size={24} strokeWidth={1.75} /></span>
            <p className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">Le enviamos un correo a {email.trim()}</p>
            <p className="mt-1 text-[15px] text-mute">Si no le llega, mándale el enlace por WhatsApp. Vence en 7 días y sirve una sola vez.</p>
          </div>
          <div className="break-all rounded-xl bg-field px-4 py-3 font-mono text-[13px]">{url}</div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" className="min-h-11" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Enlace copiado'), () => toast.error('No se pudo copiar.'))}><Copy size={15} strokeWidth={1.75} /> Copiar enlace</Btn>
            <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink-2">
              <MessageCircle size={15} strokeWidth={1.75} /> Enviar por WhatsApp
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="Correo">
            <input autoFocus type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="carlos@correo.com" />
          </Field>
          <div>
            <span className="mb-1.5 block text-[14px] font-medium">Rol</span>
            <RolePicker value={role} onChange={setRole} />
          </div>
          {role === 'staff' && (
            staff.length ? <StaffSelect staff={staff} value={staffId} onChange={setStaffId} /> : <p className="rounded-xl bg-field p-4 text-[14px] text-mute">Primero agrega al barbero en Equipo para vincular su cuenta.</p>
          )}
        </div>
      )}
    </Drawer>
  );
}
