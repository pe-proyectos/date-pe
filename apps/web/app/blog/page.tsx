import Link from 'next/link';
import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Blog: cortes, barba y barberías en Lima',
  description: 'Guías prácticas sobre tipos de fade, cuidado de la barba y cómo reservar en tu barbería en Lima.',
  alternates: { canonical: 'https://date.pe/blog' },
};

interface Post { slug: string; title: string; excerpt: string | null; cover_url: string | null; published_at: string }
export const revalidate = 300;

const fmt = (d: string) => new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

export default async function BlogPage() {
  let posts: Post[] = [];
  try {
    posts = (await apiFetch<{ posts: Post[] }>('/api/blog', { revalidate: 300 })).posts;
  } catch {
    posts = [];
  }
  const [first, ...rest] = posts;

  return (
    <>
      <Header />
      <main className="mx-auto min-h-[70vh] max-w-[1180px] px-5 pb-24 pt-10 md:px-8">
        <h1 className="text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1] tracking-[-0.04em]">Blog</h1>
        <p className="mt-4 max-w-xl text-[18px] text-mute">Cortes, barba y cómo sacarle provecho a tu barbería.</p>

        {posts.length === 0 && <p className="mt-16 text-[17px] text-mute">Muy pronto publicamos las primeras guías.</p>}

        {first && (
          <Link href={`/blog/${first.slug}`} className="group mt-14 grid items-center gap-8 lg:grid-cols-12" data-reveal>
            <div className="zoom-media aspect-[16/10] rounded-xl bg-field lg:col-span-7">
              {first.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={first.cover_url} alt="" className="h-full w-full rounded-xl object-cover" />
              )}
            </div>
            <div className="lg:col-span-5">
              <time className="text-[14px] text-soft">{fmt(first.published_at)}</time>
              <h2 className="mt-2 text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-[1.08] tracking-[-0.035em] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
                {first.title}
              </h2>
              {first.excerpt && <p className="mt-3 text-[17px] leading-relaxed text-mute">{first.excerpt}</p>}
            </div>
          </Link>
        )}

        {rest.length > 0 && (
          <div className="mt-16 grid gap-x-8 gap-y-12 border-t border-line pt-12 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p, i) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="group block" data-reveal>
                <div className="zoom-media aspect-[16/10] rounded-xl bg-field">
                  {p.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_url} alt="" loading="lazy" className="h-full w-full rounded-xl object-cover" />
                  )}
                </div>
                <time className="mt-4 block text-[14px] text-soft">{fmt(p.published_at)}</time>
                <h2 className="mt-1 text-[20px] font-semibold leading-snug tracking-[-0.02em] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{p.title}</h2>
                {p.excerpt && <p className="mt-2 text-[15px] leading-relaxed text-mute">{p.excerpt}</p>}
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
