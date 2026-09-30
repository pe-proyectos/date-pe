# API fase A y B (contrato para el frontend)

Rutas bajo `/api`. Panel: `useApi` en `app/t/[tenant]/admin/_parts/api.ts` (pone token y `X-Tenant-Slug`). Público: `X-Tenant-Slug` o `?tenant=`. Montos en céntimos. Hora de Lima (UTC-5 fijo).
Tiempo real: WebSocket `wss://date.pe/api/ws?tenant=<slug>` recibe `{ type, data }` con `type` en: `queue_changed` (data.announce = { number, name, staff } cuando se llama a alguien), `config_changed`, `sale_created`, `sale_voided`, `cash_changed`, `availability_changed`. Al recibir, volver a pedir el estado.
Subidas: `uploadImage(file, folder, headers)` de `lib/upload.ts` con carpetas `staff|services|branding|gallery|clients|products|receipts|expenses|tv` (PDF solo en receipts y expenses; las fotos se comprimen solas).
Push: `lib/push.ts` `subscribePush(publicKey)` usa `/sw.js` (ya existe, no editar).

## Funciones activables y configuración (owner/manager)
- `GET /admin/features` -> `{ features, tv, queue, pos, marketing, googleReviewUrl, whatsappReady, pushReady }`
- `PUT /admin/features` `{ features?: {clave: bool}, tv?: {...}, queue?: {...}, pos?: {...}, marketing?: {...}, googleReviewUrl? }` (merge parcial; la TV se actualiza sola)
- features: `booking, queue, tv, pos, tips, products, expenses, payroll, packages, rewards, giftcards_online, memberships_sale, marketing, client_photos, push, whatsapp`
- tv: `theme 'dark'|'light'|'brand', layout 'split'|'queue'|'minimal', showQueue, showAppointments, showQr, showClock, showPromos, announceVoice, chime, message, promos [{title,text?,image?}], backgroundUrl, scale`
- queue: `maxWaiting, askPhone, allowStaffChoice, noShowMinutes, fallbackMinutes, earlyMinutes, welcome, closedMessage`
- pos: `tipPresets [0,10,15,20], methods [...], requireSession, askReceipt`
- marketing: `birthdayEnabled, birthdayDiscountPercent, winbackEnabled, winbackDays, winbackDiscountPercent, membershipRenewReminder`
- `GET /admin/me` -> `{ me: { id, name, email, role: owner|manager|cashier|staff, staffId }, features, pushPublicKey }` (usar para armar el menú por rol)
- `POST /admin/push/subscribe` (cuerpo = PushSubscriptionJSON) · `POST /admin/push/unsubscribe { endpoint }`

## Equipo con cuentas (owner/manager)
- `GET /admin/team` -> `{ members: [{ user_id, name, email, role, staff_id, staff_name }], invites: [{ email, role, staff_name, expires_at }] }`
- `POST /admin/team/invite { email, role: manager|cashier|staff, staffId? }` (staff requiere staffId) -> `{ ok, url }` (409 `ya_es_parte_del_equipo`)
- `PATCH /admin/team/:userId { role?, staffId? }` · `DELETE /admin/team/:userId` · `DELETE /admin/team/invites/:email`
- Público: `GET /team/invite?token=` -> `{ invite: { email, role, tenant_name, staff_name, has_account } }` · `POST /team/invite/accept { token, name, password }` -> `{ token, user }` (guardar token como en el login del panel). Página: `/admin/unirme?token=`
- Permisos: cashier = caja, fila, clientes, agenda; staff (barbero) = su día, su agenda, fila, cobrar. 403 `sin_permiso`.
- `GET /admin/me/day` -> `{ staffId, appointments: [{ id, starts_at, status, client_name, client_phone, preferences, allergies, service_name, last_photo }], tickets, earnings: { services_cents, commission_cents, tips_cents, clients } }`

