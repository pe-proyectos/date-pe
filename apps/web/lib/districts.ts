// Distritos para SEO/geo (landings /barberias/[provincia]/[distrito]).
export interface District {
  name: string;
  slug: string;
  province: string; // slug de provincia
  provinceName: string;
}

export const DISTRICTS: District[] = [
  ['Miraflores', 'miraflores'],
  ['San Isidro', 'san-isidro'],
  ['Surco', 'surco'],
  ['San Borja', 'san-borja'],
  ['La Molina', 'la-molina'],
  ['Barranco', 'barranco'],
  ['Jesús María', 'jesus-maria'],
  ['Los Olivos', 'los-olivos'],
  ['Magdalena', 'magdalena'],
  ['Lince', 'lince'],
  ['Pueblo Libre', 'pueblo-libre'],
  ['San Miguel', 'san-miguel'],
  ['Surquillo', 'surquillo'],
  ['La Victoria', 'la-victoria'],
  ['San Juan de Lurigancho', 'san-juan-de-lurigancho'],
  ['Comas', 'comas'],
].map(([name, slug]) => ({ name, slug, province: 'lima', provinceName: 'Lima' }));

/** Fotos editoriales de distritos con imagen propia. */
export const DISTRICT_PHOTOS: Record<string, string> = {
  miraflores: '/img/district-miraflores.webp',
  barranco: '/img/district-barranco.webp',
  'san-isidro': '/img/district-san-isidro.webp',
  surco: '/img/district-surco.webp',
};

export function findDistrict(province: string, slug: string): District | undefined {
  return DISTRICTS.find((d) => d.province === province && d.slug === slug);
}
