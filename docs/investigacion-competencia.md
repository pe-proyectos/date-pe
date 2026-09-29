# date.pe — Investigación de competencia y mapa de funciones

> Sistema multi-tenant de reservas para barberías en Perú (ej. `barberiajuana.date.pe`).
> Modelo de negocio: **SaaS por suscripción, S/50/mes por barbería**. MVP: **suite completa**.
> Fecha: 2026-09-29.

---

## 1. Resumen ejecutivo

**El competidor real en Perú no es otra app: es el cuaderno + el hilo de WhatsApp.** El 98.6% de usuarios de mensajería en Perú usa WhatsApp; las barberías reservan hoy por WhatsApp, DM de Instagram, llamada y walk-in. Cualquier producto debe *sentirse como un upgrade de WhatsApp*, sin obligar al cliente a descargar una app.

**Las tres grietas que podemos explotar:**

1. **Pagos locales (Yape/Plin).** Ningún competidor global (Booksy, Fresha, Square) ni casi ningún regional expone Yape/Plin de forma nativa. Yape tiene ~16.4M de usuarios activos mensuales (~82% de la PEA); en bodegas de Lima el 73% de las ventas ya son por billetera. La **seña/adelanto por Yape** es la forma culturalmente correcta de matar el no-show — no la tarjeta de crédito (baja penetración).
2. **Precio en soles y micro-negocio.** AgendaPro cobra ~S/449/mes; eso deja fuera a una barbería que cobra S/10–15 el corte. Nuestro S/50/mes es un carril abierto. Los globales cobran en USD.
3. **SUNAT / boletas.** SUNAT está avanzando a tratar pagos Yape/Plin como boletas electrónicas. Emitir boleta atada al pago es un dolor que se vuelve feature. (Solo Alaz.pe lo ataca localmente hoy.)

**Multi-tenant + white-label real** (cada barbería con su subdominio de marca) es además un hueco: Fresha/Booksy son marketplaces cerrados sin marca propia; Timely/Reservio/Acuity dan URL tipo `nombre.gettimely.com` pero sin dominio propio ni quitar su marca salvo planes caros.

---

## 2. Panorama competitivo

### 2.1 Presencia real en Perú (confirmada)

| Competidor | Tipo | Presencia PE | Precio | Debilidad clave para PE |
|---|---|---|---|---|
| **Reservo** (reservo.cl) | Regional (Chile) | Sí (página PE barbería, belleza-nativo) | Oculto (~US$30–50/mo aprox.) | No publicita Yape/Plin/Culqi; precio no transparente |
| **AgendaPro** | Regional (LatAm) | Sí (página PE) | ~S/449/mo | Caro para micro-barbería |
| **Alaz** (alaz.pe) | Local (Perú) | Sí, 100% PE | Por demanda | **El más peligroso localmente**: SUNAT + Yape + Plin + chatbot WhatsApp nativo |
| **HoraFija** (horafija.com) | Local (Perú) | Sí, WhatsApp-first | Bajo | Producto simple, poca profundidad de módulos |
| **Barber Shop Express** | Local (Perú) | Sí | S/490/año | Web+reserva básica, no SaaS multi-tenant real |
| **Bewe** (bewe.ai) | Regional | Probable (soporta S/) | US$29–89/mo | No procesa pagos; USD |
| **Booksy** | Global marketplace | Listados PE, débil | US$29.99 + $20/staff | USD, marketplace poco penetrado en PE, exige app |
| **Fresha** | Global marketplace | Global, sin localizar | ~US$19.95 + 20% 1ra cita | USD, sin Yape/Plin/SUNAT |

Otros locales/regionales vistos: WeiBook, MiCita.app, GetSolo, ReservaSimple, Turnito (AR-céntricos), Mercately (CRM WhatsApp con página PE).

### 2.2 Referencias globales (para copiar mecánicas, no compiten en PE)

- **Squire** — el más específico de barbería (barbero, No-Show Protection, comisiones, auto-payout). Nació como marketplace y **pivoteó a white-label** porque el marketplace fracasaba (dobles reservas, fricción). Lección de producto.
- **Booksy / Fresha** — los más completos en features y media; marketplace de descubrimiento. Fresha tiene el waitlist y recordatorios más configurables (incluye **WhatsApp**).
- **Square Appointments** — reserva sin fricción (passwordless por SMS), no-show protection maduro, lanzó marketplace "Square Go".
- **Acuity / SimplyBook.me / Setmore / Timely / Reservio / Cal.com / Trafft** — modelos self-serve / white-label. **SimplyBook.me** es el análogo más cercano a nuestra arquitectura (subdominio por negocio `shop.simplybook.me` + dominio propio + programa white-label).

