# date.pe — Plan de implementación (MVP suite completa)

> Multi-tenant de reservas para barberías en Perú. Objetivo: **ganarle a la competencia en TODO**.
> Complementa a [`investigacion-competencia.md`](./investigacion-competencia.md).
> Fecha: 2026-09-29.

---

## 0. Principios de producto

1. **WhatsApp-first, sin descargar app.** Reservar en `barberiajuana.date.pe` en < 30s.
2. **White-label real:** cada barbería se ve 100% independiente (su landing, su marca, su sistema). date.pe "desaparece" en el sitio del tenant.
3. **Tiempo real:** lo que el local cambia (staff, horarios, disponibilidad) se refleja al instante en todos los clientes que estén reservando.
4. **SEO + geo:** date.pe rankea en búsquedas de barberías por distrito/provincia de Lima (y luego Perú).
5. **Pagos y anti no-show locales:** seña por Yape/Plin.
6. Ganar en cada dimensión donde la competencia flaquea (ver §9, matriz de victoria).

---

## 1. Topología de dominios y rutas (DECIDIDO)

| Host / ruta | Qué es | Render |
|---|---|---|
| `date.pe` | Landing principal (hero + buscador inteligente) | SSR/SSG (SEO) |
| `date.pe/search` | Resultados del buscador (estilo vuelos/buses) | SSR |
| `date.pe/blog`, `date.pe/blog/[slug]` | Blog de contenidos/SEO | SSG/ISR |
| `date.pe/join` | Alta de barberías (onboarding, "vende aquí") | SSR |
| `date.pe/barberias/[provincia]/[distrito]` | Landings geo por distrito (SEO local) | SSG/ISR |
| `date.pe/api/**` | **API. Toda ruta empieza con `/api`** | Fastify |
| `r2.date.pe` | **Bucket R2**: fotos de perfil, media (portafolio/servicios/logos) y assets estáticos | CDN (Cloudflare) |
| `{tenant}.date.pe` | Landing + reservas de la barbería (white-label) | SSR |
| `{tenant}.date.pe/reservar` | Flujo de reserva | SSR + islas cliente |
| `{tenant}.date.pe/admin` | Panel del local (calendario, staff, etc.) | SPA autenticada |
| `panel.date.pe` (alt) | Panel unificado si el dueño tiene varios locales | SPA |

**CORS/cookies:** el front del tenant (`{tenant}.date.pe`) llama a `date.pe/api` → cross-origin.
- Cookies de sesión con `Domain=.date.pe`, `Secure`, `SameSite=None`.
- CORS reflejando el origin del tenant + `Access-Control-Allow-Credentials: true` (nunca `*` con credenciales).
- Alternativa recomendada: el reverse proxy (Caddy/Nginx) expone `/api` también bajo cada subdominio → same-origin, sin CORS. La URL canónica pública sigue siendo `date.pe/api`.
- El **tenant se resuelve por el `Host`** de la request; el proxy inyecta header `X-Tenant-Host` y la API deriva `tenant_id`.

---

## 2. Stack técnico

| Capa | Tecnología | Por qué |
|---|---|---|
| **API + runner** | Node 24 + **Fastify**, todo bajo `{ prefix: '/api' }` | Igual que agentsdatawell; simple, rápido |
| **Web pública + admin** | **Next.js (App Router)** | SSR/SSG para SEO (landing, search, blog, tenants) + React para admin |
| **DB** | **PostgreSQL 16** (Docker) | RLS multi-tenant, `LISTEN/NOTIFY` para realtime |
| **Realtime** | WebSocket (Fastify `@fastify/websocket`) + Postgres `LISTEN/NOTIFY` (Redis pub/sub si escala) | Propagar cambios de disponibilidad en vivo |
| **Calendario admin** | **FullCalendar** (vista *resource timeline*: columna por barbero) + drag & drop | Es exactamente el layout de barbería |
| **Estado/data cliente** | TanStack Query (+ Router en admin) | Cache + revalidación; igual que sibling |
| **Estilos** | Tailwind + tema por tenant (CSS variables) | White-label por colores/logo |
| **Email** | **Resend** (`RESEND_API_KEY`) | Confirmaciones, OTP fallback, recibos |
| **Pagos** | **Culqi** (Yape + pre-auth para seña) · MercadoPago (split, opcional) | Perú-nativo; Stripe no opera en PE |
| **WhatsApp** | Twilio WhatsApp o Meta Cloud API (utility templates) | Canal primario de recordatorios |
| **Reverse proxy / TLS** | Caddy 2 (o Cloudflare) con wildcard `*.date.pe` | Igual que sibling; cert wildcard + apex |
| **CDN/DNS** | Cloudflare | Ya en uso |
| **Storage media/assets** | Cloudflare R2 servido en **`r2.date.pe`** | Fotos de perfil de barberos, portafolio, servicios, logos de tenants y **todos los assets estáticos** |
| **Deploy** | VPS Linux propio, systemd + Docker | Igual que agentsdatawell |

