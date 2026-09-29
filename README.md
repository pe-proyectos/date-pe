# date.pe

SaaS multi-tenant de reservas para barberías en Perú. Cada barbería tiene su
subdominio white-label (`barberiajuana.date.pe`); el sitio principal `date.pe`
es la landing + buscador + blog. La API vive en `date.pe/api` (todas las rutas
bajo `/api`).

Ver diseño y competencia en [`docs/`](./docs):
- [`plan-implementacion.md`](./docs/plan-implementacion.md)
- [`investigacion-competencia.md`](./docs/investigacion-competencia.md)

## Stack

- **API:** Node 24 + Fastify (`apps/api`), todo bajo prefijo `/api`.
- **Web:** Next.js 15 App Router (`apps/web`) — landing, `/search`, `/blog`,
  `/join` y sitios de tenant (`{tenant}.date.pe`) + panel `/admin`.
- **DB:** PostgreSQL 16 (Docker) con RLS multi-tenant (`db/schema.sql`).
- **Realtime:** WebSocket + Postgres `LISTEN/NOTIFY`.
- **Media/assets:** Cloudflare R2 en `r2.date.pe`.
- **Email:** Resend · **Pagos:** Culqi/Yape (pendiente integrar).

## Puesta en marcha (dev)

```bash
pnpm install
pnpm db:up                       # levanta Postgres en Docker
pnpm --filter @datepe/api seed   # aplica esquema + barbería demo
pnpm --filter @datepe/api dev    # API en http://localhost:3001
pnpm --filter @datepe/web dev    # Web en http://localhost:3000
```

> En este entorno el puerto 3000 estaba ocupado; se puede usar otro con
> `pnpm --filter @datepe/web exec next dev -p 3005`.

### Subdominios en local

Usa `lvh.me` (resuelve cualquier subdominio a 127.0.0.1):
- Principal: `http://localhost:3000`
- Tenant demo: `http://barberiajuana.lvh.me:3000`
- Panel: `http://barberiajuana.lvh.me:3000/admin`

**Login demo del panel:** `juana@date.pe` / `barberia123`

## Variables de entorno

Copia `.env.example` a `.env` y rellena. Secretos (Resend, R2) nunca se
versionan. **Rota las llaves que se compartieron en texto plano.**

## Estructura

```
apps/api    Fastify API (/api/*), RLS por tenant, realtime, availability
apps/web    Next.js (landing, search, blog, join, tenant sites, admin)
db          schema.sql (idempotente, con RLS)
docs        investigación de competencia + plan de implementación
```
