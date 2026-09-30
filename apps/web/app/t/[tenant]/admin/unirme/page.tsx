'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, CircleAlert, UserRoundCheck, Link2 } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { PoleMark } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

// En el subdominio, {slug}.date.pe/admin/unirme?token=... llega aquí por la reescritura del middleware.
interface Invite { email: string; role: 'manager' | 'cashier' | 'staff'; tenant_name: string; staff_name: string | null; has_account: boolean }

const ROLE_TEXT: Record<Invite['role'], string> = { staff: 'barbero', cashier: 'caja', manager: 'encargado' };
const ROLE_BODY: Record<Invite['role'], string> = {
  staff: 'Verás tu día, tus clientes con sus preferencias, la fila y podrás cobrar.',
  cashier: 'Podrás cobrar, abrir y cerrar la caja, llamar a la fila y ver la agenda y los clientes.',
  manager: 'Podrás gestionar la agenda, el equipo, la caja y la configuración de la barbería.',
};

const titleCls = 'text-[clamp(2rem,4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]';
const primaryCls = 'mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3.5 text-[16px] font-medium text-white hover:bg-ink-2 disabled:opacity-50';

export default function UnirmePage() {
  const tenant = useParams().tenant as string;
  const [token, setToken] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [state, setState] = useState<'loading' | 'form' | 'expired'>('loading');
  const [adminHref, setAdminHref] = useState('/admin');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    // Funciona igual en el subdominio (/admin/unirme) y en la ruta interna (/t/slug/admin/unirme)
    setAdminHref(window.location.pathname.replace(/\/unirme\/?$/, '') || '/admin');
    setToken(t);
    if (!t) return setState('expired');
    fetch(`${API_BASE_CLIENT}/api/team/invite?token=${encodeURIComponent(t)}`, { headers: { 'X-Tenant-Slug': tenant } })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.invite) {
          setInvite(d.invite);
          setState('form');
        } else setState('expired');
      })
      .catch(() => setState('expired'));
  }, [tenant]);

  const tooShort = password.length > 0 && password.length < 8;
  const valid = name.trim().length > 1 && password.length >= 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !token) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/team/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.token) {
        // Misma clave que usa el ingreso del panel
        localStorage.setItem(`datepe_token_${tenant}`, d.token);
        haptic.success();
        window.location.href = adminHref;
      } else if (res.status === 404 || d?.error === 'invitacion_vencida') {
        haptic.error();
        setState('expired');
      } else {
        toast.error('No se pudo aceptar la invitación. Intenta de nuevo.');
      }
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <Toaster />
      <div className="flex flex-col px-6 py-8 md:px-12">
        <div className="flex items-center gap-2 text-[15px] text-mute"><PoleMark size={22} /> date.pe</div>
        <div className="my-auto w-full max-w-sm py-16">
          {state === 'loading' && <Loader2 className="animate-spin text-soft" />}

          {state === 'expired' && (
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-field"><CircleAlert size={24} strokeWidth={1.75} /></span>
              <h1 className={`mt-6 ${titleCls}`}>La invitación venció</h1>
              <p className="mt-2 text-[16px] text-mute">Las invitaciones sirven una sola vez y vencen a los pocos días. Pídele a la barbería que te envíe otra.</p>
              <a href={adminHref} className="mt-8 flex w-full items-center justify-center rounded-lg border border-line-2 py-3.5 text-[16px] font-medium hover:border-ink">Ir a ingresar</a>
            </div>
          )}

          {state === 'form' && invite && (
            <form onSubmit={submit}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-field"><UserRoundCheck size={24} strokeWidth={1.75} /></span>
              <h1 className={`mt-6 ${titleCls}`}>Te invitaron a {invite.tenant_name} como {ROLE_TEXT[invite.role]}</h1>
              <p className="mt-2 text-[16px] text-mute">
                {ROLE_BODY[invite.role]}
                {invite.role === 'staff' && invite.staff_name ? ` Tu agenda es la de ${invite.staff_name}.` : ''}
              </p>

              <div className="mt-6 rounded-xl bg-field px-4 py-3 text-[15px]">
                <span className="text-mute">Cuenta: </span>
                <span className="font-medium">{invite.email}</span>
              </div>

              {invite.has_account && (
                <p className="mt-3 flex items-start gap-2.5 text-[14px] text-mute">
                  <Link2 size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" />
                  Ya tienes una cuenta en date.pe con este correo: la vinculamos a {invite.tenant_name}. Tu contraseña actual no cambia y sigues ingresando con ella; igual te pedimos una por seguridad.
                </p>
              )}

              <label className="mt-6 block">
                <span className="mb-1.5 block text-[14px] font-medium">Tu nombre</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  autoCapitalize="words"
                  required
                  maxLength={80}
                  className="w-full rounded-xl border border-line-2 px-4 py-3.5 text-[16px] outline-none focus:border-ink"
                />
              </label>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[14px] font-medium">{invite.has_account ? 'Contraseña' : 'Crea una contraseña'}</span>
                <div className={`flex items-center rounded-xl border pr-2 focus-within:border-ink ${tooShort ? 'border-red' : 'border-line-2'}`}>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? 'text' : 'password'}
                    autoComplete={invite.has_account ? 'current-password' : 'new-password'}
                    minLength={8}
                    required
                    className="w-full bg-transparent px-4 py-3.5 text-[16px] outline-none"
                  />
                  <button type="button" onClick={() => setShow(!show)} className="flex h-10 w-10 items-center justify-center rounded-lg text-mute hover:bg-field" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
                  </button>
                </div>
                <span className={`mt-1 block text-[13px] ${tooShort ? 'text-red-deep' : 'text-soft'}`}>Mínimo 8 caracteres.</span>
              </label>
              <button disabled={busy || !valid} className={primaryCls}>
                {busy && <Loader2 size={18} className="animate-spin" />} Unirme al equipo
              </button>
            </form>
          )}
        </div>
      </div>
      <div className="relative hidden bg-field lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/shops-owner.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    </main>
  );
}