> Nota: Next.js puede servir el admin y las superficies públicas; Fastify queda **solo** como API en `/api`. Si prefieres un único runtime, Next puede consumir la API por HTTP interno.

---

## 3. Modelo de datos (multi-tenant, esquema compartido + RLS)

Todas las tablas de negocio llevan `tenant_id` (primera columna de cada índice) y RLS activo. `tenant_id` viaja en el claim del JWT; políticas evalúan `current_setting('app.tenant_id')`.

**Entidades núcleo:**

- `tenants` — id, slug (= subdominio), nombre, estado (trial/activo/suspendido), plan, dominio_propio (futuro).
- `tenant_branding` — logo_url, color_primario, color_secundario, tipografía, cover, textos, redes.
- `tenant_settings` — zona horaria (America/Lima), política de reserva, ventana de cancelación, % seña, buffers.
- `locations` — sucursales: nombre, dirección, **distrito, provincia, lat/lng**, horarios (por día), teléfono. (Geo para SEO/búsqueda.)
- `staff` — barberos: nombre, foto, bio, rating, **`is_bookable`** (aparece o no como peluquero elegible), especialidades.
- `staff_schedules` — por staff+location: días/horas que atiende (turnos, recurrentes + excepciones/bloqueos).
- `services` — nombre, categoría, descripción, foto, duración, precio, buffer, activo.
- `service_variants` — precio/duración por barbero (junior/senior).
- `service_staff` — qué barbero ofrece qué servicio.
- `service_addons` / `service_combos` — upsell y combos.
- `clients` — teléfono (E.164), nombre, email, notas, verificado_whatsapp.
- `appointments` — tenant, location, staff, client, servicios[], inicio, fin, estado (pendiente/confirmada/completada/no_show/cancelada), origen.
- `payments` — appointment, tipo (seña/total), método (yape/plin/tarjeta), monto, estado, ref pasarela, pre-auth/captura.
- `reviews` — appointment (verificada), estrellas, comentario, respuesta del local.
- `loyalty_*` — puntos/sellos, referidos, gift cards.
- `promotions` — códigos, flash sales, happy hour.
- `notifications_log` — canal, plantilla, estado (para recordatorios/idempotencia).
- `users` (staff/admin del tenant) + `memberships` (rol por tenant), `platform_admins` (nosotros).

**Realtime:** triggers en `staff`, `staff_schedules`, `appointments`, `services` → `NOTIFY tenant_<id>_availability` → WS empuja a clientes en la pantalla de reserva de ese tenant/local para recomputar slots libres.

---

## 4. Árbol de la API (`/api/*`)

```
/api/health
/api/auth/*                 login, refresh, logout, OTP whatsapp
/api/tenants/me             config del tenant actual (por Host)
/api/public/:tenant/...     datos públicos de reserva (branding, locales, servicios, staff, slots)
/api/public/:tenant/availability   slots libres (params: location, service[], staff|any, fecha)
/api/bookings               crear/consultar/cancelar/reprogramar (cliente)
/api/admin/staff            CRUD barberos + is_bookable
/api/admin/schedules        turnos/horarios por barbero (drag&drop calendar)
/api/admin/services         CRUD servicios/variantes/addons/combos
/api/admin/appointments     agenda: mover (drag&drop), crear walk-in, bloquear
/api/admin/branding         logo/colores/landing del tenant
/api/admin/reports          ingresos, ocupación, no-shows, ranking barberos
/api/payments/*             crear seña Yape, webhooks Culqi/MercadoPago
/api/notifications/*         plantillas, reenvíos
/api/search                 buscador público date.pe (geo + servicio + fecha)
/api/geo                    distritos/provincias, autocomplete
/api/blog/*                 posts (servidos a date.pe/blog)
/api/onboarding             alta de barbería (date.pe/join)
/api/ws                     upgrade WebSocket (realtime)
```

