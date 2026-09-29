# Despliegue en el VPS (Coolify / Traefik)

date.pe corre en el VPS detrás del **proxy Traefik de Coolify** (red docker `coolify`).

## Estado actual (validado e2e 2026-09-30)

- `https://date.pe` → web (landing, `/search`, `/blog`, `/join`, `/superadmin`) + `date.pe/api/*` → API.
- `https://{tenant}.date.pe` → sitio white-label de cada barbería. Cert Let's Encrypt
  emitido por subdominio automáticamente (requiere `*.date.pe` apuntando al VPS).
- Stack: `deploy/docker-compose.yml` (postgres `datepe-db`, `datepe-api`, `datepe-web`).

## Comandos

```bash
cd deploy
docker compose build          # construye imágenes (Dockerfile.api / Dockerfile.web)
docker compose up -d          # levanta db + api + web
docker compose exec api pnpm --filter @datepe/api seed   # (opcional) datos demo
docker compose logs -f api
```

Rutas Traefik (labels en el compose):
- `datepe-api`: `Host(date.pe) && PathPrefix(/api)` prioridad 100.
- `datepe-web`: `Host(date.pe)` prioridad 10.
- `datepe-tenants`: `HostRegexp(^.+\.date\.pe$)` prioridad 5.

## Requisitos DNS / TLS

- `date.pe` A/AAAA → VPS. ✅
- **`*.date.pe`** A/AAAA → VPS (wildcard) para que cada barbería tenga su subdominio
  con TLS automático. Verificar en el DNS (Cloudflare).
- Traefik usa el certresolver `letsencrypt` (HTTP-01) y emite cert por hostname.

## Variables

`deploy/docker-compose.yml` lee secretos de `../.env` (Resend, R2, pagos) y sobreescribe
lo específico de prod (DB apunta a `datepe-db`, `APP_PUBLIC_URL=https://date.pe`,
`NEXT_PUBLIC_API_BASE=https://date.pe`).

⚠️ Rotar llaves compartidas en texto plano (Resend, R2). `PAYMENTS_DEV_MODE=true` hasta
tener llaves reales de Culqi/MercadoPago/PayPal.

## Pasar a Coolify gestionado (UI) — opcional

Para administrarlo desde la UI de Coolify en vez de `docker compose` manual:
1. Coolify → proyecto → **+ New Resource → Docker Compose (from Git)**.
2. Repo `pe-proyectos/date-pe`, compose path `deploy/docker-compose.yml`.
3. Cargar variables de entorno (las de `.env`), fijar dominios `date.pe` y `*.date.pe`.
4. Deploy. (El compose ya trae los labels de Traefik y la red `coolify`.)
