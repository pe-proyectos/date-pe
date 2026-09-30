# API: nuevas funciones (contrato para el frontend)

Todas las rutas empiezan con `/api`. Las rutas `/admin/*` requieren `Authorization: Bearer <token>` y `X-Tenant-Slug` (lo pone `useApi` en `app/t/[tenant]/admin/_parts/api.ts`). Las públicas identifican la barbería por `X-Tenant-Slug` o `?tenant=`.
Montos siempre en céntimos (`*_cents`). Fechas en ISO UTC; mostrar en `America/Lima`.

## Suscripción de la barbería (S/50 al mes)
- `GET /admin/billing` -> `{ billing: { status, isDemo, trialEndsAt, paidUntil, activeUntil, daysLeft, monthlyPriceCents, needsPayment, suspended }, invoices: [{ id, amount_cents, months, status, provider, paid_at, period_start, period_end, created_at }] }`
- `POST /admin/billing/checkout` `{ provider: 'mercadopago'|'paypal'|'culqi', months: 1|3|6|12 }` -> `{ invoiceId, amountCents, redirectUrl?, clientConfig?, devSimulated, devConfirmUrl? }`
  - Si `redirectUrl`: `window.location = redirectUrl`. Al volver llega `?pago=ok#facturacion`.
  - Si `devSimulated`: `POST devConfirmUrl` (ruta completa empezando en /api, cuerpo `'{}'`) y recargar.
- Estado `suspended`: el sitio público no acepta reservas; el panel sigue funcionando para pagar.

## Superadmin
- `GET /platform/overview` totals ahora incluye `suspendidas`, `mrr_cents`, `cobrado_mes_cents`.
- `GET /platform/tenants` cada fila incluye `is_demo, trial_ends_at, paid_until, custom_domain, domain_status, monthly_price_cents`.
- `POST /platform/tenants/:id/extend-trial` `{ days }`, `POST /platform/tenants/:id/mark-paid` `{ months, note? }`, `PATCH /platform/tenants/:id/price` `{ monthlyPriceCents }`, `PUT /platform/tenants/:id/domain` `{ domain|null }`, `GET /platform/invoices` -> `{ invoices: [{ id, amount_cents, months, status, provider, paid_at, tenant_name, slug }] }`

## Contraseña
- `POST /auth/password/forgot` `{ email }` (con `X-Tenant-Slug` si viene del panel de una barbería) -> siempre `{ ok: true }`. El correo lleva a `https://{slug}.date.pe/admin/restablecer?token=...` o `https://date.pe/ingresar/restablecer?token=...`.
- `POST /auth/password/reset` `{ token (48 hex), password (min 8) }` -> `{ ok }` o 400 `{ error: 'enlace_vencido' }`.

## Bloqueos y vacaciones
- `GET /admin/time-off?from&to` -> `{ timeOff: [{ id, staff_id, staff_name, starts_at, ends_at, reason }] }` (futuros por defecto)
- `POST /admin/time-off` `{ staffIds: uuid[], startsAt, endsAt, reason? }` -> `{ ok, conflicts: [{ id, starts_at, client_name, staff_name }] }` (citas ya agendadas dentro del bloqueo; mostrarlas como aviso)
- `DELETE /admin/time-off/:id`
- Para "todo el día" enviar `YYYY-MM-DDT00:00:00-05:00` a `YYYY-MM-DDT23:59:00-05:00` (Lima es UTC-5 fijo).

## Sedes
- `GET /admin/locations` -> `{ locations: [{ id, name, address, district, province, phone, is_active, lat, lng, barberos }] }`
- `POST /admin/locations` `{ name, address?, district?, province?, phone?, isActive?, lat?, lng? }`, `PATCH /admin/locations/:id` (parcial), `DELETE /admin/locations/:id` (409 `ultima_sede`)
- Barbero: `PATCH /admin/staff/:id` acepta `locationId` (uuid o null = atiende en todas) y `commissionPercent` (0-100). `GET /admin/staff` devuelve `location_id, commission_percent`.
- Sitio público: `site.locations` y `site.staff[].location_id`. Reserva y disponibilidad aceptan `locationId`.

## Extras (servicios que se suman)
- Servicio: `is_addon` en `GET /admin/services`; `POST/PATCH /admin/services` aceptan `isAddon`.
- Sitio público: `site.services[].is_addon` (los extras no se reservan solos).
- `GET /public/availability?...&addonIds=id1,id2` suma su duración.
- `POST /public/quote` `{ serviceId, addonIds?, staffId?, promoCode?, giftCardCode?, phone? }` -> además `addons: [{ id, name, priceCents, durationMin }], durationMin`.
- `POST /bookings` acepta `addonIds`.

## Referidos (código de amigo)
- Cada cliente recibe `referralCode` (ej. `LUIS4821`). `POST /bookings` responde `{ ..., manageToken, referralCode }`.
- El mismo campo "código" de la reserva acepta promociones y códigos de amigo; enviar `phone` en `/public/quote` para validarlo (solo clientes nuevos). `promo.reason` trae el motivo si no vale.
- Ajustes: `referralEnabled`, `referralDiscountPercent`, `referralRewardPoints`. `site.settings.referral_enabled`, `referral_discount_percent`.
- `GET /admin/clients` filas con `referral_code`.