Todas registradas bajo prefijo `/api`. Rutas `/api/admin/*` exigen JWT con `tenant_id` + rol.

---

## 5. Funciones que pediste — cómo se implementan

### 5.1 Gestión de personal (staff) del local
- CRUD de barberos con foto, bio, especialidades.
- **`is_bookable`**: toggle para elegir quiénes aparecen como peluqueros seleccionables por el cliente (los demás quedan ocultos aunque existan en el sistema).
- **Horarios por barbero**: a qué hora atiende cada quien, por día y por local; turnos recurrentes + excepciones (vacaciones, bloqueos).
- El local edita todo desde el admin y **se refleja en tiempo real** para los clientes (WS + NOTIFY). Nadie ve un slot que ya no existe.

### 5.2 Vista calendario (admin), fácil y moderna
- **FullCalendar** en modo *resource timeline*: una columna por barbero, franjas por hora.
- **Drag & drop** para mover/redimensionar citas y bloquear horas; crear walk-in con click.
- Cambios se guardan vía `/api/admin/appointments` y se emiten por WS a otros dispositivos del local y a la disponibilidad pública.
- Filtros por local, por barbero; vista día/semana; código de color por estado.

### 5.3 White-label por barbería
- Cada tenant tiene **su propio landing** en `{tenant}.date.pe` (hero, servicios, galería, barberos, reseñas, botón reservar) + su flujo de reserva, todo con su logo/colores/textos (`tenant_branding`, CSS variables).
- Se ve **independiente**: sin marca date.pe visible en el sitio del tenant (solo un discreto "powered by" opcional, quitable). Emails salen con el nombre del local.
- A futuro: dominio propio del local vía Cloudflare for SaaS (CNAME + cert por hostname).

### 5.4 Landing principal date.pe + buscador inteligente
- **Landing bien hecho**: propuesta de valor para clientes (encuentra y reserva) y para barberías (`/join`).
- **Buscador estilo vuelos/buses**: barra con **pocos parámetros** e inteligente:
  - **¿Dónde?** distrito/zona (autocomplete geo, geolocalización opcional "cerca de mí").
  - **¿Qué?** servicio (corte, barba, etc.) — opcional.
  - **¿Cuándo?** hoy / mañana / fecha + franja (opcional).
  - (opcional) barbero/host, rango de precio.
- `/api/search` cruza geo + disponibilidad real + servicios y devuelve barberías con próximos slots; resultados en `date.pe/search` con filtros y mapa.

### 5.5 SEO + geo (rankear por distritos/provincias de Lima)
- **SSR/SSG** en todas las superficies públicas (Next.js).
- **Landings geo programáticas**: `date.pe/barberias/lima/miraflores`, `/lima/san-isidro`, … generadas por distrito/provincia con contenido útil + listado de barberías.
- **schema.org** `LocalBusiness` / `HairSalon` + `AggregateRating` en perfiles; `BreadcrumbList`; Open Graph.
- **Sitemaps** por distrito y por tenant; `robots.txt`; canonical por host (evitar duplicado subdominio/dominio propio).
- **Blog** `date.pe/blog` (ISR) para contenidos ("mejores barberías en {distrito}", tendencias) que capturan long-tail geo.
- Core Web Vitals: imágenes en R2 optimizadas, edge cache Cloudflare.

### 5.6 Rutas fijas
- `date.pe/blog`, `date.pe/search`, `date.pe/join` (+ `/barberias/[provincia]/[distrito]`), todas bien hechas y SEO-first.

### 5.7 Emails (Resend)
- Confirmación de reserva, recordatorio (fallback si no hay WhatsApp), recibo/seña, OTP fallback, avisos al local.
- `RESEND_API_KEY` y `EMAIL_FROM` desde `.env` (nunca hardcode). Dominio `date.pe` con SPF/DKIM/DMARC verificados en Resend.

### 5.8 Media y assets estáticos (R2)
- Todo (fotos de perfil de barberos, portafolio, fotos de servicios, logos de tenants, assets estáticos) vive en **Cloudflare R2 servido bajo `r2.date.pe`**.
- Subidas vía **presigned URLs** desde `/api/admin/*` (el navegador sube directo a R2, la API solo firma) → menos carga en el server.
- Convención de rutas: `r2.date.pe/tenants/{tenant_id}/staff/{id}.webp`, `.../services/…`, `.../branding/logo.webp`, `assets/…` para lo global.
- Imágenes optimizadas (webp/avif) + cache en el edge de Cloudflare; en la BD guardamos solo la URL/clave, no el binario.

