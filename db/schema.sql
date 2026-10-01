-- date.pe: esquema multi-tenant (idempotente; se aplica al arrancar la API)
-- Aislamiento: esquema compartido + tenant_id + Row Level Security (RLS).
-- La API abre 2 pools: uno "admin" (owner, para migrar y el registro de tenants)
-- y uno "app" (rol datepe_app SIN bypass de RLS) para consultas por request.

-- ---------------------------------------------------------------------------
-- Rol de aplicación (RLS se aplica a este rol; el owner lo bypassea)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'datepe_app') THEN
    CREATE ROLE datepe_app LOGIN PASSWORD 'datepe_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO datepe_app;

-- ---------------------------------------------------------------------------
-- Registro de tenants (sin RLS: es el índice global de barberías)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,              -- = subdominio (barberiajuana)
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'trial'
               CHECK (status IN ('trial','active','suspended','cancelled')),
  plan         text NOT NULL DEFAULT 'suite',
  custom_domain text UNIQUE,                      -- futuro: dominio propio
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id       uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  logo_url        text,
  cover_url       text,
  color_primary   text NOT NULL DEFAULT '#111111',
  color_secondary text NOT NULL DEFAULT '#f5f5f5',
  font_family     text,
  tagline         text,
  about           text,
  instagram       text,
  whatsapp        text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id            uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  timezone             text NOT NULL DEFAULT 'America/Lima',
  slot_interval_min    int  NOT NULL DEFAULT 15,
  deposit_percent      int  NOT NULL DEFAULT 0 CHECK (deposit_percent BETWEEN 0 AND 100),
  cancel_window_hours  int  NOT NULL DEFAULT 24,
  require_deposit      boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Usuarios y pertenencia a tenants (auth del panel)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text,
  name          text,
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'owner'
             CHECK (role IN ('owner','manager','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

-- ---------------------------------------------------------------------------
-- Geo (referencia global para SEO/búsqueda)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo_districts (
  id        serial PRIMARY KEY,
  province  text NOT NULL,
  district  text NOT NULL,
  slug      text NOT NULL UNIQUE,     -- lima/miraflores
  lat       double precision,
  lng       double precision,
  UNIQUE (province, district)
);

-- ---------------------------------------------------------------------------
-- Entidades de negocio (con tenant_id + RLS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     text,
  district_id int REFERENCES geo_districts(id),
  district    text,
  province    text,
  lat         double precision,
  lng         double precision,
  phone       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id   uuid REFERENCES locations(id) ON DELETE SET NULL,
  name          text NOT NULL,
  photo_url     text,                              -- en r2.date.pe
  bio           text,
  specialties   text[],
  is_bookable   boolean NOT NULL DEFAULT true,     -- aparece como peluquero elegible
  rating_avg    numeric(3,2) NOT NULL DEFAULT 0,
  rating_count  int NOT NULL DEFAULT 0,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Turnos recurrentes: a qué hora atiende cada barbero por día de semana
CREATE TABLE IF NOT EXISTS staff_schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  location_id  uuid REFERENCES locations(id) ON DELETE CASCADE,
  day_of_week  int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=domingo
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  CHECK (end_time > start_time)
);

-- Excepciones: días libres / bloqueos puntuales
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text,
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category      text,
  name          text NOT NULL,
  description   text,
  photo_url     text,                              -- en r2.date.pe
  duration_min  int NOT NULL DEFAULT 30,
  buffer_min    int NOT NULL DEFAULT 0,
  price_cents   int NOT NULL DEFAULT 0,            -- en céntimos de sol
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Qué barbero ofrece qué servicio (+ override de precio/duración por barbero)
CREATE TABLE IF NOT EXISTS service_staff (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id    uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  price_cents   int,
  duration_min  int,
  PRIMARY KEY (service_id, staff_id)
);

CREATE TABLE IF NOT EXISTS clients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone              text NOT NULL,                -- E.164
  name               text,
  email              text,
  whatsapp_verified  boolean NOT NULL DEFAULT false,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS appointments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id   uuid REFERENCES locations(id) ON DELETE SET NULL,
  staff_id      uuid REFERENCES staff(id) ON DELETE SET NULL,
  client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','completed','no_show','cancelled')),
  price_cents   int NOT NULL DEFAULT 0,
  source        text NOT NULL DEFAULT 'online',
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS appointment_services (
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id     uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  price_cents    int NOT NULL DEFAULT 0,
  duration_min   int NOT NULL DEFAULT 30,
  PRIMARY KEY (appointment_id, service_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  kind           text NOT NULL DEFAULT 'deposit' CHECK (kind IN ('deposit','full','refund')),
  method         text NOT NULL DEFAULT 'yape' CHECK (method IN ('yape','plin','card','cash')),
  amount_cents   int NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','authorized','captured','failed','refunded')),
  provider       text,
  provider_ref   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  staff_id       uuid REFERENCES staff(id) ON DELETE SET NULL,
  stars          int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment        text,
  reply          text,
  is_published   boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Promociones / códigos de descuento
CREATE TABLE IF NOT EXISTS promotions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text NOT NULL,
  kind        text NOT NULL DEFAULT 'percent' CHECK (kind IN ('percent','fixed')),
  value       int NOT NULL,               -- percent (0-100) o céntimos
  active      boolean NOT NULL DEFAULT true,
  expires_at  timestamptz,
  max_uses    int,
  used_count  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- Gift cards
CREATE TABLE IF NOT EXISTS gift_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  initial_cents int NOT NULL,
  balance_cents int NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- Planes de membresía
CREATE TABLE IF NOT EXISTS membership_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  price_cents int NOT NULL,
  period      text NOT NULL DEFAULT 'month' CHECK (period IN ('month','year')),
  perks       text,
  active      boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Lealtad + fidelidad
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loyalty_points int NOT NULL DEFAULT 0;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS loyalty_points_per_visit int NOT NULL DEFAULT 10;

-- Descuentos aplicados en la cita
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS list_price_cents int;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_cents int NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS gift_card_code text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS points_awarded boolean NOT NULL DEFAULT false;

-- Barberías de demostración (se muestran con etiqueta "Demo")
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Una reseña por cita
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_appointment ON reviews (appointment_id) WHERE appointment_id IS NOT NULL;

-- Blog global de date.pe (sin tenant)
CREATE TABLE IF NOT EXISTS blog_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  excerpt      text,
  body_md      text,
  cover_url    text,
  district_id  int REFERENCES geo_districts(id),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ===========================================================================
-- Suscripción de la barbería a date.pe (S/50 al mes)
-- ===========================================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paid_until timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS monthly_price_cents int NOT NULL DEFAULT 5000;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS domain_status text;   -- pending | active | error
UPDATE tenants SET trial_ends_at = created_at + interval '14 days' WHERE trial_ends_at IS NULL;

-- Cobros de date.pe a cada barbería (global, sin RLS: se consulta por tenant_id en la API)
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount_cents  int NOT NULL,
  months        int NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','void')),
  provider      text,
  provider_ref  text,
  paid_at       timestamptz,
  period_start  timestamptz,
  period_end    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_inv_tenant ON subscription_invoices (tenant_id, created_at DESC);

-- Registro de avisos enviados (evita duplicados del planificador)
CREATE TABLE IF NOT EXISTS notification_log (
  key        text PRIMARY KEY,
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,
  sent_at    timestamptz NOT NULL DEFAULT now()
);

-- Recuperación de contraseña
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_slug text,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Códigos de verificación del cliente (por correo; WhatsApp cuando se active)
CREATE TABLE IF NOT EXISTS otp_codes (
  key        text PRIMARY KEY,         -- tenant_id|destino
  code_hash  text NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz
);

-- ===========================================================================
-- Operación de la barbería
-- ===========================================================================
-- Avisos automáticos y reglas
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS review_requests_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS rebook_days int NOT NULL DEFAULT 21;       -- 0 = apagado
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS notify_owner_email text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS require_verification boolean NOT NULL DEFAULT false;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS allow_client_reschedule boolean NOT NULL DEFAULT true;
-- Referidos
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS referral_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS referral_discount_percent int NOT NULL DEFAULT 10 CHECK (referral_discount_percent BETWEEN 0 AND 100);
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS referral_reward_points int NOT NULL DEFAULT 50;
-- Comprobantes electrónicos (SUNAT vía Nubefact)
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS sunat_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS sunat_ruc text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS sunat_razon_social text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS sunat_direccion text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS sunat_serie_boleta text NOT NULL DEFAULT 'B001';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS sunat_serie_factura text NOT NULL DEFAULT 'F001';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS nubefact_url text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS nubefact_token text;
-- Cobro directo del adelanto a la cuenta de MercadoPago de la barbería
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS mp_access_token text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS mp_public_key text;

-- Citas: avisos enviados, enlace de gestión, referidos
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manage_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_24h_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_2h_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rebook_sent_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS referred_by_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS referral_rewarded boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_appt_manage_token ON appointments (manage_token);

-- Clientes: código para invitar amigos
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_referral ON clients (tenant_id, referral_code) WHERE referral_code IS NOT NULL;

-- Servicios: extras que se suman a un servicio principal
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false;

-- Barberos: comisión sobre lo que atienden
ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_percent int NOT NULL DEFAULT 0 CHECK (commission_percent BETWEEN 0 AND 100);

-- Pagos: la barbería puede cobrar en efectivo o por transferencia en el local
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('yape','plin','card','cash','transfer'));

-- Lista de espera: avisar si se libera un horario ese día
CREATE TABLE IF NOT EXISTS waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id  uuid REFERENCES services(id) ON DELETE CASCADE,
  staff_id    uuid REFERENCES staff(id) ON DELETE SET NULL,
  day         date NOT NULL,
  name        text NOT NULL,
  phone       text NOT NULL,
  email       text,
  notified_at timestamptz,
  booked      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_waitlist_day ON waitlist (tenant_id, day);

-- Comprobantes emitidos (boletas y facturas)
CREATE TABLE IF NOT EXISTS receipts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  kind           text NOT NULL DEFAULT 'boleta' CHECK (kind IN ('boleta','factura')),
  serie          text NOT NULL,
  numero         int NOT NULL,
  customer_doc_type text,            -- 1 DNI, 6 RUC, - sin documento
  customer_doc   text,
  customer_name  text,
  total_cents    int NOT NULL,
  status         text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','simulated','error','void')),
  pdf_url        text,
  sunat_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, serie, numero)
);
CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts (tenant_id, created_at DESC);


-- ===========================================================================
-- Funciones activables por barbería y su configuración
-- ===========================================================================
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tv_config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS queue_config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE tenant_settings DROP COLUMN IF EXISTS music_config;
UPDATE tenant_settings SET features = features - 'music', tv_config = tv_config - 'showMusic' WHERE features ? 'music' OR tv_config ? 'showMusic';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS pos_config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS marketing_config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS google_review_url text;
ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS show_powered_by boolean NOT NULL DEFAULT true;
ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]';
-- Estilo de la página pública: ambiente (clasica|urbana|minimal|lujo|vintage), portada, frase grande
ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS site_theme jsonb NOT NULL DEFAULT '{}';

