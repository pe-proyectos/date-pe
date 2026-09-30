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
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'tenant_branding','tenant_settings','locations','staff','staff_schedules',
    'schedule_exceptions','services','service_staff','clients','appointments',
    'appointment_services','payments','reviews','promotions','gift_cards','membership_plans',
    'waitlist','receipts'
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
GRANT SELECT, INSERT, UPDATE, DELETE ON users, memberships TO datepe_app;

-- Privilegios por defecto para futuras tablas creadas por el owner
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO datepe_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO datepe_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO datepe_app;