## Gestionar la reserva (cliente, sin cuenta)
- `GET /public/booking?t=<manageToken>` (o `?id=&phone=`) -> `{ booking: { id, status, starts_at, ends_at, price_cents, staff_id, staff_name, location_name, address, service_id, addon_ids, service_name, paid_cents, reviewed, referral_code, referral_enabled, referral_discount_percent, phone_hint, cancel_window_hours, can_cancel, can_reschedule, client_name } }`
- `GET /public/booking/slots?t=&date=YYYY-MM-DD&staffId?` -> `{ slots: [{ start, end, staffId }] }`
- `POST /public/booking/reschedule` `{ t, startsAt, staffId? }` -> `{ ok }` o 409 `slot_ocupado` / `fuera_de_plazo`
- `POST /public/booking/cancel` `{ t, reason? }` -> `{ ok }` o 409 `fuera_de_plazo` (`hours`)
- Los correos enlazan a `https://{slug}.date.pe/cita?t=<manageToken>`.

## Lista de espera
- `POST /public/waitlist` `{ serviceId?, staffId?, day: 'YYYY-MM-DD', name, phone, email }` -> 201. Se avisa por correo si se libera un horario ese día; el correo enlaza a `/reservar?fecha=YYYY-MM-DD&servicio=<id>&barbero=<id>`.
- `GET /admin/waitlist` -> `{ waitlist: [{ id, day, name, phone, email, notified_at, booked, service_name, staff_name }] }`, `DELETE /admin/waitlist/:id`

## Verificación del cliente por correo (opcional por barbería)
- `site.settings.require_verification`. Si es true, antes de `POST /bookings`:
  `POST /public/verify/request { email }` (429 `espera_un_minuto`) y luego `POST /public/verify/check { email, code }` (400 `codigo_incorrecto`). Sin verificar, `/bookings` responde 403 `verificacion_requerida`.

## Avisos automáticos (correo)
Recordatorio 24 h y 2 h antes, pedido de reseña 1 h después, invitación a volver a los N días, aviso al dueño de reservas/cancelaciones/cambios. Ajustes: `remindersEnabled`, `reviewRequestsEnabled`, `rebookDays` (0 apaga), `notifyOwnerEmail`, `allowClientReschedule`, `requireVerification`.
El correo de reseña enlaza a `/resena?cita=<id>&tel=<9 dígitos>`: la página debe prellenar el celular con `tel`.

## Comprobantes electrónicos (SUNAT vía Nubefact)
- Ajustes: `sunatEnabled`, `sunatRuc` (11 dígitos), `sunatRazonSocial`, `sunatDireccion`, `sunatSerieBoleta` (B###), `sunatSerieFactura` (F###), `nubefactUrl`, `nubefactToken` (nunca vuelve: `GET /admin/settings` trae `nubefact_token_set`).
- `POST /admin/appointments/:id/receipt` `{ kind: 'boleta'|'factura', docType: '1'|'6'|'-', doc?, name?, address?, email? }` -> `{ ok, receipt: { serie, numero, status: 'issued'|'simulated', pdf_url, sunat_message } }`. Errores: `factura_requiere_ruc`, `dni_invalido`, `ya_emitido`, `cita_no_atendida`.
- Sin Nubefact se emiten "de prueba" con serie `PRUEBA-B001`.
- `GET /admin/receipts` -> lista. `GET /admin/appointments` trae `receipt` (o null) y `client_email` por cita.

## Cobro directo del adelanto (MercadoPago de la barbería)
- Ajustes: `mpAccessToken`, `mpPublicKey` (el token nunca vuelve: `mp_access_token_set`). Con token, el adelanto por MercadoPago llega a la cuenta de la barbería.

## Dominio propio
- `GET /admin/domain` -> `{ domain, status: null|'pending'|'active'|'error', dns: { ok, found: string[] }, serverIp }` (revisa el DNS en cada llamada)
- `PUT /admin/domain` `{ domain | null }` -> igual + 400 `dominio_invalido|dominio_reservado|dominio_en_uso`
- Instrucción al dueño: registro **A** de su dominio apuntando a `serverIp` (no CNAME). El certificado HTTPS se emite solo cuando el DNS apunta.
- Web: `GET /public/resolve-host?host=` -> `{ slug }` (para el middleware). Las llamadas del navegador desde un dominio propio deben enviar `X-Tenant-Slug` igual que hoy.

## Buscador
- `GET /search?...&lat=&lng=` ordena por distancia y agrega `distance_km`.
- `GET /geo/nearest?lat=&lng=` -> `{ district: { slug, province, district, lat, lng } }`.

## Sitio público
- `site.tenant.available` false = suscripción vencida: mostrar "Esta barbería no está recibiendo reservas por ahora" y ocultar botones de reservar.
- `site.settings` agrega `allow_client_reschedule, require_verification, referral_enabled, referral_discount_percent`.