-- ===========================================================================
-- Equipo: cuentas con rol (dueño, encargado, caja, barbero)
-- ===========================================================================
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner','manager','cashier','staff'));
CREATE TABLE IF NOT EXISTS team_invites (
  token_hash  text PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('manager','cashier','staff')),
  staff_id    uuid REFERENCES staff(id) ON DELETE SET NULL,
  invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- Caja: turnos de caja, ventas, pagos mixtos, propinas, movimientos
-- ===========================================================================
CREATE TABLE IF NOT EXISTS cash_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id     uuid REFERENCES locations(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  opening_cents   int NOT NULL DEFAULT 0,
  closed_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at       timestamptz,
  expected_cents  int,
  counted_cents   int,
  difference_cents int,
  notes           text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_open ON cash_sessions (tenant_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS cash_movements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('in','out')),
  amount_cents int NOT NULL CHECK (amount_cents > 0),
  reason       text NOT NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id     uuid REFERENCES locations(id) ON DELETE SET NULL,
  session_id      uuid REFERENCES cash_sessions(id) ON DELETE SET NULL,
  number          int NOT NULL,
  appointment_id  uuid REFERENCES appointments(id) ON DELETE SET NULL,
  ticket_id       uuid,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  staff_id        uuid REFERENCES staff(id) ON DELETE SET NULL,
  subtotal_cents  int NOT NULL DEFAULT 0,
  discount_cents  int NOT NULL DEFAULT 0,
  tip_cents       int NOT NULL DEFAULT 0,
  total_cents     int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','void')),
  receipt_url     text,            -- boleta o factura que la barbería sube (opcional)
  receipt_number  text,
  note            text,
  void_reason     text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_time ON sales (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id          uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('service','product','package','gift_card','membership','other')),
  ref_id           uuid,
  name             text NOT NULL,
  qty              int NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_cents       int NOT NULL,
  total_cents      int NOT NULL,
  staff_id         uuid REFERENCES staff(id) ON DELETE SET NULL,
  commission_cents int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id      uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method       text NOT NULL CHECK (method IN ('cash','yape','plin','card','transfer','gift_card','deposit','package','points')),
  amount_cents int NOT NULL,
  reference    text
);