---

## 6. Flujo de reserva (cliente, end-to-end)

1. Entra a `{tenant}.date.pe` (o llega desde `date.pe/search`).
2. Elige **local** (si hay varios) → **servicio(s)** → **barbero** (o "cualquiera disponible") → **fecha/hora** (slots en vivo).
3. Datos de contacto (guest) + **OTP por WhatsApp**.
4. **Seña por Yape/Plin** (Culqi) según política del local.
5. Confirmación por WhatsApp + email; cita entra al calendario del local en tiempo real.
6. Recordatorio 24h y 1–2h antes (WhatsApp two-way: confirmar/cancelar/reprogramar).
7. Post-visita: pedir reseña + recordatorio de re-booking (2–3 semanas).

---

## 7. Realtime — cómo se propaga

- Cliente en pantalla de reserva abre WS a `/api/ws?tenant=…&location=…`.
- Admin cambia horario/staff/cita → API escribe DB → trigger `NOTIFY` → proceso API suscrito reenvía por WS a los clientes de ese tenant/local → el front recomputa slots.
- Locking optimista al confirmar: si el slot se tomó entre medias, se avisa y se re-ofrece (evita doble reserva).

---

## 8. Roadmap por fases

- **Fase 0 — Cimientos:** monorepo, Fastify `/api`, Next.js, Postgres + RLS, resolución de tenant por Host, wildcard TLS, auth + OTP WhatsApp, deploy en VPS.
- **Fase 1 — Reserva núcleo:** servicios/staff/horarios, disponibilidad, flujo de reserva guest, seña Yape (Culqi), confirmación/recordatorio (WhatsApp+Resend), admin con **calendario drag&drop** + realtime, branding básico por tenant.
- **Fase 2 — White-label + descubrimiento:** landing por tenant, landing date.pe + **buscador** + `/search`, landings geo por distrito, blog, SEO/schema/sitemaps, `/join` onboarding.
- **Fase 3 — Suite completa:** multi-local, variantes/combos/addons, reseñas, lealtad/puntos/sellos, referidos, gift cards, promos, reportes, comisiones por barbero.
- **Fase 4 — Diferenciadores PE:** boleta SUNAT atada a Yape, dominio propio por tenant, waitlist inteligente, MercadoPago split.

---

## 9. Matriz de victoria — cómo les ganamos en cada dimensión

| Dimensión | Mejor competidor | Qué hace date.pe para ganar |
|---|---|---|
| Pagos/seña | Booksy/Square (tarjeta) | **Yape/Plin nativo** — nadie global lo tiene |
| Recordatorios | Fresha (WhatsApp) | WhatsApp two-way primario + re-booking, barato |
| Reserva sin fricción | Square (passwordless) | Guest + OTP WhatsApp, sin app |
| White-label | SimplyBook (subdominio) | Subdominio + landing propio + dominio propio, **barato** |
| Precio | Fresha/Timely (por staff, USD) | **S/50/mes plano** en soles |
| Calendario admin | Squire/Vagaro | FullCalendar drag&drop + **realtime** multi-dispositivo |
| Descubrimiento | Booksy marketplace | **Buscador geo estilo vuelos** + SEO por distrito |
| SEO local | (débil en casi todos) | Landings geo programáticas + schema + blog |
| Staff/horarios | Booksy variants | `is_bookable`, horarios por barbero, en vivo |
| Localización PE | Alaz (SUNAT+Yape) | Igualar SUNAT+Yape y superar en UX/precio/white-label |

**Rivales locales a vigilar:** Alaz.pe (SUNAT+Yape) y Reservo (belleza-nativo con página PE).

---

## 10. Seguridad / notas
- `RESEND_API_KEY` recibida en chat en texto plano → **rotar** tras el setup; solo por `.env`/env del VPS.
- Nunca commitear `.env` (ya en `.gitignore`); usar `.env.example` como plantilla.
- RLS como capa de autorización real (no solo `where`); service-role solo en webhooks/cron, nunca en rutas de usuario.
- Verificar: split/sub-merchant Culqi, límite Yape ~S/2.000/día, tarifas WhatsApp Meta (suben 01-oct-2026).