## Fila virtual y TV
Público:
- `GET /public/queue` -> `{ tenant, open, opensAt, pushPublicKey, features, tv, queueConfig, branding, staff, services, barbersNow, waitingCount, estimatedWaitMin, serving: [{ number, name, status, staff }], waiting: [{ number, name, service, staff, etaMin }], appointments: [{ at, name, staff }] }`
- `POST /public/queue/join { name, phone?, email?, serviceId?, staffId? }` -> `{ token, number, existing? }` (409 `cerrado` con message, `fila_llena`, `falta_celular`)
- `GET /public/queue/ticket?token=` -> `{ ticket: { number, name, status waiting|called|serving|done|cancelled|no_show, service, staff, servedBy, position, ahead, etaMin, canDelay }, ...mismo estado público }`
- `POST /public/queue/ticket/cancel { token }` · `POST /public/queue/ticket/delay { token }` (409 `eres_el_ultimo`, `no_se_puede`) · `POST /public/queue/ticket/push { token, subscription }`
Panel:
- `GET /admin/queue` -> `{ tickets: [...con phone, status, served_by_name, price_cents, sale_id], tvKey, features, stats: { atendidos, no_vinieron, espera_promedio_min }, estimatedWaitMin }`
- `POST /admin/queue { name, phone?, serviceId?, staffId? }` (recepción) · `POST /admin/queue/next { staffId? }` (404 `nadie_esperando`) · `POST /admin/queue/:id/recall` · `PATCH /admin/queue/:id { status?, staffId?, servedBy? }`
- `POST /admin/queue/finish { staffId?, callNext = true }` -> `{ finished, charge, next }` cierra el turno o la cita en curso del barbero, devuelve el cobro exprés y llama al siguiente (404 `nada_que_cerrar`; el rol staff solo para sí mismo)
- queue: `autoNoShow` (segundo llamado a la mitad de `noShowMinutes`, luego "no vino" y se llama al siguiente)
- URL de la TV: `https://{slug}.date.pe/tv?k=<tvKey>`. QR de la fila: `https://{slug}.date.pe/fila`. Ticket: `/turno?t=<token>`.

## Caja
- `GET /admin/pos/catalog` -> `{ services, products, packages, plans, rewards, staff, pendingAppointments: [{ id, starts_at, staff_id, staff_name, client_id, client_name, services: [{ service_id, name, price_cents }], deposit_cents }], tickets: [{ id, number, name, served_by, service_id, service_name, price_cents, client_id }] }`
- `GET /admin/pos/state` -> `{ session: { id, opened_at, opening_cents, opened_by_name, cash: { opening, cash_sales, ins, outs, expenses, expected } } | null, config, features, today: { totals, byMethod, byStaff, byKind } }`
- `POST /admin/cash/open { openingCents }` · `POST /admin/cash/movement { kind: in|out, amountCents, reason }` · `POST /admin/cash/close { countedCents, notes? }` -> `{ expected, counted, difference, summary }` · `GET /admin/cash/sessions`
- `POST /admin/pos/checkout` `{ appointmentId?, ticketId?, clientId? | client: { name, phone, email? }, staffId?, items: [{ kind: service|product|package|gift_card|membership|other, refId?, name?, qty?, unitCents? (other y gift_card), staffId? }], discountCents?, tipCents?, payments: [{ method: cash|yape|plin|card|transfer|gift_card|package|points, amountCents, reference? }], receiptUrl?, receiptNumber?, note? }`
  - Total = suma de items - descuento + propina. Los pagos deben sumar exacto (el adelanto ya pagado de la cita se agrega solo como `deposit`). Errores: `pagos_no_cuadran {total, paid}`, `gift_card_sin_saldo`, `paquete_sin_usos`, `puntos_insuficientes`, `cita_ya_cobrada`.
  - gift_card: reference = código · package: reference = client_package_id (vale el precio del servicio) · points: reference = reward_id.
  - Responde `{ saleId, number, total, pointsAwarded, lowStock: [...] }`. Si no había caja abierta, se abre sola.
- Cobro exprés: `GET /admin/pos/express?ticketId|appointmentId` -> `{ items, discountCents, totalCents, depositCents, dueCents, needsService? }` · `POST /admin/pos/checkout { ticketId|appointmentId, payWith, tipCents? }` sin items arma las líneas solo (errores `elige_el_servicio`, `falta_medio_de_pago`)
- Cierre del día: `GET /admin/day/report?date=YYYY-MM-DD` -> `{ totals, byMethod, byStaff (a_entregar_cents = comisión + propinas), cash, appointments, queue, expenses_cents, topServices, uncharged }`. Feature `daily_summary` manda el resumen por correo al dueño a las 9 pm.
- `GET /admin/sales?from&to&staffId&sessionId` · `GET /admin/sales/summary?from&to` · `PATCH /admin/sales/:id { receiptUrl?, receiptNumber?, note? }` (adjuntar boleta/factura propia) · `POST /admin/sales/:id/void { reason }`
- Productos: `GET /admin/products` (con vendidos_30d) · `POST /admin/products { name, sku?, category?, priceCents, costCents?, stock?, minStock?, commissionPercent?, photoUrl? }` · `PATCH /admin/products/:id` · `POST /admin/products/:id/stock { delta, reason: purchase|adjust, note?, costCents? }` · `DELETE /admin/products/:id`