-- ===========================================================================
-- Productos e inventario
-- ===========================================================================
CREATE TABLE IF NOT EXISTS products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               text NOT NULL,
  sku                text,
  category           text,
  price_cents        int NOT NULL DEFAULT 0,
  cost_cents         int NOT NULL DEFAULT 0,
  stock              int NOT NULL DEFAULT 0,
  min_stock          int NOT NULL DEFAULT 0,
  commission_percent int NOT NULL DEFAULT 0 CHECK (commission_percent BETWEEN 0 AND 100),
  photo_url          text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta       int NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('sale','purchase','adjust','void')),
  sale_id     uuid REFERENCES sales(id) ON DELETE SET NULL,
  note        text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- Gastos, adelantos y liquidación del equipo
-- ===========================================================================
CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id  uuid REFERENCES locations(id) ON DELETE SET NULL,
  spent_on     date NOT NULL DEFAULT CURRENT_DATE,
  category     text NOT NULL,
  amount_cents int NOT NULL CHECK (amount_cents > 0),
  method       text,
  note         text,
  receipt_url  text,
  session_id   uuid REFERENCES cash_sessions(id) ON DELETE SET NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS staff_payouts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id                 uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period_start             date NOT NULL,
  period_end               date NOT NULL,
  services_cents           int NOT NULL DEFAULT 0,
  commission_cents         int NOT NULL DEFAULT 0,
  product_commission_cents int NOT NULL DEFAULT 0,
  tips_cents               int NOT NULL DEFAULT 0,
  advances_cents           int NOT NULL DEFAULT 0,
  total_cents              int NOT NULL DEFAULT 0,
  method                   text,
  note                     text,
  paid_at                  timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS staff_advances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  amount_cents int NOT NULL CHECK (amount_cents > 0),
  note         text,
  given_on     date NOT NULL DEFAULT CURRENT_DATE,
  payout_id    uuid REFERENCES staff_payouts(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- Fila virtual y pantalla de TV
-- ===========================================================================
CREATE TABLE IF NOT EXISTS queue_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id  uuid REFERENCES locations(id) ON DELETE SET NULL,
  day          date NOT NULL,
  number       int NOT NULL,
  name         text NOT NULL,
  phone        text,
  email        text,
  service_id   uuid REFERENCES services(id) ON DELETE SET NULL,
  staff_id     uuid REFERENCES staff(id) ON DELETE SET NULL,       -- barbero preferido (null = el primero libre)
  status       text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','called','serving','done','cancelled','no_show')),
  token        text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  source       text NOT NULL DEFAULT 'qr' CHECK (source IN ('qr','front','booking')),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  served_by    uuid REFERENCES staff(id) ON DELETE SET NULL,
  called_at    timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  sale_id      uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_token ON queue_tickets (token);
ALTER TABLE queue_tickets ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();   -- orden en la fila ("me demoro" lo mueve)
ALTER TABLE queue_tickets ADD COLUMN IF NOT EXISTS delays int NOT NULL DEFAULT 0;
ALTER TABLE queue_tickets ADD COLUMN IF NOT EXISTS near_notified_at timestamptz;
ALTER TABLE queue_tickets ADD COLUMN IF NOT EXISTS recalled_at timestamptz;   -- segundo llamado automático
ALTER TABLE queue_tickets ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
-- Llave de la pantalla: la URL de la TV la lleva para controlar la música
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tv_key text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE INDEX IF NOT EXISTS idx_queue_day ON queue_tickets (tenant_id, day, status);

-- La música a pedido se retiró: se eliminan sus tablas
DROP TABLE IF EXISTS song_votes;
DROP TABLE IF EXISTS song_requests;

-- ===========================================================================
-- Ficha del cliente
-- ===========================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferences text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS allergies text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS unsubscribe_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE TABLE IF NOT EXISTS client_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  url            text NOT NULL,
  caption        text,
  staff_id       uuid REFERENCES staff(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- Paquetes, premios por puntos, membresías vendidas, gift cards en línea
-- ===========================================================================
CREATE TABLE IF NOT EXISTS packages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  price_cents  int NOT NULL,
  uses         int NOT NULL CHECK (uses > 0),
  service_ids  uuid[] NOT NULL DEFAULT '{}',   -- vacío = cualquier servicio
  valid_days   int NOT NULL DEFAULT 180,
  sell_online  boolean NOT NULL DEFAULT true,
  active       boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS client_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  package_id  uuid REFERENCES packages(id) ON DELETE SET NULL,
  name        text NOT NULL,
  service_ids uuid[] NOT NULL DEFAULT '{}',
  uses_total  int NOT NULL,
  uses_left   int NOT NULL,
  expires_at  timestamptz,
  sale_id     uuid REFERENCES sales(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rewards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  points_cost  int NOT NULL CHECK (points_cost > 0),
  kind         text NOT NULL CHECK (kind IN ('free_service','discount_fixed','discount_percent','product')),
  value        int NOT NULL DEFAULT 0,
  ref_id       uuid,
  active       boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  reward_id   uuid REFERENCES rewards(id) ON DELETE SET NULL,
  name        text NOT NULL,
  points      int NOT NULL,
  sale_id     uuid REFERENCES sales(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS client_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_id     uuid REFERENCES membership_plans(id) ON DELETE SET NULL,
  name        text NOT NULL,
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  sale_id     uuid REFERENCES sales(id) ON DELETE SET NULL,
  renew_reminded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS discount_percent int NOT NULL DEFAULT 0;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS included_uses int NOT NULL DEFAULT 0;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin';
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS buyer_name text;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS buyer_email text;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS recipient_email text;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT true;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS deliver_at timestamptz;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'deposit';   -- deposit | gift_card | package
ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose_ref uuid;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE payments ALTER COLUMN appointment_id DROP NOT NULL;

-- ===========================================================================
-- Marketing
-- ===========================================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  segment      jsonb NOT NULL DEFAULT '{}',
  subject      text NOT NULL,
  body         text NOT NULL,
  promo_code   text,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent')),
  sent_count   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE TABLE IF NOT EXISTS campaign_sends (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, client_id)
);

-- ===========================================================================
-- Notificaciones push (dueños, barberos y clientes en la fila)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  ticket_id  uuid REFERENCES queue_tickets(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Cliente de la barbería que pidió avisos en su celular (recordatorios, reseña, volver a reservar)
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_push_client ON push_subscriptions (client_id) WHERE client_id IS NOT NULL;


-- ===========================================================================
-- Solicitudes de registro de barberías (date.pe las revisa y contacta)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS shop_applications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status           text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','negotiating','approved','rejected')),
  shop_name        text NOT NULL,
  desired_slug     text,
  owner_name       text NOT NULL,
  email            text NOT NULL,
  phone            text NOT NULL,
  role             text,                 -- dueño, socio, administrador
  district         text,
  city             text NOT NULL DEFAULT 'Lima',
  address          text,
  locations_count  text NOT NULL,        -- 1 | 2-3 | 4-10 | 10+
  staff_size       text NOT NULL,        -- 0-5 | 5-15 | 15-30 | 30+
  daily_clients    text NOT NULL,        -- 1-10 | 10-30 | 30-60 | 60-100 | 100+
  years_open       text,
  services         text[] NOT NULL DEFAULT '{}',
  current_booking  text[] NOT NULL DEFAULT '{}',   -- whatsapp, llamadas, cuaderno, otra app, sin reservas
  current_software text,
  interests        text[] NOT NULL DEFAULT '{}',   -- reservas, fila, caja, tv, marketing, ...
  payment_methods  text[] NOT NULL DEFAULT '{}',
  instagram        text,
  website          text,
  heard_from       text,
  contact_pref     text,                 -- whatsapp | llamada | correo
  contact_time     text,                 -- mañana | tarde | noche
  comments         text,
  -- Seguimiento del equipo de date.pe
  internal_notes   text,
  agreed_price_cents int,
  contacted_at     timestamptz,
  decided_at       timestamptz,
  tenant_id        uuid REFERENCES tenants(id) ON DELETE SET NULL,
  source_ip        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_apps_status ON shop_applications (status, created_at DESC);

-- ===========================================================================
-- Libro de Reclamaciones virtual (Código de Protección al Consumidor, Ley 29571)
-- tenant_id NULL = libro de la propia plataforma date.pe
-- ===========================================================================
CREATE TABLE IF NOT EXISTS complaints (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid REFERENCES tenants(id) ON DELETE CASCADE,
  location_id         uuid REFERENCES locations(id) ON DELETE SET NULL,
  year                int  NOT NULL,
  number              int  NOT NULL,
  code                text NOT NULL,                 -- 2026-000001
  kind                text NOT NULL CHECK (kind IN ('reclamo','queja')),
  consumer_name       text NOT NULL,
  consumer_doc_type   text NOT NULL CHECK (consumer_doc_type IN ('DNI','CE','Pasaporte','RUC')),
  consumer_doc_number text NOT NULL,
  consumer_address    text,
  consumer_phone      text,
  consumer_email      text NOT NULL,
  is_minor            boolean NOT NULL DEFAULT false,
  guardian_name       text,
  item_type           text NOT NULL CHECK (item_type IN ('servicio','producto')),
  item_amount_cents   int,
  item_description    text NOT NULL,
  detail              text NOT NULL,
  request             text NOT NULL,                 -- pedido del consumidor
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered')),
  response            text,
  responded_at        timestamptz,
  responded_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  due_at              timestamptz NOT NULL,          -- 15 días hábiles
  reminded_at         timestamptz,
  source_ip           text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_complaints_number ON complaints (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), year, number);
CREATE INDEX IF NOT EXISTS idx_complaints_tenant ON complaints (tenant_id, created_at DESC);
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS sunat_direccion text;

-- Clientes traídos desde Excel u otro sistema: se guarda su historial previo
ALTER TABLE clients ADD COLUMN IF NOT EXISTS import_visits int;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS import_last_visit date;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS imported_at timestamptz;

-- Guía de primeros pasos: pasos marcados a mano (compartir link, TV) y si se ocultó
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS setup_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Caja sin internet: la venta hecha sin conexión lleva una referencia única del
-- dispositivo, así al reintentar no se duplica
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_ref text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_client_ref ON sales (tenant_id, client_ref) WHERE client_ref IS NOT NULL;

-- ===========================================================================
-- Operación de la plataforma: respaldos, alertas y estado (solo adminPool)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS platform_backups (
  id           bigserial PRIMARY KEY,
  object_key   text,
  size_bytes   bigint,
  sha256       text,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed')),
  error        text,
  verified_at  timestamptz,
  verify_note  text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  deleted_at   timestamptz
);
CREATE TABLE IF NOT EXISTS platform_alerts (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,
  level        text NOT NULL DEFAULT 'error' CHECK (level IN ('info','warn','error')),
  message      text NOT NULL,
  detail       text,
  emailed      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_alerts_time ON platform_alerts (created_at DESC);
CREATE TABLE IF NOT EXISTS platform_state (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Índices (tenant_id como primera columna en tablas de negocio)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_locations_tenant   ON locations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_locations_district ON locations (district_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_staff_tenant       ON staff (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sched_tenant_staff ON staff_schedules (tenant_id, staff_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_exc_tenant_staff   ON schedule_exceptions (tenant_id, staff_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_services_tenant    ON services (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant     ON clients (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_appts_tenant_time  ON appointments (tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appts_staff_time   ON appointments (tenant_id, staff_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_payments_tenant    ON payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant     ON reviews (tenant_id);

-- ---------------------------------------------------------------------------
-- RLS: activar y crear políticas (idempotente vía DO)
-- tenant_rw  -> filas del tenant en sesión (SET LOCAL app.tenant_id)
-- public_ro  -> lectura cross-tenant controlada (SET LOCAL app.public_read='on')
-- ---------------------------------------------------------------------------
-- Pagos directos a la barbería (Yape o Plin): el cliente sube la captura y la barbería confirma.
-- date.pe no recibe ni mueve dinero de los clientes.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_key text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS pay_phone text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS pay_holder text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS pay_qr_url text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS pay_apps text[] NOT NULL DEFAULT '{yape,plin}';
-- Documento del cliente (DNI o carné de extranjería) para reservar sin crear cuenta
ALTER TABLE clients ADD COLUMN IF NOT EXISTS doc_number text;
CREATE INDEX IF NOT EXISTS idx_clients_doc ON clients (tenant_id, doc_number) WHERE doc_number IS NOT NULL;

-- Visitas a la página de cada barbería (anónimas: sin cookies, id aleatorio del navegador)
CREATE TABLE IF NOT EXISTS site_events (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('view','book_click','book_start')),
  path        text,
  source      text,
  visitor     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_events_tenant ON site_events (tenant_id, created_at DESC);

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'tenant_branding','tenant_settings','locations','staff','staff_schedules',
    'schedule_exceptions','services','service_staff','clients','appointments',
    'appointment_services','payments','reviews','promotions','gift_cards','membership_plans',
    'waitlist','receipts',
    'cash_sessions','cash_movements','sales','sale_items','sale_payments','products','stock_movements',
    'expenses','staff_payouts','staff_advances','queue_tickets',
    'client_photos','packages','client_packages','rewards','reward_redemptions','client_memberships',
    'campaigns','campaign_sends','push_subscriptions','complaints','site_events'
  ];
  public_tables text[] := ARRAY['locations','staff','services','service_staff','reviews','tenant_branding','tenant_settings','membership_plans'];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- política rw por tenant (NULLIF evita castear '' a uuid)
    EXECUTE format('DROP POLICY IF EXISTS tenant_rw ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_rw ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      || 'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO datepe_app', t);
  END LOOP;

  FOREACH t IN ARRAY public_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS public_ro ON %I', t);
    EXECUTE format(
      'CREATE POLICY public_ro ON %I FOR SELECT USING (current_setting(''app.public_read'', true) = ''on'')', t);
  END LOOP;
END
$$;

-- El rol app puede leer el registro de tenants y geo (cross-tenant, solo lectura)
GRANT SELECT ON tenants, geo_districts, blog_posts TO datepe_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_invites TO datepe_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, memberships TO datepe_app;

-- Privilegios por defecto para futuras tablas creadas por el owner
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO datepe_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO datepe_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO datepe_app;

-- Servicios por sede: vacío = se ofrece en todas
ALTER TABLE services ADD COLUMN IF NOT EXISTS location_ids uuid[] NOT NULL DEFAULT '{}';


-- Tablas de operación de la plataforma: nunca visibles para el rol de la app
REVOKE ALL ON platform_backups, platform_alerts, platform_state FROM datepe_app;
