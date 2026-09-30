import { env } from '../env.js';

// Canciones para la TV del local. Con YOUTUBE_API_KEY se busca por texto;
// sin clave, el cliente pega un enlace de YouTube y lo resolvemos con oEmbed.
export interface Track {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationS: number | null;
}

export const youtubeSearchEnabled = () => !!env.youtubeApiKey;

export function videoIdFrom(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function isoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

async function details(ids: string[]): Promise<Track[]> {
  if (!env.youtubeApiKey || ids.length === 0) return [];
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,contentDetails,status');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('key', env.youtubeApiKey);
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{ id: string; snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } }; contentDetails: { duration: string }; status: { embeddable: boolean } }> };
  return data.items
    .filter((i) => i.status.embeddable)
    .map((i) => ({ videoId: i.id, title: i.snippet.title, channel: i.snippet.channelTitle, thumbnail: i.snippet.thumbnails.medium?.url ?? `https://i.ytimg.com/vi/${i.id}/mqdefault.jpg`, durationS: isoDuration(i.contentDetails.duration) }));
}

export async function searchTracks(q: string): Promise<Track[]> {
  if (!env.youtubeApiKey) return [];
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoCategoryId', '10'); // música
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('safeSearch', 'strict');
  url.searchParams.set('maxResults', '8');
  url.searchParams.set('regionCode', 'PE');
  url.searchParams.set('q', q);
  url.searchParams.set('key', env.youtubeApiKey);
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Array<{ id: { videoId: string } }> };
  return details(data.items.map((i) => i.id.videoId));
}

export async function resolveTrack(input: string): Promise<Track | null> {
  const id = videoIdFrom(input);
  if (!id) return null;
  if (env.youtubeApiKey) return (await details([id]))[0] ?? null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (!res.ok) return null;
    const d = (await res.json()) as { title: string; author_name: string };
    return { videoId: id, title: d.title, channel: d.author_name, thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, durationS: null };
  } catch {
    return null;
  }
}
