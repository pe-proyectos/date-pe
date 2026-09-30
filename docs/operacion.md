# Operación de date.pe

Guía corta para mantener la plataforma: respaldos, restauración, alertas y estado.
Todo se ve también en `https://date.pe/superadmin#estado`.

## Respaldos de la base de datos

- Cada día desde las 3 am (hora de Lima) la API hace `pg_dump`, lo cifra con AES-256-GCM
  y lo sube a Cloudflare R2 en `backups/` del bucket `datepe`. Si falla, reintenta hasta 3
  veces ese día y avisa por correo.
- Antes de subirlo, el volcado se restaura en una base de prueba (`datepe_restore_check`) y
  se comparan las filas de las tablas principales. Si no cuadra, el respaldo cuenta como
  fallido. También se comprueba que el archivo cifrado se descifra idéntico.
- Se guardan 30 días (y siempre al menos los 7 últimos).
- Botón "Respaldar ahora" en el superadmin, o `POST /api/platform/backups/run`.

### La llave BACKUP_KEY

Sin `BACKUP_KEY` los respaldos no se pueden abrir. Vive en `.env` y **debe tener una copia
fuera del servidor** (gestor de contraseñas). Si el servidor se pierde, el `.env` se pierde
con él.

### Restaurar

Dentro del contenedor de la API (o en cualquier máquina con Node, pnpm, `pg_restore` 16 y
las variables `BACKUP_KEY`, `R2_*`, `DATABASE_URL`):

```bash
cd deploy
# Ver respaldos disponibles
docker compose exec -T api pnpm --filter @datepe/api restore list
# Restaurar el último en una base aparte para revisarlo (no toca producción)
docker compose exec -T api pnpm --filter @datepe/api restore latest --into datepe_revision
# Solo descargar y descifrar el volcado
docker compose exec -T api pnpm --filter @datepe/api restore latest --file /tmp/datepe.dump
```

Reemplazar producción (último recurso, detiene todo lo conectado a la base):

```bash
docker compose stop api watchdog
docker compose run --rm api pnpm --filter @datepe/api restore <clave|latest> --into datepe --i-know-this-replaces-production
docker compose up -d api watchdog
```

### Servidor nuevo desde cero

1. Clonar el repo, copiar el `.env` (con `BACKUP_KEY` y las llaves de R2) y levantar solo la
   base: `docker compose up -d datepe-db`.
2. Crear el rol de la app antes de restaurar:
   `docker compose exec datepe-db psql -U datepe -d datepe -c "CREATE ROLE datepe_app LOGIN PASSWORD 'datepe_app'"`
3. `docker compose build api && docker compose run --rm api pnpm --filter @datepe/api restore latest --into datepe --i-know-this-replaces-production`
4. `docker compose up -d` y apuntar el DNS de `date.pe` y `*.date.pe` al servidor nuevo.

## Alertas

Llegan por correo a `PLATFORM_NOTIFY_EMAIL` (como máximo una por tipo cada 30 minutos) y
quedan en `platform_alerts`:

- Errores 500 de la API (con la ruta y el detalle).
- Fallas del planificador (recordatorios, cobros, respaldos, etc.).
- Respaldo fallido o sin respaldo nuevo en más de 26 horas.
- Disco del servidor al 90% o más.
- Vigía caído (`datepe-watchdog` sin reportar 10 minutos).
- Del vigía: API, página principal o página de una barbería sin responder 3 minutos
  seguidos, y aviso cuando vuelven. Certificado HTTPS a menos de 14 días de vencer.

El vigía corre en el mismo servidor, así que no puede avisar si se cae el servidor completo.
Para eso conviene un monitor externo gratuito (UptimeRobot o Better Stack) apuntando a
`https://date.pe/api/health`, que responde `ok: false` si la base o el planificador fallan.

## Datos legales de date.pe

Para el Libro de Reclamaciones de la plataforma (`date.pe/reclamaciones`) completar en `.env`:
`PLATFORM_LEGAL_NAME`, `PLATFORM_RUC`, `PLATFORM_ADDRESS`. Las páginas `/terminos` y
`/privacidad` tienen un recuadro para completar la razón social y el RUC.