---

## 3. Mapa de funciones (qué tiene la competencia y cómo funciona)

Leyenda de prioridad para date.pe: **[M]** = must MVP · **[S]** = should · **[C]** = could/futuro.

### 3.1 Flujo de reserva — selector de servicio → barbero → fecha/hora

- **Orden típico:** (local →) servicio(s) → barbero → fecha → hora → datos/pago → confirmar. **[M]**
- **Selección de barbero:** elegir barbero específico **o "cualquiera disponible"** (auto-asigna al primer libre). Universal en Booksy/Fresha/Square/Squire/GlossGenius. **[M]**
  - Mostrar foto, rating, bio, especialidad del barbero (Fresha muestra rating con mínimo 4 reseñas). **[S]**
  - **Precio/duración por barbero** (barbero junior vs. senior): Booksy lo resuelve con "Service Variants" — una sola entrada de servicio, el precio/duración se ajusta al barbero elegido. **[S]**
- **Selector fecha/hora:** lista de horas de inicio generadas por un **intervalo configurable** (5/10/15/30 min), independiente de la duración del servicio; solo se muestra el slot si cabe (duración + buffers). **[M]**
  - **Buffer / tiempo de limpieza** antes/después (oculto al cliente, bloquea agenda). **[S]**
  - **Processing time** (ej. tinte: el barbero queda libre mientras "procesa", se puede meter otra cita). Menos relevante en barbería pura. **[C]**
  - **Modos anti-hueco** ("reduce/elimina gaps") para empaquetar citas back-to-back. **[C]**
  - Manejo de zona horaria: para PE basta bloquear a America/Lima. **[M]**
- **Multi-local:** cliente elige sucursal; horarios y staff por local. Square/Squire/AgendaPro lo tienen; en varios está en plan caro. **[S]** (parte de "suite completa")
- **Multi-servicio en una visita:** suma duraciones en un bloque contiguo (corte + barba). Booksy "Combo Services" (secuencial/paralelo). **[S]**
- **Reserva para varias personas** (yo + un amigo): normalmente es un toggle tosco (Fresha) o "parallel clients" (Booksy). Hueco de UX. **[C]**

### 3.2 Catálogo de servicios y media

- Servicios con **categoría, duración, precio, descripción, foto**. **[M]**
- **Add-ons** (upsell: cejas, mascarilla) — Booksy nativo; GlossGenius no los tiene (diferenciador). **[S]**
- **Combos/paquetes** y **bonos/membresías**. **[S]** (suite completa)
- **Media:** foto de portada, fotos del local, **foto por barbero, portafolio/galería de trabajos, antes/después**, integración Instagram. Booksy afirma 3x reservas con 10+ fotos. **[S]**
  - Video/reels: casi nadie lo soporta nativo → posible diferenciador ligero. **[C]**
- **Ofertas/promos:** códigos de descuento, flash sales, happy hour, precios dinámicos en horas valle, gift cards. **[S]**

### 3.3 Cuentas, registro y validación

- **Guest checkout** (reservar sin crear cuenta) es lo estándar y lo que más convierte (Acuity, Setmore, Reservio, Timely, Square). Booksy es criticado por forzar cuenta. **[M]**
- **Verificación por SMS/OTP del móvil** al reservar (Square passwordless; Timely; Fresha). En PE conviene **verificación por WhatsApp OTP**. **[M]**
- Login social (Google/Apple/Facebook) opcional. **[C]**
- Reconocimiento de cliente recurrente + **"reservar de nuevo"** (rebooking en 1 toque) + historial. **[S]**

### 3.4 Pagos, depósitos y no-show (el corazón para PE)

Patrón universal: **(a) depósito/prepago al reservar** o **(b) tarjeta en archivo** que se cobra solo si viola la política de cancelación.

- **Depósito 1–100%** del servicio, configurable por servicio. **[M]**
- **Política de cancelación** con ventana (ej. 24h) + fee (monto fijo por cita, por servicio, o %). **[S]**
- **Cobro automático** del no-show/late-cancel; ventana de cobro (Square hasta 14 días después). **[S]**
- **Para PE: seña por Yape/Plin** en vez de tarjeta. ReservaSimple afirma que el prepago reduce no-shows hasta 80%. **[M]**
- **Propinas, gift cards, membresías recurrentes** (suite completa). **[S]**

