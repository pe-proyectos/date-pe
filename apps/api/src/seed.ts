import { adminPool } from './db.js';
import { runMigrations } from './migrate.js';
import { hashPassword } from './lib/crypto.js';

const DISTRICTS: Array<[string, string, string, number, number]> = [
  ['Lima', 'Miraflores', 'lima/miraflores', -12.1211, -77.0297],
  ['Lima', 'San Isidro', 'lima/san-isidro', -12.0977, -77.0365],
  ['Lima', 'Surco', 'lima/surco', -12.135, -76.9917],
  ['Lima', 'San Borja', 'lima/san-borja', -12.1088, -76.9986],
  ['Lima', 'La Molina', 'lima/la-molina', -12.079, -76.944],
  ['Lima', 'Barranco', 'lima/barranco', -12.1494, -77.0206],
  ['Lima', 'Jesús María', 'lima/jesus-maria', -12.0741, -77.0492],
  ['Lima', 'Los Olivos', 'lima/los-olivos', -11.969, -77.07],
];

async function seed() {
  await runMigrations();

  // Distritos
  for (const [province, district, slug, lat, lng] of DISTRICTS) {
    await adminPool.query(
      `INSERT INTO geo_districts (province, district, slug, lat, lng)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (slug) DO NOTHING`,
      [province, district, slug, lat, lng],
    );
  }

  // Tenant demo
  const t = await adminPool.query<{ id: string }>(
    `INSERT INTO tenants (slug, name, status, plan) VALUES ('barberiajuana','Barbería Juana','active','suite')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  const tenantId = t.rows[0].id;

  await adminPool.query(
    `INSERT INTO tenant_settings (tenant_id, slot_interval_min, deposit_percent, require_deposit)
     VALUES ($1, 15, 20, true) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );
  await adminPool.query(
    `INSERT INTO tenant_branding (tenant_id, color_primary, color_secondary, tagline, about, whatsapp)
     VALUES ($1, '#0f172a', '#f8fafc', 'Cortes con estilo en Miraflores', 'La mejor barbería del barrio.', '+51999999999')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );

  // Dueño
  const u = await adminPool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name) VALUES ('juana@date.pe', $1, 'Juana')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [hashPassword('barberia123')],
  );
  await adminPool.query(
    `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
    [u.rows[0].id, tenantId],
  );

  // Local
  const distr = await adminPool.query<{ id: number }>(
    "SELECT id FROM geo_districts WHERE slug = 'lima/miraflores'",
  );
  const loc = await adminPool.query<{ id: string }>(
    `INSERT INTO locations (tenant_id, name, address, district_id, district, province, lat, lng, phone)
     VALUES ($1, 'Sede Miraflores', 'Av. Larco 123', $2, 'Miraflores', 'Lima', -12.1211, -77.0297, '+5114440000')
     RETURNING id`,
    [tenantId, distr.rows[0]?.id ?? null],
  );
  const locationId = loc.rows[0].id;

  // Barberos
  const barbers = [
    { name: 'Carlos', bio: 'Especialista en fades', spec: ['fade', 'barba'] },
    { name: 'María', bio: 'Cortes clásicos y modernos', spec: ['clásico', 'diseño'] },
  ];
  const staffIds: string[] = [];
  for (const [i, b] of barbers.entries()) {
    const s = await adminPool.query<{ id: string }>(
      `INSERT INTO staff (tenant_id, location_id, name, bio, specialties, is_bookable, sort_order)
       VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING id`,
      [tenantId, locationId, b.name, b.bio, b.spec, i],
    );
    staffIds.push(s.rows[0].id);
  }

  // Horarios: lunes(1)-sábado(6), 10:00-20:00
  for (const staffId of staffIds) {
    for (let dow = 1; dow <= 6; dow++) {
      await adminPool.query(
        `INSERT INTO staff_schedules (tenant_id, staff_id, location_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4, '10:00', '20:00')`,
        [tenantId, staffId, locationId, dow],
      );
    }
  }

  // Servicios
  const services = [
    ['Corte', 'Corte de cabello', 30, 2500],
    ['Barba', 'Perfilado de barba', 20, 1500],
    ['Corte + Barba', 'Combo completo', 45, 3500],
  ];
  for (const [i, [name, desc, dur, price]] of services.entries()) {
    await adminPool.query(
      `INSERT INTO services (tenant_id, category, name, description, duration_min, price_cents, is_active, sort_order)
       VALUES ($1, 'Barbería', $2, $3, $4, $5, true, $6)`,
      [tenantId, name, desc, dur, price, i],
    );
  }

  // Superadmin de plataforma
  await adminPool.query(
    `INSERT INTO users (email, password_hash, name, is_platform_admin)
     VALUES ('admin@date.pe', $1, 'Superadmin', true)
     ON CONFLICT (email) DO UPDATE SET is_platform_admin = true, password_hash = EXCLUDED.password_hash`,
    [hashPassword('superadmin123')],
  );

  console.log('✔ Seed completo.');
  console.log('  Tenant: barberiajuana  ->  http://barberiajuana.lvh.me:3000');
  console.log('  Login panel: juana@date.pe / barberia123');
  console.log('  Superadmin: admin@date.pe / superadmin123  ->  /superadmin');
  await adminPool.end();
}

seed().catch((err) => {
  console.error('✗ Error en seed:', err);
  process.exit(1);
});
