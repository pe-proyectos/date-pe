'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, CircleCheck, CircleAlert, MailCheck } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { PoleMark } from '@/components/brand';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

// En el subdominio, {slug}.date.pe/admin/restablecer llega aquí por la reescritura del middleware.
type Stage = 'form' | 'done' | 'expired' | 'resent';

const fieldCls = 'w-full rounded-xl border px-4 py-3.5 text-[16px] outline-none focus:border-ink';
const titleCls = 'text-[clamp(2rem,4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]';
const primaryCls = 'mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3.5 text-[16px] font-medium text-white hover:bg-ink-2 disabled:opacity-50';

export default function RestablecerPage() {
  const tenant = useParams().tenant as string;
  const [token, setToken] = useState<string | null>(null);
  const [adminHref, setAdminHref] = useState('/admin');
  const [stage, setStage] = useState<Stage>('form');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t);
    if (!t || !/^[a-f0-9]{48}$/i.test(t)) setStage('expired');
    // Funciona igual en el subdominio (/admin/restablecer) y en la ruta interna (/t/slug/admin/restablecer)
    setAdminHref(window.location.pathname.replace(/\/restablecer\/?$/, '') || '/admin');
  }, []);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = password.length >= 8 && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !token) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        haptic.success();
        setStage('done');
      } else if (d?.error === 'enlace_vencido' || res.status === 400) {
        haptic.error();
        setStage('expired');
      } else {
        toast.error('No se pudo cambiar la contraseña. Intenta de nuevo.');
      }
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(`${API_BASE_CLIENT}/api/auth/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      /* misma respuesta siempre */
    } finally {
      setBusy(false);
      haptic.success();
      setStage('resent');
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <Toaster />
      <div className="flex flex-col px-6 py-8 md:px-12">
        <div className="flex items-center gap-2 text-[15px] text-mute"><PoleMark size={22} /> date.pe</div>
        <div className="my-auto w-full max-w-sm py-16">
          {stage === 'form' && (
            <form onSubmit={submit}>
              <h1 className={titleCls}>Crea una nueva contraseña</h1>
              <p className="mt-2 text-[16px] text-mute">Usa al menos 8 caracteres. Después ingresas con ella a tu panel.</p>
              <label className="mt-8 block">
                <span className="mb-1.5 block text-[14px] font-medium">Nueva contraseña</span>
                <div className={`flex items-center rounded-xl border pr-2 focus-within:border-ink ${tooShort ? 'border-red' : 'border-line-2'}`}>
                  <input autoFocus value={password} onChange={(e) => setPassword(e.target.value)} type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} required className="w-full bg-transparent px-4 py-3.5 text-[16px] outline-none" />
                  <button type="button" onClick={() => setShow(!show)} className="flex h-10 w-10 items-center justify-center rounded-lg text-mute hover:bg-field" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
                  </button>
                </div>
                <span className={`mt-1 block text-[13px] ${tooShort ? 'text-red-deep' : 'text-soft'}`}>Mínimo 8 caracteres.</span>
              </label>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[14px] font-medium">Repite la contraseña</span>
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type={show ? 'text' : 'password'} autoComplete="new-password" required className={`${fieldCls} ${mismatch ? 'border-red' : 'border-line-2'}`} />
                {mismatch && <span className="mt-1 block text-[13px] text-red-deep">Las contraseñas no coinciden.</span>}
              </label>
              <button disabled={busy || !valid} className={primaryCls}>
                {busy && <Loader2 size={18} className="animate-spin" />} Guardar contraseña
              </button>
            </form>
          )}

          {stage === 'done' && (
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ok-tint text-ok"><CircleCheck size={24} strokeWidth={1.75} /></span>
              <h1 className={`mt-6 ${titleCls}`}>Contraseña actualizada</h1>
              <p className="mt-2 text-[16px] text-mute">Ya puedes ingresar a tu panel con tu nueva contraseña.</p>
              <a href={adminHref} className={primaryCls}>Ir a mi panel</a>
            </div>
          )}

          {stage === 'expired' && (
            <form onSubmit={resend}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-field"><CircleAlert size={24} strokeWidth={1.75} /></span>
              <h1 className={`mt-6 ${titleCls}`}>El enlace venció</h1>
              <p className="mt-2 text-[16px] text-mute">Los enlaces duran 1 hora y sirven una sola vez. Pide otro con el correo de tu cuenta.</p>
              <label className="mt-8 block">
                <span className="mb-1.5 block text-[14px] font-medium">Correo</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className={`${fieldCls} border-line-2`} />
              </label>
              <button disabled={busy} className={primaryCls}>
                {busy && <Loader2 size={18} className="animate-spin" />} Pedir otro enlace
              </button>
              <a href={adminHref} className="mx-auto mt-4 flex min-h-[44px] items-center justify-center text-[15px] text-mute hover:text-ink">Volver a ingresar</a>
            </form>
          )}

          {stage === 'resent' && (
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-field"><MailCheck size={24} strokeWidth={1.75} /></span>
              <h1 className={`mt-6 ${titleCls}`}>Revisa tu correo</h1>
              <p className="mt-2 text-[16px] text-mute">Si el correo está registrado, te enviamos un enlace. Revisa también la carpeta de spam.</p>
              <a href={adminHref} className="mt-8 flex w-full items-center justify-center rounded-lg border border-line-2 py-3.5 text-[16px] font-medium hover:border-ink">Volver a ingresar</a>
            </div>
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