Pasarelas (ver §5): **Culqi** (mejor pre-autorización para depósitos, Yape nativo, sin costo fijo) o **MercadoPago** (único con split/marketplace documentado + Yape). Stripe **no** opera para comercios en Perú.

### 3.5 Recordatorios y notificaciones

- Canales: **WhatsApp (primario en PE)**, email, SMS (fallback), push. **[M]**
- Confirmación al reservar + recordatorio 24h + opcional 1–2h antes. Fresha permite hasta 3, entre 2–72h. **[M]**
- **Two-way** (responder para confirmar/cancelar/reprogramar y que la agenda se actualice sola) — Square Assistant, Booksy, Fresha. **[S]**
- **Recordatorio de re-booking** post-visita (GlossGenius: 1–12 semanas después; barbería vuelve cada 2–3 semanas → oro). **[S]**
- Costos PE (§5): WhatsApp utility ≈ US$0.023/msg vs SMS Twilio ≈ US$0.25 (10x). Email casi gratis (Resend).

### 3.6 Reseñas, lealtad y referidos

- **Reseñas verificadas** (solo quien tuvo cita puede reseñar), con estrellas + foto, mostradas en el perfil. **[S]**
- **Lealtad:** sellos (stamp card) y/o puntos por visita/reserva/referido; canje por descuento/servicio. Booksy/Fresha son los más profundos. **[S]**
- **Referidos:** bonos al cliente que trae a un amigo que completa 1ra cita. **[C]**
- Waitlist inteligente que llena cancelaciones avisando por WhatsApp. **[C]**

### 3.7 Panel de administración (lado barbería)

- **Agenda/calendario** con drag-and-drop, vista por barbero, bloqueo de horas, turnos/horarios recurrentes, walk-in. **[M]**
- **CRM de clientes** (ficha, historial, notas, tarjeta/whatsapp en archivo). **[M]**
- **Gestión de staff:** perfiles, servicios por barbero, permisos, **comisiones / auto-payout** (Squire). **[S]**
- **Reportes/analítica:** ingresos, ocupación, no-shows, ranking de barberos. **[S]**
- **Inventario** de productos (opcional en barbería). **[C]**
- Multi-local bajo un login. **[S]**

---

## 4. Cómo ganarles — diferenciadores para date.pe

1. **Yape/Plin como método de seña y pago** (Culqi/MercadoPago). *El* diferenciador. Nadie global lo hace bien.
2. **Reserva WhatsApp-first, sin descargar app**: link `barberiajuana.date.pe`, guest checkout, OTP por WhatsApp, recordatorios y two-way por WhatsApp.
3. **Precio en soles, S/50/mes plano por barbería** (no por silla/staff como Timely/Booksy que se disparan). Simple y barato.
4. **White-label real barato**: subdominio de marca + (a futuro) dominio propio, sin marca "date.pe" en la página del cliente. Fresha/Booksy no lo dan; Timely/Reservio lo cobran caro.
5. **SUNAT / boleta** atada al pago Yape (roadmap) — convierte el riesgo de fiscalización en feature. Solo Alaz lo ataca.
6. **UX de barbería específica**: elegir barbero con foto/rating, combo corte+barba, re-booking cada 2–3 semanas, portafolio de trabajos.

**Barras que hay que igualar sí o sí** (o pierdes contra los buenos): guest booking, "cualquier barbero disponible", depósito + política de no-show, recordatorios automáticos, widget/enlace embebible, multi-local, branding por barbería.

---

## 5. Decisiones de stack para Perú

### Pagos
- **Culqi** — mejor DX, Yape nativo, **pre-autorización/captura ideal para depósitos** (hold hasta 4 días), suscripciones nativas, sin costo de afiliación/mantenimiento. Fee ~3.44%+IGV. Débil: liquidación 4 días hábiles, sin split nativo.
- **MercadoPago** — único con **Split de Pagos/marketplace** documentado (útil si algún día cobramos comisión y repartimos), Yape en Checkout API. Fee 3.29–3.49% + S/1 + IGV.
- **Descartar Stripe** (no opera comercios PE) y **PayPal** (~5.4%, solo para extranjeros).
- Recomendación: con modelo suscripción S/50/mes, la barbería puede ser su propio comercio Culqi, o usamos MercadoPago Split si centralizamos el cobro de señas. **Empezar con Culqi** por los depósitos Yape.

