import Link from 'next/link';
import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { Header, Footer } from '@/components/site';

export const metadata: Metadata = {
  title: 'Blog — Guías de barbería y estilo',
  description: 'Guías de barbería, tendencias de cortes y las mejores barberías por distrito en Lima.',
  alternates: { canonical: 'https://date.pe/blog' },
};

interface Post { slug: string; title: string; excerpt: string | null; cover_url: string | null; published_at: string }
export const revalidate = 300;

export default async function BlogPage() {
  let posts: Post[] = [];
  try {
    posts = (await apiFetch<{ posts: Post[] }>('/api/blog', { revalidate: 300 })).posts;
  } catch { posts = []; }

  return (
    <>
      <Header />
      <section className="relative overflow-hidden">
        <div className="mesh-light absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-6 pb-6 pt-14">
          <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand">Blog</div>
          <h1 className="text-4xl font-bold md:text-5xl">Estilo, cortes y barbería</h1>
          <p className="mt-3 max-w-xl text-lg text-slate-600">Consejos, tendencias y las mejores barberías del Perú.</p>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-6 py-10">
        {posts.length === 0 && (
          <div className="glass rounded-3xl p-10 text-center text-slate-500">Pronto publicaremos contenido. ✂️</div>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="glass card-hover block overflow-hidden rounded-3xl">
              <div className="h-40 bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20">
                {post.cover_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.cover_url} alt={post.title} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="p-5">
                <h2 className="text-lg font-bold">{post.title}</h2>
                {post.excerpt && <p className="mt-1 text-sm text-slate-600">{post.excerpt}</p>}
              </div>
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </>
  );
}
