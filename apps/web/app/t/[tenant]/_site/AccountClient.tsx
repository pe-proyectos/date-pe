'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, CalendarClock, RotateCcw, Award, Package, LogOut, ChevronRight, Gift, Smartphone, WifiOff, MapPin, Scissors, X } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { useInstall, openInstall } from '@/lib/install';
import { NotifyMe } from './NotifyMe';
import { PullRefresh } from '@/components/PullRefresh';
import { SiteSheet } from './SiteSheet';

interface Appt { can_cancel?: boolean; can_reschedule?: boolean; cancel_window_hours?: number; id: string; starts_at: string; status: string; price_cents: number; manage_token: string; staff_id: string | null; staff_name: string | null; staff_photo: string | null; services: string | null; service_id: string | null; location_name: string | null }
interface Account {
  email: string; name: string | null; points: number; referralCode: string | null;
  upcoming: Appt[]; past: Appt[];
  packages: Array<{ id: string; name: string; uses_left: number; uses_total: number; expires_at: string | null }>;
  memberships: Array<{ id: string; name: string; ends_at: string }>;
  rewards: Array<{ id: string; name: string; points_cost: number; available: boolean }>;
  packagesForSale?: number;
}

const STATUS: Record<string, string> = { pending: 'Adelanto por confirmar', confirmed: 'Confirmada', completed: 'Atendida', no_show: 'No asistió', cancelled: 'Cancelada' };