## Finanzas
- `GET /admin/expenses?from&to` -> `{ expenses, categories }` · `POST /admin/expenses { spentOn?, category, amountCents, method?, note?, receiptUrl?, fromCash? }` · `PATCH/DELETE /admin/expenses/:id`
- `GET /admin/finance/profit?from&to` -> `{ ventasCents, propinasCents, comisionesCents, costoProductosCents, gastosCents, utilidadCents, margen, pagadoEquipoCents, gastosPorCategoria, mensual: [{ mes, ventas_cents, gastos_cents, comisiones_cents, utilidad_cents }] }`
- `GET /admin/payroll?from&to` -> `{ staff: [{ staff_id, name, photo_url, commission_percent, services_cents, commission_cents, product_commission_cents, tips_cents, advances_cents, total_cents, clientes, last_paid_until }], history }` · `POST /admin/payroll/pay { staffId, from, to, method, note?, fromCash? }`
- `GET/POST /admin/payroll/advances { staffId, amountCents, note?, fromCash? }` · `DELETE /admin/payroll/advances/:id`
- `GET /admin/export/{ventas|gastos|equipo}?from&to` -> CSV (descargar con fetch + blob, lleva token)

## Clientes y fidelización
- `GET /admin/clients/:id` -> `{ client: { ...campos, birthday, tags, preferences, allergies, notes, marketing_opt_in, blocked, visitas, ausencias, barbero_favorito, cada_cuantos_dias }, history, photos, wallet, sales }`
- `PATCH /admin/clients/:id/profile { name?, email?, birthday?, tags?, preferences?, allergies?, notes?, marketingOptIn?, blocked? }`
- `POST /admin/clients/:id/photos { url, caption? }` · `DELETE /admin/clients/:id/photos/:photoId` · `GET /admin/clients/:id/wallet` -> `{ points, referralCode, packages, memberships, rewards: [{..., available}] }` · `GET /admin/clients/search?q=`
- Paquetes: `GET /admin/packages` -> `{ packages, sold }` · `POST/PATCH /admin/packages { name, description?, priceCents, uses, serviceIds?, validDays?, sellOnline?, active? }`
- Premios: `GET /admin/rewards` -> `{ rewards, recent }` · `POST/PATCH /admin/rewards { name, pointsCost, kind: free_service|discount_fixed|discount_percent|product, value?, refId?, active? }`
- Membresías vendidas: `GET /admin/memberships/sold` · Gift cards vendidas: `GET /admin/gift-cards/online`
- Campañas: `POST /admin/campaigns/preview { type: all|inactive|new|service|staff|tag|vip, days?, serviceId?, staffId?, tag? }` -> `{ count, sample }` · `POST /admin/campaigns/send { name, segment, subject, body (usa {nombre}), discountPercent?, validDays? }` -> 202 `{ recipients, promoCode }` · `GET /admin/campaigns`
- Público: `GET /public/wallet?t=<manageToken>` · `GET /public/shop` -> `{ packages, services, giftCards: { amounts, min, max } | null }` · `POST /public/shop/buy { kind: gift_card|package, packageId?, amountCents?, provider, buyer: { name, email, phone }, recipient?: { name, email?, message? }, deliverAt? }` -> como el pago de adelanto (`redirectUrl` o `devSimulated` + `devConfirmUrl`) · `POST /public/unsubscribe { token }`

## Agenda, precios por barbero, galería, búsqueda
- `GET /admin/services/:id/staff` -> `{ overrides: [{ staff_id, name, price_cents, duration_min, custom }] }` · `PUT /admin/services/:id/staff { overrides: [{ staffId, priceCents|null, durationMin|null }] }` (ambos null = quitar)
- `PATCH /admin/branding { gallery?: [{ url, caption?, staffId? }], showPoweredBy? }`
- Sitio público: `site.features`, `site.googleReviewUrl`, `site.branding.gallery`, `site.branding.show_powered_by`
- Buscador: `GET /search?date=YYYY-MM-DD&from=HH:MM&service=` agrega `next_slots: [ISO...]` por barbería y ordena primero las que tienen horario.

## Retirado de la interfaz
- Emitir boleta/factura (SUNAT/Nubefact): se quita de la agenda y de Ajustes. En su lugar, cada venta acepta adjuntar el comprobante que la barbería emitió (foto o PDF) y su número.
