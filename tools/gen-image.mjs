// Genera una imagen con OpenRouter y la guarda. Uso: node tools/gen-image.mjs "<prompt>" <salida.png>
import { readFileSync, writeFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const KEY = env.OPENROUTER_API_KEY;
const prompt = process.argv[2];
const out = process.argv[3] || 'out.png';
const model = process.env.IMG_MODEL || 'google/gemini-2.5-flash-image-preview';
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method:'POST',
  headers:{ Authorization:`Bearer ${KEY}`, 'Content-Type':'application/json', 'HTTP-Referer':'https://date.pe', 'X-Title':'date.pe' },
  body: JSON.stringify({ model, messages:[{role:'user',content:prompt}], modalities:['image','text'] })
});
const data = await res.json();
if(!res.ok){ console.error('HTTP',res.status, JSON.stringify(data).slice(0,500)); process.exit(1); }
const imgs = data.choices?.[0]?.message?.images;
if(!imgs || !imgs.length){ console.error('sin imagen. resp:', JSON.stringify(data).slice(0,600)); process.exit(2); }
const url = imgs[0].image_url.url; // data:image/png;base64,....
const b64 = url.split(',')[1];
writeFileSync(out, Buffer.from(b64,'base64'));
console.log('OK ->', out, Buffer.from(b64,'base64').length, 'bytes');
