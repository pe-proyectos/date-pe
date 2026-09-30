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
  ['Lima', 'Magdalena', 'lima/magdalena', -12.0906, -77.0703],
  ['Lima', 'Lince', 'lima/lince', -12.0848, -77.0355],
  ['Lima', 'Pueblo Libre', 'lima/pueblo-libre', -12.0762, -77.0634],
  ['Lima', 'San Miguel', 'lima/san-miguel', -12.0772, -77.0932],
  ['Lima', 'Surquillo', 'lima/surquillo', -12.1128, -77.0198],
  ['Lima', 'La Victoria', 'lima/la-victoria', -12.0659, -77.0171],
  ['Lima', 'San Juan de Lurigancho', 'lima/san-juan-de-lurigancho', -11.9795, -77.0035],
  ['Lima', 'Comas', 'lima/comas', -11.9435, -77.0498],
];

const q = (text: string, params: unknown[] = []) => adminPool.query(text, params);
const one = async <T = { id: string }>(text: string, params: unknown[] = []) => (await adminPool.query(text, params)).rows[0] as T;

async function seed() {
  await runMigrations();

  for (const [province, district, slug, lat, lng] of DISTRICTS) {
    await q(
      `INSERT INTO geo_districts (province, district, slug, lat, lng) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (slug) DO NOTHING`,
      [province, district, slug, lat, lng],
    );
  }

  // La barbería demo se recrea desde cero en cada seed.
  await q(`DELETE FROM tenants WHERE slug = 'barberiajuana'`);
  const { id: tenantId } = await one(
    `INSERT INTO tenants (slug, name, status, plan, is_demo) VALUES ('barberiajuana', 'Barbería Juana', 'active', 'suite', true) RETURNING id`,
  );

  await q(
    `INSERT INTO tenant_settings (tenant_id, slot_interval_min, deposit_percent, require_deposit, cancel_window_hours, loyalty_points_per_visit)
     VALUES ($1, 15, 20, true, 12, 10)`,
    [tenantId],
  );
  await q(
    `INSERT INTO tenant_branding (tenant_id, cover_url, color_primary, color_secondary, tagline, about)
     VALUES ($1, '/img/tenant-cover.webp', '#0f4c5c', '#f4f4f5',
             'Cortes clásicos, fades y barba en Miraflores',
             'Tres sillones, café pasado y música bajita. Reserva tu hora y llega directo al sillón.')`,
    [tenantId],
  );

  const owner = await one(
    `INSERT INTO users (email, password_hash, name) VALUES ('juana@date.pe', $1, 'Juana')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash RETURNING id`,
    [hashPassword('barberia123')],
  );
  await q(`INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`, [owner.id, tenantId]);

  const distr = await one<{ id: number }>(`SELECT id FROM geo_districts WHERE slug = 'lima/miraflores'`);
  const { id: locationId } = await one(
    `INSERT INTO locations (tenant_id, name, address, district_id, district, province, lat, lng)
     VALUES ($1, 'Sede Miraflores', 'Av. José Larco, Miraflores', $2, 'Miraflores', 'Lima', -12.1211, -77.0297) RETURNING id`,
    [tenantId, distr?.id ?? null],
  );

  const barbers = [
    { name: 'Carlos', photo: '/img/staff-carlos.webp', bio: 'Fades y diseños a navaja.', spec: ['Fade', 'Barba'] },
    { name: 'María', photo: '/img/staff-maria.webp', bio: 'Cortes clásicos y con tijera.', spec: ['Clásico', 'Tijera'] },
    { name: 'Diego', photo: '/img/staff-diego.webp', bio: 'Afeitado con toalla caliente.', spec: ['Navaja', 'Barba'] },
  ];
  const staffIds: string[] = [];
  for (const [i, b] of barbers.entries()) {
    const s = await one(
      `INSERT INTO staff (tenant_id, location_id, name, photo_url, bio, specialties, is_bookable, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING id`,
      [tenantId, locationId, b.name, b.photo, b.bio, b.spec, i],
    );
    staffIds.push(s.id);
    for (let dow = 1; dow <= 6; dow++) {
      await q(
        `INSERT INTO staff_schedules (tenant_id, staff_id, location_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4, '10:00', '20:00')`,
        [tenantId, s.id, locationId, dow],
      );
    }
  }

  const services: Array<[string, string, number, number]> = [
    ['Corte', 'Tijera y máquina, lavado incluido', 30, 2500],
    ['Fade', 'Degradado a piel o bajo, con perfilado', 40, 3000],
    ['Barba', 'Perfilado, arreglo y aceite', 20, 1500],
    ['Corte y barba', 'El combo completo', 50, 4000],
    ['Afeitado con navaja', 'Toalla caliente, espuma y navaja', 30, 2500],
  ];
  const serviceIds: string[] = [];
  for (const [i, [name, desc, dur, price]] of services.entries()) {
    const s = await one(
      `INSERT INTO services (tenant_id, category, name, description, duration_min, buffer_min, price_cents, is_active, sort_order)
       VALUES ($1, 'Barbería', $2, $3, $4, 5, $5, true, $6) RETURNING id`,
      [tenantId, name, desc, dur, price, i],
    );
    serviceIds.push(s.id);
  }

  await q(
    `INSERT INTO membership_plans (tenant_id, name, description, price_cents, period, perks, sort_order) VALUES
       ($1, 'Club mensual', 'Para los que se cortan cada dos semanas', 7900, 'month', '2 cortes al mes|10% en productos', 0),
       ($1, 'Club barba', 'Corte y barba sin pensarlo', 9900, 'month', '2 cortes y barba al mes|Prioridad en sábados', 1)`,
    [tenantId],
  );
  await q(`INSERT INTO promotions (tenant_id, code, kind, value) VALUES ($1, 'BIENVENIDO', 'percent', 15)`, [tenantId]);
  await q(`INSERT INTO gift_cards (tenant_id, code, initial_cents, balance_cents) VALUES ($1, 'GIFT-DEMO01', 5000, 5000)`, [tenantId]);

  // Historial de ejemplo: citas completadas con reseña
  const history: Array<[string, string, number, number, number, string]> = [
    ['Luis Ramírez', '+51911000001', 0, 1, 5, 'Me hizo el fade igual a la foto que le enseñé. Llegué a mi hora y me atendieron al toque.'],
    ['Andrés Quispe', '+51911000002', 1, 0, 5, 'María tiene mano con la tijera. Primera vez que no me dejan el cerquillo chueco.'],
    ['Kevin Torres', '+51911000003', 2, 4, 4, 'El afeitado con toalla caliente vale cada sol. El local es chico, mejor reservar.'],
    ['Jorge Salazar', '+51911000004', 0, 3, 5, 'Reservé a las 9 de la noche para el día siguiente y pagué el adelanto con Yape. Cero llamadas.'],
  ];
  const clientIds: string[] = [];
  for (const [i, [name, phone, staffIdx, svcIdx, stars, comment]] of history.entries()) {
    const c = await one(
      `INSERT INTO clients (tenant_id, phone, name, loyalty_points) VALUES ($1, $2, $3, 10) RETURNING id`,
      [tenantId, phone, name],
    );
    clientIds.push(c.id);
    const price = services[svcIdx][3];
    const a = await one(
      `INSERT INTO appointments (tenant_id, location_id, staff_id, client_id, starts_at, ends_at, status, price_cents, list_price_cents, points_awarded)
       VALUES ($1, $2, $3, $4, now() - ($5 || ' days')::interval, now() - ($5 || ' days')::interval + interval '40 minutes', 'completed', $6, $6, true)
       RETURNING id`,
      [tenantId, locationId, staffIds[staffIdx], c.id, String(3 + i * 4), price],
    );
    await q(
      `INSERT INTO appointment_services (appointment_id, tenant_id, service_id, price_cents, duration_min) VALUES ($1, $2, $3, $4, $5)`,
      [a.id, tenantId, serviceIds[svcIdx], price, services[svcIdx][2]],
    );
    await q(
      `INSERT INTO reviews (tenant_id, appointment_id, staff_id, stars, comment, is_published, created_at)
       VALUES ($1, $2, $3, $4, $5, true, now() - ($6 || ' days')::interval)`,
      [tenantId, a.id, staffIds[staffIdx], stars, comment, String(3 + i * 4)],
    );
  }
  // Próximas citas para que la agenda del demo tenga movimiento (hora de Lima)
  const upcoming: Array<[number, number, number, number, number]> = [
    // [días desde hoy, hora, minuto, barbero, servicio]
    [1, 10, 0, 0, 1], [1, 11, 30, 1, 0], [1, 16, 0, 2, 3],
    [2, 10, 30, 1, 2], [2, 15, 0, 0, 1],
    [3, 12, 0, 2, 4], [3, 17, 0, 0, 0],
  ];
  for (const [k, [days, h, m, staffIdx, svcIdx]] of upcoming.entries()) {
    const [, , dur, price] = services[svcIdx];
    const a = await one(
      `INSERT INTO appointments (tenant_id, location_id, staff_id, client_id, starts_at, ends_at, status, price_cents, list_price_cents)
       VALUES ($1, $2, $3, $4,
         (date_trunc('day', now() AT TIME ZONE 'America/Lima') + make_interval(days => $5::int, hours => $6::int, mins => $7::int)) AT TIME ZONE 'America/Lima',
         (date_trunc('day', now() AT TIME ZONE 'America/Lima') + make_interval(days => $5::int, hours => $6::int, mins => $7::int + $8::int)) AT TIME ZONE 'America/Lima',
         'confirmed', $9, $9)
       RETURNING id`,
      [tenantId, locationId, staffIds[staffIdx], clientIds[k % clientIds.length], days, h, m, dur, price],
    );
    await q(
      `INSERT INTO appointment_services (appointment_id, tenant_id, service_id, price_cents, duration_min) VALUES ($1, $2, $3, $4, $5)`,
      [a.id, tenantId, serviceIds[svcIdx], price, dur],
    );
  }
  for (const sid of staffIds) {
    await q(
      `UPDATE staff SET rating_count = (SELECT count(*) FROM reviews WHERE staff_id = $1),
                        rating_avg = COALESCE((SELECT round(avg(stars),2) FROM reviews WHERE staff_id = $1), 0)
        WHERE id = $1`,
      [sid],
    );
  }

  const posts: Array<[string, string, string, string, string, number]> = [
    [
      'tipos-de-fade',
      'Tipos de fade: bajo, medio, alto y a piel',
      'Qué cambia entre cada degradado, a quién le queda mejor y cómo pedirlo sin confundirte.',
      '/img/svc-fade.webp',
      `Un fade es un degradado: el cabello pasa de más corto en la parte baja a más largo arriba. Lo que cambia entre un tipo y otro es dónde empieza ese degradado.

## Fade bajo
Empieza justo encima de la oreja y en la nuca. Es el más discreto y el que mejor aguanta el crecimiento, así que puedes estirar la visita a la barbería una semana más.

## Fade medio
Arranca a la altura de las sienes. Marca más el contraste con la parte de arriba y funciona con casi cualquier corte: texturizado, peinado hacia atrás o con raya.

## Fade alto
Sube hasta la línea donde la cabeza empieza a curvarse. Se ve muy limpio pero se nota rápido cuando crece. Pide retoque cada dos o tres semanas.

## Fade a piel
Cualquiera de los anteriores, pero la parte más baja llega a cero, al ras de la piel. Si tienes el cuero cabelludo sensible, dile a tu barbero que use navaja con cuidado o que deje el mínimo con máquina.

## Cómo pedirlo
- Di dónde quieres que empiece: bajo, medio o alto.
- Aclara si lo quieres a piel o con un poco de cabello.
- Lleva una foto. Es la forma más rápida de que te entiendan.`,
      2,
    ],
    [
      'como-pedir-tu-corte',
      'Cómo pedirle el corte a tu barbero para que te entienda',
      'Cinco cosas que conviene decir antes de que empiece la máquina.',
      '/img/svc-corte.webp',
      `La mayoría de cortes que salen mal no son culpa de la tijera. Son culpa de una conversación de diez segundos. Esto es lo que conviene decir antes de sentarte.

## Lleva una foto, mejor dos
Una de frente y una de costado. Si es de alguien con el cabello parecido al tuyo, mucho mejor.

## Habla en números
"Corto a los costados" puede ser un 1 o un 4. Si sabes el número de máquina que te gusta, dilo. Si no, pide que empiece más largo: siempre se puede cortar más.

## Cuenta cómo te peinas
Si te peinas hacia atrás, con raya o no te peinas, el barbero corta distinto la parte de arriba.

## Menciona lo que no quieres
Remolinos, entradas, un cerquillo que siempre se levanta. Dilo al principio.

## Revisa en el espejo antes de terminar
Pide que te muestre la nuca con el espejo de mano. Es el momento de pedir un ajuste, no al llegar a tu casa.

Cuando encuentres a un barbero que te entiende, reserva con él directamente la próxima vez. En date.pe puedes elegirlo por su nombre.`,
      6,
    ],
    [
      'cuidar-la-barba',
      'Cómo mantener la barba entre visitas a la barbería',
      'Lo básico para que la barba llegue ordenada a tu siguiente cita.',
      '/img/svc-barba.webp',
      `Una barba bien perfilada se desarma en una semana si no la cuidas. No hace falta una rutina larga, solo constancia.

## Lávala aparte
El shampoo del cabello reseca la piel de la cara. Usa un jabón suave o un shampoo para barba dos o tres veces por semana.

## Hidrata
Unas gotas de aceite o bálsamo después de la ducha, con la barba todavía un poco húmeda. Evita la picazón y la caspa de barba.

## Peina todos los días
Un peine de dientes anchos ordena el crecimiento y te muestra dónde está perdiendo forma.

## No toques la línea
El perfilado de mejillas y cuello es lo que más cuesta recuperar. Si lo tocas en casa, límpialo solo por debajo de la línea que dejó tu barbero.

## Vuelve a tiempo
Para mantener la forma, un arreglo cada dos o tres semanas suele bastar. Reserva la próxima cita al salir y te olvidas.`,
      10,
    ],
  ];
  for (const [slug, title, excerpt, cover, body, daysAgo] of posts) {
    await q(
      `INSERT INTO blog_posts (slug, title, excerpt, cover_url, body_md, published_at)
       VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' days')::interval)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, excerpt = EXCLUDED.excerpt, cover_url = EXCLUDED.cover_url, body_md = EXCLUDED.body_md`,
      [slug, title, excerpt, cover, body, String(daysAgo)],
    );
  }

  await q(
    `INSERT INTO users (email, password_hash, name, is_platform_admin) VALUES ('admin@date.pe', $1, 'Superadmin', true)
     ON CONFLICT (email) DO UPDATE SET is_platform_admin = true, password_hash = EXCLUDED.password_hash`,
    [hashPassword('superadmin123')],
  );

  console.log('Seed completo.');
  console.log('  Demo: barberiajuana (panel: juana@date.pe / barberia123)');
  console.log('  Superadmin: admin@date.pe / superadmin123');
  await adminPool.end();
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