/** Cuenta del cliente: entra con un código al correo, sin contraseña. */
export function AccountClient({ tenant, shop, tz, whatsapp }: { tenant: string; shop: string; tz: string; whatsapp: string | null }) {
  const key = `datepe_cuenta_${tenant}`;
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [acc, setAcc] = useState<Account | null>(null);
  const [login, setLogin] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [sel, setSel] = useState<Appt | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reward, setReward] = useState<Account['rewards'][number] | null>(null);
  const inst = useInstall();
  const headers = { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant };

  // Sin señal se muestra lo último guardado en este celular
  const load = useCallback(async (t: string) => {
    try {
      const r = await fetch(`${API_BASE_CLIENT}/api/public/account`, { headers: { 'X-Tenant-Slug': tenant, Authorization: `Bearer ${t}` } });
      if (r.status === 401) {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}_data`);
        setToken(null);
        return;
      }
      if (!r.ok) throw new Error();
      const d = (await r.json()) as Account;
      localStorage.setItem(`${key}_data`, JSON.stringify(d));
      setAcc(d);
      setStale(false);
    } catch {
      const cached = localStorage.getItem(`${key}_data`);
      if (cached) {
        setAcc(JSON.parse(cached) as Account);
        setStale(true);
      } else toast.error('Sin conexión. Intenta de nuevo cuando vuelva la señal.');
    }
  }, [tenant, key]);

  useEffect(() => {
    const t = localStorage.getItem(key);
    setToken(t);
    if (t) load(t).catch(() => {});
    try {
      const c = JSON.parse(localStorage.getItem('datepe_cliente') ?? 'null') as { email?: string } | null;
      if (c?.email) setLogin(c.email);
    } catch { /* sin datos */ }
  }, [key, load]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim()) return toast.error('Escribe tu celular, tu correo o tu DNI.');
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_CLIENT}/api/public/account/code`, { method: 'POST', headers, body: JSON.stringify({ login: login.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (d.error === 'demasiados_intentos') {
        toast.error('Pediste muchos códigos. Intenta de nuevo en un rato.');
        return;
      }
      if (d.error === 'dato_invalido') {
        toast.error('Revisa el dato: celular de 9 dígitos, correo o DNI.');
        return;
      }
      if (d.error === 'sin_correo') {
        toast.error('No encontramos una reserva con ese dato. Prueba con el correo con el que reservaste.');
        return;
      }
      if (!r.ok) throw new Error();
      haptic.success();
      setSentTo(d.sentTo ?? 'tu correo');
      setStep('code');
      toast.success(d.recent ? `Ya te enviamos un código hace un momento a ${d.sentTo}.` : `Te enviamos un código de 6 dígitos a ${d.sentTo}.`);
    } catch {
      toast.error('No pudimos enviar el código. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return toast.error('El código tiene 6 dígitos.');
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_CLIENT}/api/public/account/verify`, { method: 'POST', headers, body: JSON.stringify({ login: login.trim(), code: code.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      localStorage.setItem(key, d.token);
      setToken(d.token);
      haptic.success();
      await load(d.token);
    } catch {
      haptic.error();
      toast.error('Ese código no es correcto o ya venció.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(x: Appt) {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_CLIENT}/api/public/booking/cancel`, { method: 'POST', headers, body: JSON.stringify({ t: x.manage_token, reason: 'Desde Mi cuenta' }) });
      const d = await r.json().catch(() => ({}));
      if (d.error === 'fuera_de_plazo') {
        toast.error(`Ya no se puede cancelar en línea (hasta ${d.hours} horas antes). Escríbele a la barbería.`);
        return;
      }
      if (!r.ok) throw new Error();
      haptic.success();
      toast.success('Listo, cancelamos tu cita.');
      setSel(null);
      if (token) await load(token);
    } catch {
      toast.error('No pudimos cancelar. Intenta de nuevo.');
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  function logout() {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}_data`);
    setToken(null);
    setAcc(null);
    setStep('email');
    setCode('');
  }

  const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto max-w-[880px] px-5 pb-24 pt-[calc(6.5rem+env(safe-area-inset-top))] md:px-10 md:pt-36">{children}</main>
  );

  if (token === undefined || (token && !acc)) return shell(<div className="flex justify-center py-24"><Loader2 className="s-mute animate-spin" /></div>);

  if (!token) {
    return shell(
      <div className="mx-auto max-w-md">
        <p className="s-eyebrow">{shop}</p>
        <h1 className="s-display mt-4 text-[clamp(3rem,10vw,5rem)]">Mi <em>cuenta</em></h1>
        <p className="s-mute mt-4 text-[17px] leading-relaxed">Tus citas, tus puntos y tus paquetes en un solo lugar. Entra con tu celular, tu correo o tu DNI, sin contraseña.</p>
        {step === 'email' ? (
          <form onSubmit={sendCode} className="mt-8">
            <label className="block">
              <span className="mb-2 block text-[15px] font-semibold">Tu celular, correo o DNI</span>
              <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} required placeholder="987 654 321, tucorreo@gmail.com o DNI" className="s-surface s-line h-14 w-full rounded-2xl border px-5 text-[17px] outline-none focus:border-[var(--s-ink)]" />
              <span className="s-mute mt-2 block text-[14px]">Te enviamos un código al correo con el que reservaste. Sin contraseña.</span>
            </label>
            <button disabled={busy} className="s-btn mt-5 w-full">{busy ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} strokeWidth={1.75} />} Enviarme un código</button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-8">
            <label className="block">
              <span className="mb-2 block text-[15px] font-semibold">Código que llegó a {sentTo}</span>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000" className="s-surface s-line tnum h-16 w-full rounded-2xl border px-5 text-center text-[28px] tracking-[0.4em] outline-none focus:border-[var(--s-ink)]" />
            </label>
            <button disabled={busy} className="s-btn mt-5 w-full">{busy && <Loader2 size={18} className="animate-spin" />} Entrar</button>
            <button type="button" onClick={() => setStep('email')} className="s-mute mt-4 min-h-11 w-full text-[15px] underline underline-offset-4">Usar otro dato</button>
          </form>
        )}
      </div>,
    );
  }

  const a = acc!;
  const last = a.past.find((p) => p.status === 'completed' && p.service_id);
  const nextReward = a.rewards.find((r) => !r.available);
  return shell(
    <>
      <PullRefresh onRefresh={() => load(token)} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="s-eyebrow">{shop}</p>
          <h1 className="s-display mt-4 text-[clamp(2.8rem,9vw,4.6rem)]">Hola{a.name ? `, ${a.name.split(' ')[0]}` : ''}</h1>
          <p className="s-mute mt-2 truncate text-[15px]">{a.email}</p>
        </div>
        <button type="button" onClick={logout} className="s-chip shrink-0"><LogOut size={16} strokeWidth={1.75} /> Salir</button>
      </div>

      {stale && (
        <p className="s-surface s-radius mt-6 flex items-center gap-3 p-4 text-[14px]"><WifiOff size={17} strokeWidth={1.75} className="shrink-0" /> Sin conexión: ves lo último guardado en este celular.</p>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {last ? (
          <Link href={`/reservar?servicio=${last.service_id}${last.staff_id ? `&barbero=${last.staff_id}` : ''}`} className="s-radius flex min-h-[120px] flex-col justify-between p-6 transition-transform active:scale-[0.99]" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            <RotateCcw size={22} strokeWidth={1.75} />
            <span>
              <span className="block text-[13px] font-semibold uppercase tracking-[0.12em] opacity-80">Repetir mi último corte</span>
              <span className="mt-1 block text-[18px] font-semibold">{last.services}{last.staff_name ? ` con ${last.staff_name}` : ''}</span>
            </span>
          </Link>
        ) : (
          <Link href="/reservar" className="s-radius flex min-h-[120px] flex-col justify-between p-6" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            <CalendarClock size={22} strokeWidth={1.75} />
            <span className="text-[18px] font-semibold">Reservar una cita</span>
          </Link>
        )}
        <div className="s-surface s-radius flex min-h-[120px] flex-col justify-between p-6">
          <Award size={22} strokeWidth={1.75} className="s-mute" />
          <span>
            <span className="s-display tnum block text-[40px] leading-none">{a.points} <span className="text-[18px]">puntos</span></span>
            {nextReward && <span className="s-mute mt-1 block text-[14px]">Te faltan {nextReward.points_cost - a.points} para: {nextReward.name}</span>}
          </span>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="s-display text-[32px]">Próximas citas</h2>
        {a.upcoming.length === 0 ? (
          <p className="s-mute mt-3 text-[16px]">No tienes citas por venir.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {a.upcoming.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => { haptic.tap(); setConfirmCancel(false); setSel(x); }} className="s-surface s-radius flex w-full items-center gap-4 p-5 text-left transition-transform active:scale-[0.99]">
                  {x.staff_photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.staff_photo} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                  ) : <CalendarClock size={24} strokeWidth={1.5} className="s-mute shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold first-letter:uppercase">{when(x.starts_at)}</span>
                    <span className="s-mute block truncate text-[14px]">{x.services}{x.staff_name ? `, con ${x.staff_name}` : ''}{x.location_name ? `, ${x.location_name}` : ''}</span>
                    <span className="mt-1 block text-[13px] font-semibold">{STATUS[x.status] ?? x.status}. Toca para ver, cambiar o cancelar</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.6} className="s-mute shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 space-y-3">
        <NotifyMe tenant={tenant} accountToken={token} />
        {inst.ready && !inst.standalone && !inst.inApp && (inst.canPrompt || inst.ios) && (
          <button type="button" onClick={() => openInstall('app')} className="s-line s-radius flex min-h-[64px] w-full items-center gap-4 border px-4 text-left transition-transform active:scale-[0.99]">
            <Smartphone size={20} strokeWidth={1.6} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold">Instalar {shop} en tu celular</span>
              <span className="s-mute block text-[14px]">Ábrela como una app desde tu pantalla de inicio.</span>
            </span>
            <ChevronRight size={18} strokeWidth={1.6} className="s-mute shrink-0" />
          </button>
        )}
      </section>

      {a.rewards.length > 0 && (
        <section className="mt-12">
          <h2 className="s-display text-[32px]">Tus premios</h2>
          <ul className="mt-4 space-y-3">
            {a.rewards.map((r) => (
              <li key={r.id} className="s-line s-radius flex items-center gap-4 border p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold">{r.name}</span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--s-line)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (a.points / r.points_cost) * 100)}%`, background: 'var(--accent)' }} />
                  </span>
                  <span className="s-mute tnum mt-1.5 block text-[13px]">{Math.min(a.points, r.points_cost)} de {r.points_cost} puntos</span>
                </span>
                {r.available ? (
                  <button type="button" onClick={() => { haptic.tap(); setReward(r); }} className="min-h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>Canjear</button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(a.packages.length > 0 || a.memberships.length > 0 || !!a.packagesForSale) && (
        <section className="mt-12">
          <h2 className="s-display text-[32px]">Paquetes y membresías</h2>
          {a.packages.length === 0 && a.memberships.length === 0 && <p className="s-mute mt-3 text-[16px]">Paga varios cortes juntos y ahorra en cada visita.</p>}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 empty:hidden">
            {a.packages.map((p) => (
              <li key={p.id} className="s-line s-radius border p-5">
                <Package size={20} strokeWidth={1.6} className="s-mute" />
                <p className="mt-3 text-[17px] font-semibold">{p.name}</p>
                <p className="s-mute text-[14px]">Te quedan {p.uses_left} de {p.uses_total}{p.expires_at ? `, vence el ${new Date(p.expires_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: tz })}` : ''}</p>
              </li>
            ))}
            {a.memberships.map((m) => (
              <li key={m.id} className="s-line s-radius border p-5">
                <Award size={20} strokeWidth={1.6} className="s-mute" />
                <p className="mt-3 text-[17px] font-semibold">{m.name}</p>
                <p className="s-mute text-[14px]">Activa hasta el {new Date(m.ends_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: tz })}</p>
              </li>
            ))}
          </ul>
          {!!a.packagesForSale && (
            <Link href="/regalos?tipo=paquetes" className="s-chip mt-4"><Package size={16} strokeWidth={1.75} /> {a.packages.length ? 'Comprar otro paquete' : 'Ver paquetes de cortes'}</Link>
          )}
        </section>
      )}

      {a.past.length > 0 && (
        <section className="mt-12">
          <h2 className="s-display text-[32px]">Historial</h2>
          <ul className="s-divide mt-4">
            {a.past.map((x) => (
              <li key={x.id} className="flex items-center gap-4 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium first-letter:uppercase">{new Date(x.starts_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz })}</span>
                  <span className="s-mute block truncate text-[14px]">{x.services}{x.staff_name ? `, con ${x.staff_name}` : ''}. {STATUS[x.status] ?? x.status}</span>
                </span>
                {x.service_id && x.status === 'completed' && (
                  <Link href={`/reservar?servicio=${x.service_id}${x.staff_id ? `&barbero=${x.staff_id}` : ''}`} className="s-chip shrink-0"><RotateCcw size={15} strokeWidth={1.75} /> Repetir</Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.referralCode && (
        <section className="s-surface s-radius mt-12 flex items-start gap-4 p-6">
          <Gift size={22} strokeWidth={1.6} className="s-mute mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[17px] font-semibold">Invita a un amigo</p>
            <p className="s-mute mt-1 text-[15px]">Comparte tu código <b className="s-ink tnum">{a.referralCode}</b>: tu amigo tiene descuento en su primera cita y tú sumas puntos.</p>
          </div>
        </section>
      )}

      <SiteSheet open={!!sel} onClose={() => setSel(null)} title="Tu cita">
        {sel && (
          <>
            <p className="s-display text-[30px] leading-[1.08] first-letter:uppercase">{when(sel.starts_at)}</p>
            <ul className="mt-5 space-y-3 text-[16px]">
              <li className="flex items-center gap-3"><Scissors size={18} strokeWidth={1.6} className="s-mute shrink-0" /> {sel.services}</li>
              {sel.staff_name && (
                <li className="flex items-center gap-3">
                  {sel.staff_photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sel.staff_photo} alt="" className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />
                  ) : <CalendarClock size={18} strokeWidth={1.6} className="s-mute shrink-0" />}
                  Con {sel.staff_name}
                </li>
              )}
              {sel.location_name && <li className="flex items-center gap-3"><MapPin size={18} strokeWidth={1.6} className="s-mute shrink-0" /> {sel.location_name}</li>}
              <li className="s-mute text-[14px]">{STATUS[sel.status] ?? sel.status}. Código {sel.id.slice(0, 8).toUpperCase()}</li>
            </ul>
            <div className="mt-6 grid gap-3">
              {sel.can_reschedule !== false && (
                <Link href={`/cita?t=${sel.manage_token}&cambiar=1`} className="s-btn w-full"><CalendarClock size={18} strokeWidth={1.75} /> Cambiar la hora</Link>
              )}
              {sel.can_cancel === false ? (
                <p className="s-surface s-radius p-4 text-[15px] leading-snug">
                  Falta poco para tu cita: solo se puede cambiar o cancelar en línea hasta {sel.cancel_window_hours} horas antes.{' '}
                  {whatsapp ? <a href={`https://wa.me/${whatsapp.replace(/\D/g, '').replace(/^9/, '519')}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">Escríbele a la barbería</a> : 'Comunícate con la barbería.'}
                </p>
              ) : confirmCancel ? (
                <div className="s-line s-radius border p-4">
                  <p className="text-[16px] font-semibold">¿Cancelar esta cita?</p>
                  <p className="s-mute mt-1 text-[14px]">El horario queda libre para otro cliente.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmCancel(false)} className="s-chip justify-center">No, volver</button>
                    <button type="button" disabled={busy} onClick={() => cancel(sel)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#b42318] px-4 text-[15px] font-semibold text-white disabled:opacity-60">
                      {busy && <Loader2 size={16} className="animate-spin" />} Sí, cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { haptic.tap(); setConfirmCancel(true); }} className="s-mute inline-flex min-h-12 items-center justify-center gap-2 text-[15px] font-medium underline underline-offset-4">
                  <X size={16} strokeWidth={1.75} /> Cancelar la cita
                </button>
              )}
            </div>
          </>
        )}
      </SiteSheet>

      <SiteSheet open={!!reward} onClose={() => setReward(null)} title="Canjear premio">
        {reward && (
          <>
            <p className="s-display text-[30px] leading-[1.08]">{reward.name}</p>
            <p className="s-mute mt-3 text-[16px] leading-relaxed">
              En tu próxima visita, antes de pagar, dile a tu barbero que quieres canjear este premio. Se descuentan <b className="s-ink">{reward.points_cost} puntos</b> de tu cuenta.
            </p>
            <div className="s-surface s-radius mt-5 p-5 text-center">
              <p className="s-mute text-[13px] font-semibold uppercase tracking-[0.12em]">Muestra esto en caja</p>
              <p className="tnum mt-2 text-[22px] font-semibold">{a.name ?? a.email}</p>
              <p className="s-mute tnum mt-1 text-[15px]">{a.points} puntos disponibles</p>
            </div>
            <Link href="/reservar" className="s-btn mt-5 w-full">Reservar mi próxima visita</Link>
          </>
        )}
      </SiteSheet>
    </>,
  );
}
