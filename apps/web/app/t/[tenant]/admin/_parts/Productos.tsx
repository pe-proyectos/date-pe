'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingBag, Plus, Search, X, TriangleAlert, PackagePlus, SlidersHorizontal, Pencil, Camera, Loader2, ImageOff, Archive, ArchiveRestore } from 'lucide-react';
import { useAdmin, soles } from './api';
import { PageHead, Btn, Field, inputCls, Empty, Skeleton, Switch } from './ui';
import { Sheet } from '@/components/Sheet';
import { StatTile } from '@/components/charts';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { uploadImage } from '@/lib/upload';
import { API_BASE_CLIENT } from '@/lib/config';

interface Product {
  id: string; name: string; sku: string | null; category: string | null; price_cents: number; cost_cents: number; stock: number; min_stock: number;
  commission_percent: number; photo_url: string | null; is_active: boolean; vendidos_30d: number;
}
interface Draft {
  id?: string; name: string; sku: string; category: string; price: string; cost: string; stock: string; minStock: string; commission: string; photoUrl: string | null; isActive: boolean;
}
type Filter = 'todos' | 'bajo' | 'inactivos';

/** Igual que useApi, pero un 403 se muestra como aviso en lugar de cerrar la sesión. */
function usePanel() {
  const { tenant, token, logout } = useAdmin();
  return useMemo(() => {
    const auth = { 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}` };
    async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
      const res = await fetch(`${API_BASE_CLIENT}/api${path}`, {
        method: init.method ?? 'GET',
        headers: { ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...auth },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (res.status === 401) {
        logout();
        throw new Error('no_autenticado');
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error ?? 'error'));
      return data as T;
    }
    return { api, uploadHeaders: { 'Content-Type': 'application/json', ...auth } };
  }, [tenant, token, logout]);
}

function toCents(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
const cleanAmount = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/^(\d*\.\d{0,2}).*$/, '$1');
const centsToInput = (c: number) => (c > 0 ? (c / 100).toFixed(2).replace(/\.00$/, '') : '');
const marginPct = (price: number, cost: number) => (price > 0 ? Math.round(((price - cost) / price) * 100) : 0);
const chipCls = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-medium transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`;
const moneyInput = `tnum ${inputCls} text-[16px]`;
const isLow = (p: Product) => p.is_active && p.stock <= p.min_stock;

const emptyDraft: Draft = { name: '', sku: '', category: '', price: '', cost: '', stock: '', minStock: '2', commission: '10', photoUrl: null, isActive: true };

function MoneyField({ label, value, onChange, hint, autoFocus }: { label: string; value: string; onChange: (v: string) => void; hint?: string; autoFocus?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
        <input autoFocus={autoFocus} inputMode="decimal" value={value} onChange={(e) => onChange(cleanAmount(e.target.value))} placeholder="0.00" className={`${moneyInput} pl-10`} />
      </div>
    </Field>
  );
}

export function Productos() {
  const { api, uploadHeaders } = usePanel();
  const [list, setList] = useState<Product[] | null>(null);
  const [filter, setFilter] = useState<Filter>('todos');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [stockFor, setStockFor] = useState<{ p: Product; mode: 'purchase' | 'adjust' } | null>(null);

  const load = useCallback(() => api<{ products: Product[] }>('/admin/products').then((d) => setList(d.products)).catch(() => setList([])), [api]);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => (list ?? []).filter((p) => p.is_active), [list]);
  const stats = useMemo(() => {
    const units = active.reduce((s, p) => s + Math.max(0, p.stock), 0);
    const value = active.reduce((s, p) => s + Math.max(0, p.stock) * p.cost_cents, 0);
    const revenue = active.reduce((s, p) => s + Math.max(0, p.stock) * p.price_cents, 0);
    const sold = active.reduce((s, p) => s + p.vendidos_30d * p.price_cents, 0);
    return { units, value, revenue, profit: revenue - value, low: active.filter(isLow).length, sold };
  }, [active]);
  const categories = useMemo(() => Array.from(new Set((list ?? []).map((p) => p.category).filter((c): c is string => !!c))).sort(), [list]);

  const shown = (list ?? []).filter((p) => {
    if (filter === 'inactivos' ? p.is_active : !p.is_active) return false;
    if (filter === 'bajo' && !isLow(p)) return false;
    const t = q.trim().toLowerCase();
    return !t || p.name.toLowerCase().includes(t) || (p.category ?? '').toLowerCase().includes(t) || (p.sku ?? '').toLowerCase().includes(t);
  });
  const inactiveCount = (list ?? []).length - active.length;

  const openEdit = (p?: Product) =>
    setEdit(
      p
        ? { id: p.id, name: p.name, sku: p.sku ?? '', category: p.category ?? '', price: centsToInput(p.price_cents), cost: centsToInput(p.cost_cents), stock: String(p.stock), minStock: String(p.min_stock), commission: String(p.commission_percent), photoUrl: p.photo_url, isActive: p.is_active }
        : { ...emptyDraft },
    );

  return (
    <>
      <PageHead
        title="Productos"
        sub="Lo que vendes en el local: stock, costo y ganancia. Se descuenta solo al cobrar en la caja."
        actions={<Btn onClick={() => { haptic.tap(); openEdit(); }}><Plus size={16} strokeWidth={2} /> Agregar producto</Btn>}
      />

      {!list ? (
        <Skeleton rows={5} />
      ) : list.length === 0 ? (
        <Empty
          icon={ShoppingBag}
          title="Aún no tienes productos"
          body="Agrega ceras, aceites o shampoos que vendes. Al cobrarlos en la caja se descuenta el stock y te avisamos cuando queden pocos."
          action={<Btn onClick={() => openEdit()}><Plus size={16} strokeWidth={2} /> Agregar el primero</Btn>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Valor del inventario" value={soles(stats.value)} sub={`${stats.units} unidades al costo`} />
            <StatTile label="Venta potencial" value={soles(stats.revenue)} sub={`Ganarías ${soles(stats.profit)}`} />
            <StatTile label="Vendido en 30 días" value={soles(stats.sold)} sub="Al precio actual" />
            <StatTile label="Stock bajo" value={String(stats.low)} sub={stats.low ? 'Toca el filtro para verlos' : 'Todo en orden'} />
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="radiogroup" aria-label="Filtro">
              {([['todos', 'Todos', active.length], ['bajo', 'Stock bajo', stats.low], ['inactivos', 'Inactivos', inactiveCount]] as const).map(([id, label, n]) => (
                <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => { haptic.select(); setFilter(id); }} className={chipCls(filter === id)}>
                  {id === 'bajo' && <TriangleAlert size={15} strokeWidth={1.75} />} {label} <span className="tnum opacity-60">{n}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-line-2 px-4 focus-within:border-ink md:w-72">
              <Search size={17} strokeWidth={1.75} className="text-mute" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto" className="min-h-11 w-full bg-transparent text-[16px] outline-none md:text-[15px]" aria-label="Buscar producto" />
              {q && <button type="button" onClick={() => setQ('')} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-field" aria-label="Borrar búsqueda"><X size={16} strokeWidth={1.75} /></button>}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="mt-8 text-[15px] text-mute">{filter === 'bajo' ? 'Ningún producto con stock bajo.' : filter === 'inactivos' ? 'No hay productos inactivos.' : 'Sin resultados.'}</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-line border-y border-line md:hidden">
                {shown.map((p) => (
                  <li key={p.id} className="py-3">
                    <button type="button" onClick={() => openEdit(p)} className="flex w-full items-center gap-3 text-left">
                      <Thumb url={p.photo_url} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-medium ${p.is_active ? '' : 'text-soft'}`}>{p.name}</span>
                        <span className="block truncate text-[13px] text-mute">{[p.category, `${marginPct(p.price_cents, p.cost_cents)}% margen`, `${p.vendidos_30d} vendidos en 30 días`].filter(Boolean).join(', ')}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tnum block font-medium">{soles(p.price_cents)}</span>
                        <StockBadge p={p} />
                      </span>
                    </button>
                    {p.is_active && (
                      <div className="mt-2.5 flex gap-2 pl-[60px]">
                        <button type="button" onClick={() => setStockFor({ p, mode: 'purchase' })} className="flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 text-[14px] font-medium hover:border-ink"><PackagePlus size={15} strokeWidth={1.75} /> Entrada</button>
                        <button type="button" onClick={() => setStockFor({ p, mode: 'adjust' })} className="flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 text-[14px] font-medium hover:border-ink"><SlidersHorizontal size={15} strokeWidth={1.75} /> Ajuste</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-ink text-[13px] text-mute">
                      <th className="py-3 pr-4 font-medium">Producto</th>
                      <th className="py-3 pr-4 text-right font-medium">Precio</th>
                      <th className="py-3 pr-4 text-right font-medium">Costo</th>
                      <th className="py-3 pr-4 text-right font-medium">Margen</th>
                      <th className="py-3 pr-4 text-right font-medium">Stock</th>
                      <th className="py-3 pr-4 text-right font-medium">Vendidos 30 días</th>
                      <th className="py-3 font-medium"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => {
                      const m = marginPct(p.price_cents, p.cost_cents);
                      return (
                        <tr key={p.id} className="border-b border-line">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <Thumb url={p.photo_url} />
                              <div className="min-w-0">
                                <div className={`truncate font-medium ${p.is_active ? '' : 'text-soft'}`}>{p.name}</div>
                                <div className="text-[13px] text-mute">{[p.category, p.sku].filter(Boolean).join(', ') || 'Sin categoría'}{p.is_active ? '' : ', inactivo'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="tnum py-3 pr-4 text-right">{soles(p.price_cents)}</td>
                          <td className="tnum py-3 pr-4 text-right text-mute">{soles(p.cost_cents)}</td>
                          <td className={`tnum py-3 pr-4 text-right ${m < 20 ? 'text-red-deep' : ''}`}>{m}%</td>
                          <td className="py-3 pr-4 text-right"><StockBadge p={p} /></td>
                          <td className="tnum py-3 pr-4 text-right">{p.vendidos_30d}</td>
                          <td className="py-3">
                            <div className="flex justify-end gap-1">
                              {p.is_active && (
                                <>
                                  <button type="button" onClick={() => setStockFor({ p, mode: 'purchase' })} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field" aria-label={`Entrada de mercadería de ${p.name}`} title="Entrada de mercadería"><PackagePlus size={17} strokeWidth={1.75} /></button>
                                  <button type="button" onClick={() => setStockFor({ p, mode: 'adjust' })} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field" aria-label={`Ajustar stock de ${p.name}`} title="Ajuste"><SlidersHorizontal size={17} strokeWidth={1.75} /></button>
                                </>
                              )}
                              <button type="button" onClick={() => openEdit(p)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field" aria-label={`Editar ${p.name}`} title="Editar"><Pencil size={16} strokeWidth={1.75} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <EditSheet api={api} uploadHeaders={uploadHeaders} draft={edit} setDraft={setEdit} categories={categories} onSaved={load} />
      <StockSheet api={api} target={stockFor} onClose={() => setStockFor(null)} onSaved={load} />
    </>
  );
}

function Thumb({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-field object-cover" />
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-field text-soft"><ShoppingBag size={18} strokeWidth={1.5} /></span>
  );
}

function StockBadge({ p }: { p: Product }) {
  if (!p.is_active) return <span className="tnum text-[13px] text-soft">{p.stock} u.</span>;
  if (p.stock <= 0) return <span className="inline-flex rounded-full bg-red-tint px-2.5 py-1 text-[12px] font-medium text-red-deep">Agotado</span>;
  if (isLow(p)) return <span className="tnum inline-flex items-center gap-1 rounded-full bg-red-tint px-2.5 py-1 text-[12px] font-medium text-red-deep"><TriangleAlert size={12} strokeWidth={2} /> Quedan {p.stock}</span>;
  return <span className="tnum text-[14px]">{p.stock} u.</span>;
}

function EditSheet({ api, uploadHeaders, draft, setDraft, categories, onSaved }: { api: ReturnType<typeof usePanel>['api']; uploadHeaders: Record<string, string>; draft: Draft | null; setDraft: (d: Draft | null) => void; categories: string[]; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const d = draft;
  const set = (patch: Partial<Draft>) => d && setDraft({ ...d, ...patch });
  const price = toCents(d?.price ?? '');
  const cost = toCents(d?.cost ?? '');

  async function onFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file, 'products', uploadHeaders);
      set({ photoUrl: url });
    } catch {
      toast.error('No se pudo subir la foto. Usa JPG, PNG o WebP.');
    } finally {
      setUploading(false);
    }
  }
  async function save() {
    if (!d || !d.name.trim() || price <= 0) return;
    setBusy(true);
    const body = {
      name: d.name.trim(),
      sku: d.sku.trim() || null,
      category: d.category.trim() || null,
      priceCents: price,
      costCents: cost,
      minStock: Math.max(0, Number(d.minStock) || 0),
      commissionPercent: Math.min(100, Math.max(0, Number(d.commission) || 0)),
      photoUrl: d.photoUrl,
    };
    try {
      if (d.id) await api(`/admin/products/${d.id}`, { method: 'PATCH', body: { ...body, isActive: d.isActive } });
      else await api('/admin/products', { method: 'POST', body: { ...body, stock: Math.max(0, Number(d.stock) || 0) } });
      toast.success(d.id ? 'Producto guardado' : 'Producto agregado');
      onSaved();
      setDraft(null);
    } catch {
      toast.error('No se pudo guardar el producto.');
    } finally {
      setBusy(false);
    }
  }
  async function toggleActive() {
    if (!d?.id) return;
    const deactivate = d.isActive;
    if (deactivate && !confirm(`¿Desactivar ${d.name}? Deja de aparecer en la caja, pero se guarda su historial.`)) return;
    setBusy(true);
    try {
      if (deactivate) await api(`/admin/products/${d.id}`, { method: 'DELETE' });
      else await api(`/admin/products/${d.id}`, { method: 'PATCH', body: { isActive: true } });
      toast.success(deactivate ? 'Producto desactivado' : 'Producto activado');
      onSaved();
      setDraft(null);
    } catch {
      toast.error('No se pudo cambiar el estado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!d}
      onClose={() => setDraft(null)}
      title={d?.id ? 'Editar producto' : 'Nuevo producto'}
      footer={
        <>
          {d?.id && (
            <Btn variant={d.isActive ? 'danger' : 'secondary'} onClick={toggleActive} disabled={busy} className="mr-auto">
              {d.isActive ? <><Archive size={16} strokeWidth={1.75} /> Desactivar</> : <><ArchiveRestore size={16} strokeWidth={1.75} /> Activar</>}
            </Btn>
          )}
          <Btn variant="ghost" onClick={() => setDraft(null)}>Cancelar</Btn>
          <Btn busy={busy} disabled={!d?.name.trim() || price <= 0 || uploading} onClick={save}>Guardar</Btn>
        </>
      }
    >
      {d && (
        <div className="space-y-5">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-field text-soft hover:text-ink" aria-label="Cambiar foto">
              {uploading ? <Loader2 size={22} className="animate-spin" /> : d.photoUrl ? <img src={d.photoUrl} alt="" className="h-full w-full object-cover" /> : <Camera size={24} strokeWidth={1.5} />}
            </button>
            <div className="text-[14px] text-mute">
              <p>Una foto clara ayuda a encontrarlo rápido en la caja.</p>
              <button type="button" onClick={() => fileRef.current?.click()} className="mt-1 min-h-10 font-medium text-ink underline underline-offset-4">{d.photoUrl ? 'Cambiar foto' : 'Subir foto'}</button>
              {!d.photoUrl && !uploading && <span className="flex items-center gap-1 text-[13px] text-soft"><ImageOff size={13} strokeWidth={1.75} /> Sin foto</span>}
            </div>
          </div>

          <Field label="Nombre"><input autoFocus={!d.id} value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="Ej. Cera mate" className={`${inputCls} text-[16px]`} /></Field>

          <div>
            <Field label="Categoría"><input value={d.category} onChange={(e) => set({ category: e.target.value })} maxLength={60} placeholder="Ej. Styling" className={`${inputCls} text-[16px]`} /></Field>
            {categories.length > 0 && (
              <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1">
                {categories.map((c) => <button key={c} type="button" onClick={() => set({ category: c })} className={`${chipCls(d.category === c)} min-h-9 px-3 text-[14px]`}>{c}</button>)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MoneyField label="Precio de venta" value={d.price} onChange={(v) => set({ price: v })} />
            <MoneyField label="Costo" value={d.cost} onChange={(v) => set({ cost: v })} hint="Lo que te cuesta a ti" />
          </div>
          {price > 0 && (
            <p className={`rounded-xl px-4 py-3 text-[14px] ${price <= cost ? 'bg-red-tint text-red-deep' : 'bg-field'}`}>
              {price <= cost ? 'El precio no cubre el costo.' : <>Ganas <strong className="tnum font-semibold">{soles(price - cost)}</strong> por unidad, <span className="tnum">{marginPct(price, cost)}%</span> de margen.</>}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {!d.id && (
              <Field label="Stock inicial"><input inputMode="numeric" value={d.stock} onChange={(e) => set({ stock: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="0" className={moneyInput} /></Field>
            )}
            <Field label="Avisar cuando queden" hint="Stock mínimo"><input inputMode="numeric" value={d.minStock} onChange={(e) => set({ minStock: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={moneyInput} /></Field>
            <Field label="Comisión del barbero" hint="% de cada venta">
              <div className="relative">
                <input inputMode="numeric" value={d.commission} onChange={(e) => set({ commission: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={`${moneyInput} pr-9`} />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">%</span>
              </div>
            </Field>
          </div>

          <Field label="Código o SKU (opcional)"><input value={d.sku} onChange={(e) => set({ sku: e.target.value })} maxLength={40} className={`tnum ${inputCls} text-[16px]`} /></Field>

          {d.id && (
            <div className="flex items-center justify-between gap-4 border-t border-line pt-5">
              <span className="text-[15px]">Visible en la caja</span>
              <Switch checked={d.isActive} onChange={(v) => set({ isActive: v })} label="Visible en la caja" states={['Activo', 'Inactivo']} />
            </div>
          )}
          {d.id && <p className="text-[13px] text-soft">El stock se cambia con Entrada de mercadería o Ajuste, así queda el historial.</p>}
        </div>
      )}
    </Sheet>
  );
}

function StockSheet({ api, target, onClose, onSaved }: { api: ReturnType<typeof usePanel>['api']; target: { p: Product; mode: 'purchase' | 'adjust' } | null; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'purchase' | 'adjust'>('purchase');
  const [qty, setQty] = useState('');
  const [real, setReal] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) return;
    setMode(target.mode);
    setQty('');
    setReal(String(target.p.stock));
    setCost('');
    setNote('');
  }, [target]);
  const p = target?.p;
  const delta = !p ? 0 : mode === 'purchase' ? Number(qty) || 0 : (Number(real) || 0) - p.stock;

  async function save() {
    if (!p || delta === 0) return;
    setBusy(true);
    try {
      const r = await api<{ stock: number }>(`/admin/products/${p.id}/stock`, {
        method: 'POST',
        body: { delta, reason: mode, note: note.trim() || undefined, costCents: mode === 'purchase' && toCents(cost) ? toCents(cost) : undefined },
      });
      toast.success(`Stock actualizado: ${r.stock} u.`);
      onSaved();
      onClose();
    } catch {
      toast.error('No se pudo actualizar el stock.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      title={p?.name ?? 'Stock'}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn busy={busy} disabled={delta === 0} onClick={save}>{mode === 'purchase' ? `Sumar ${Math.max(0, delta)}` : 'Guardar ajuste'}</Btn></>}
    >
      {p && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('purchase')} className={`${chipCls(mode === 'purchase')} min-h-12`}><PackagePlus size={17} strokeWidth={1.75} /> Entrada</button>
            <button type="button" onClick={() => setMode('adjust')} className={`${chipCls(mode === 'adjust')} min-h-12`}><SlidersHorizontal size={17} strokeWidth={1.75} /> Ajuste</button>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-field px-4 py-3 text-[15px]">
            <span className="text-mute">Stock actual</span>
            <span className="tnum font-semibold">{p.stock} u.{delta !== 0 && <span className="ml-2 font-normal text-mute">pasará a {p.stock + delta}</span>}</span>
          </div>

          {mode === 'purchase' ? (
            <>
              <Field label="Unidades que llegaron">
                <input autoFocus inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="0" className={`${moneyInput} text-[20px]`} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {[6, 12, 24].map((n) => <button key={n} type="button" onClick={() => { haptic.select(); setQty(String(n)); }} className={chipCls(qty === String(n))}>{n}</button>)}
              </div>
              <MoneyField label="Nuevo costo por unidad (opcional)" value={cost} onChange={setCost} hint={`Hoy: ${soles(p.cost_cents)}. Déjalo vacío si no cambió.`} />
            </>
          ) : (
            <>
              <Field label="¿Cuántas hay realmente?" hint="Cuenta lo que hay en el estante. Calculamos la diferencia.">
                <input autoFocus inputMode="numeric" value={real} onChange={(e) => setReal(e.target.value.replace(/\D/g, '').slice(0, 5))} className={`${moneyInput} text-[20px]`} />
              </Field>
              {delta !== 0 && (
                <p className={`tnum rounded-xl px-4 py-3 text-[14px] ${delta < 0 ? 'bg-red-tint text-red-deep' : 'bg-ok-tint text-ok'}`}>
                  {delta < 0 ? `Faltan ${-delta} u., unos ${soles(-delta * p.cost_cents)} al costo.` : `Sobran ${delta} u.`}
                </p>
              )}
            </>
          )}

          <Field label="Nota (opcional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder={mode === 'purchase' ? 'Ej. Proveedor, factura 123' : 'Ej. Merma, uso interno'} className={`${inputCls} text-[16px]`} />
          </Field>
          {mode === 'adjust' && (
            <div className="flex flex-wrap gap-2">
              {['Conteo', 'Merma', 'Uso interno', 'Regalo a cliente'].map((s) => <button key={s} type="button" onClick={() => setNote(s)} className={chipCls(note === s)}>{s}</button>)}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