### Comunicaciones
- **Email:** Resend (gratis 3.000/mes → ~US$20/mo). Escala: Amazon SES (US$0.10/1.000).
- **WhatsApp (primario):** plantillas *utility* vía **Twilio WhatsApp** (rápido de integrar, +$0.005/msg) o **Meta Cloud API directo** (más barato a escala). ~US$0.023/recordatorio.
- **SMS:** solo fallback vía Twilio para quien no tiene WhatsApp.
- ~5.000 recordatorios/mes ≈ US$135–160 all-in por WhatsApp; ~US$1.200 si fuera SMS.

### Arquitectura multi-tenant (subdominios) — DECIDIDO
- **Topología de dominios (fija):**
  - `date.pe` → **landing** (marketing, SEO, blog, registro de barberías).
  - `{tenant}.date.pe` → **sitio de reservas** de cada barbería (ej. `barberiajuana.date.pe`).
  - `date.pe/api/...` → **la API**. **Toda ruta de API empieza con `/api`** (prefijo obligatorio).
- **Implicación CORS/cookies:** el front del tenant vive en `{tenant}.date.pe` y llama a la API en `date.pe/api` → es **cross-origin**. Manejar con: cookies `Domain=.date.pe` (`Secure`, `SameSite=None`) para compartir sesión, y CORS reflejando el origen del tenant con `Access-Control-Allow-Credentials: true` (no usar `*` con credenciales). Alternativa: el reverse proxy también expone `/api` bajo cada subdominio apuntando al mismo backend, evitando CORS. El tenant se resuelve por el `Host` de la request (o por un header que inyecte el proxy) en el server de API.
- **Patrón:** un solo deploy; resolver el tenant leyendo el `Host` y reescribiendo a ruta `/[subdominio]/...`. (Referencia canónica: Vercel Platforms Starter Kit; aplicable a nuestro propio VPS con el mismo patrón en el reverse proxy.)
- **Aislamiento de datos:** esquema compartido + `tenant_id` + Row Level Security (Postgres). Indexar `tenant_id` como primera columna; `tenant_id` en el claim del JWT. Es lo más barato y escala a "infinitos" locales.
- **DNS/TLS:** wildcard `*.date.pe` (A al VPS o vía Cloudflare, que ya usas). Cert wildcard vía Let's Encrypt DNS-01 (o TLS gestionado por Cloudflare). Ojo: el wildcard **no** cubre el ápex `date.pe` — emitir ambos.
- **Dominio propio por barbería (futuro):** CNAME del cliente → nosotros + emisión de cert por hostname (Cloudflare for SaaS / Custom Hostnames).
- **Cookies:** para compartir sesión entre subdominios, `Domain=.date.pe`. En dev usar `lvh.me`/`localtest.me` o `tenant.localhost`.
- Encaja con tu stack conocido (Node + Fastify, Postgres en Docker, Cloudflare, VPS). No necesitamos proxy ni Apify aquí.

---

## 6. Mapa de módulos MVP (suite completa) — priorizado

**Núcleo (M):**
- Reserva pública por subdominio: local → servicio → barbero (o "cualquiera") → fecha/hora → datos → seña Yape → confirmación.
- Guest checkout + OTP WhatsApp.
- Depósito/seña por Yape/Plin (Culqi) + política de no-show básica.
- Recordatorios/confirmación por WhatsApp (+ email).
- Panel: agenda drag-and-drop, servicios, barberos con horarios, CRM básico.
- Multi-tenant (subdominio, RLS), branding por barbería (logo/colores).

**Alta prioridad (S):**
- Multi-local, precio/duración por barbero, combos y add-ons, media/portafolio.
- Two-way WhatsApp, re-booking reminder, reseñas verificadas, lealtad por puntos/sellos.
- Comisiones por barbero, reportes (ingresos/ocupación/no-shows).
- Ofertas/promos, gift cards, membresías.

**Futuro (C):**
- Boleta SUNAT atada a Yape, dominio propio por barbería, waitlist inteligente, referidos, video/reels, marketplace `date.pe` de descubrimiento.

---

## 7. Riesgos / cosas a verificar antes de construir
- Confirmar con Culqi si ofrece sub-merchant/split para modelo multi-tenant, y soporte de pre-auth/captura en Yape.
- Límite Yape por pagador (~S/2.000/día) vs. montos de seña.
- Tarifas WhatsApp Meta suben en PE desde 01-oct-2026; validar al lanzar.
- Reservo y Alaz son los rivales locales a vigilar de cerca.
