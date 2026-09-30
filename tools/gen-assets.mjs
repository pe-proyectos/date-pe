// Genera los assets fotográficos de date.pe con OpenRouter y los convierte a WebP.
// Uso: node tools/gen-assets.mjs [nombre ...]   (sin args genera todos)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const KEY = env.OPENROUTER_API_KEY;
const MODEL = process.env.IMG_MODEL || 'google/gemini-3-pro-image';
const SRC = '/tmp/datepe-assets';
const OUT = resolve(root, 'apps/web/public/img');
mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

const GRADE =
  'Editorial photography, natural daylight, clean whites, true-to-life skin tones, soft contrast, 35mm lens, shallow depth of field. No text, no letters, no logos, no watermark.';

const ASSETS = [
  { name: 'hero-barberia', aspect: '4:5', width: 1200,
    prompt: `Inside a bright modern barbershop in Lima, Peru. A barber in a black apron carefully finishing a skin fade on a young Peruvian man seated in a vintage cognac leather barber chair, three-quarter angle. Big window with soft morning light, white walls, light oak shelves, a red white and blue barber pole softly out of focus in the background. Calm, candid, premium. ${GRADE}` },
  { name: 'svc-corte', aspect: '4:5', width: 800,
    prompt: `Close-up of a barber's hands cutting dark hair with silver scissors and a black comb, fine strands falling, bright neutral background. Minimal and premium. ${GRADE}` },
  { name: 'svc-fade', aspect: '4:5', width: 800,
    prompt: `Close-up of an electric clipper shaping a clean skin fade on the side of a young man's head, crisp gradient from skin to short hair, bright neutral background. Minimal and premium. ${GRADE}` },
  { name: 'svc-barba', aspect: '4:5', width: 800,
    prompt: `Close-up of a barber trimming and shaping a full dark beard with a trimmer and a small comb, precise cheek line, bright neutral background. Minimal and premium. ${GRADE}` },
  { name: 'svc-navaja', aspect: '4:5', width: 800,
    prompt: `Close-up of a classic straight razor shave, white shaving foam on the jawline, the barber's steady hand holding a steel razor, a folded white towel, bright neutral background. Minimal and premium. ${GRADE}` },
  { name: 'district-miraflores', aspect: '4:5', width: 800,
    prompt: `The green cliffs and Malecon of Miraflores in Lima, Peru at golden hour above the Pacific Ocean, parks along the cliff edge, a paraglider in the sky. Travel editorial. ${GRADE}` },
  { name: 'district-barranco', aspect: '4:5', width: 800,
    prompt: `A quiet colonial street in Barranco, Lima, Peru: pastel facades, wooden balconies, bougainvillea, soft afternoon light, no people in the foreground. Travel editorial. ${GRADE}` },
  { name: 'district-san-isidro', aspect: '4:5', width: 800,
    prompt: `El Olivar park in San Isidro, Lima, Peru: gnarled centuries-old olive trees, a stone path with dappled sunlight, calm morning. Travel editorial. ${GRADE}` },
  { name: 'district-surco', aspect: '4:5', width: 800,
    prompt: `A tree-lined residential avenue in Santiago de Surco, Lima, Peru, clean sidewalks, modern low buildings, bright clear day. Travel editorial. ${GRADE}` },
  { name: 'shops-owner', aspect: '4:3', width: 1400,
    prompt: `A Peruvian woman in her thirties who owns a modern barbershop stands behind the counter checking the day's appointments on a tablet, slight smile, barber chairs softly out of focus behind her, white and light oak interior, bright daylight. The tablet screen faces away from camera. Candid, premium. ${GRADE}` },
  { name: 'tenant-cover', aspect: '16:9', width: 1920,
    prompt: `Wide shot of an empty modern barbershop interior in Miraflores, Lima: three vintage cognac leather barber chairs in a row facing round mirrors, white walls, light oak shelves with grooming products, black and white checkered floor, large window light. Calm and premium. ${GRADE}` },
  { name: 'staff-carlos', aspect: '1:1', width: 600,
    prompt: `Portrait of a Peruvian male barber in his early thirties with a short trimmed beard, friendly confident expression, black apron over a white t-shirt, bright barbershop background out of focus, chest up, looking at the camera. ${GRADE}` },
  { name: 'staff-maria', aspect: '1:1', width: 600,
    prompt: `Portrait of a Peruvian female barber in her late twenties, dark hair tied back, warm confident smile, black apron over a grey t-shirt, bright barbershop background out of focus, chest up, looking at the camera. ${GRADE}` },
  { name: 'staff-diego', aspect: '1:1', width: 600,
    prompt: `Portrait of a Peruvian male barber in his mid forties with salt-and-pepper hair and a neat moustache, calm expression, black apron over a denim shirt, bright barbershop background out of focus, chest up, looking at the camera. ${GRADE}` },
  { name: 'og', aspect: '16:9', width: 1200,
    prompt: `A red white and blue barber pole and a single vintage leather barber chair in a bright minimalist white barbershop, large calm white wall on the left half of the frame, soft daylight. Premium and quiet. ${GRADE}` },
];

async function gen(a) {
  const png = `${SRC}/${a.name}.png`;
  if (existsSync(png) && !process.env.FORCE) return png;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://date.pe', 'X-Title': 'date.pe' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: a.prompt }], modalities: ['image', 'text'], image_config: { aspect_ratio: a.aspect } }),
  });
  const data = await res.json();
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!res.ok || !url) throw new Error(`${a.name}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
  writeFileSync(`${SRC}/${a.name}.prompt.txt`, a.prompt);
  return png;
}

function toWebp(a, png) {
  const out = `${OUT}/${a.name}.webp`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-vf', `scale='min(${a.width},iw)':-2`, '-c:v', 'libwebp', '-quality', '78', out]);
  return out;
}

const only = process.argv.slice(2);
const list = only.length ? ASSETS.filter((a) => only.includes(a.name)) : ASSETS;
const queue = [...list];
const results = [];
async function worker() {
  while (queue.length) {
    const a = queue.shift();
    try {
      const png = await gen(a);
      const out = toWebp(a, png);
      console.log('OK', a.name, '->', out);
      results.push(a.name);
    } catch (e) {
      console.error('FAIL', e.message);
    }
  }
}
await Promise.all(Array.from({ length: 5 }, worker));
writeFileSync(`${SRC}/manifest.json`, JSON.stringify(ASSETS.map(({ name, prompt }) => ({ name, prompt })), null, 2));
console.log('DONE', results.length, '/', list.length);
