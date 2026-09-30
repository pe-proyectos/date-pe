import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

interface Post { slug: string; title: string; excerpt: string | null; body_md: string | null; cover_url: string | null; published_at: string }

async function getPost(slug: string): Promise<Post | null> {
  try {
    return await apiFetch<Post>(`/api/blog/${slug}`, { revalidate: 300 });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Artículo' };
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `https://date.pe/blog/${slug}` },
    openGraph: { title: post.title, description: post.excerpt ?? undefined, type: 'article', publishedTime: post.published_at, images: [post.cover_url ?? '/img/og.jpg'] },
  };
}

/** Markdown mínimo: ## títulos, listas con "- ", párrafos y **negritas**. */
function renderBody(md: string) {
  const blocks = md.trim().split(/\n{2,}/);
  const inline = (t: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : part,
    );
  return blocks.map((b, i) => {
    if (b.startsWith('## ')) return <h2 key={i} className="mt-12 text-[26px] font-semibold tracking-[-0.03em] text-ink">{b.slice(3)}</h2>;
    if (b.split('\n').every((l) => l.startsWith('- ')))
      return (
        <ul key={i} className="mt-5 list-disc space-y-2 pl-6 marker:text-soft">
          {b.split('\n').map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}
        </ul>
      );
    return <p key={i} className="mt-5">{inline(b)}</p>;
  });
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.cover_url ? `https://date.pe${post.cover_url}` : undefined,
    datePublished: post.published_at,
    author: { '@type': 'Organization', name: 'date.pe' },
    publisher: { '@type': 'Organization', name: 'date.pe', logo: { '@type': 'ImageObject', url: 'https://date.pe/icon.svg' } },
    mainEntityOfPage: `https://date.pe/blog/${slug}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />
      <main className="mx-auto max-w-[720px] px-5 pb-24 pt-10 md:px-8">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-[15px] text-mute hover:text-ink">
          <ArrowLeft size={17} strokeWidth={1.75} /> Blog
        </Link>
        <time className="mt-8 block text-[14px] text-soft">
          {new Date(post.published_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}
        </time>
        <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em]">{post.title}</h1>
        {post.excerpt && <p className="mt-5 text-[20px] leading-relaxed text-mute">{post.excerpt}</p>}
      </main>
      {post.cover_url && (
        <div className="mx-auto -mt-12 mb-12 max-w-[1000px] px-5 md:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.cover_url} alt="" className="aspect-[16/9] w-full rounded-xl object-cover" />
        </div>
      )}
      <article className="mx-auto max-w-[680px] px-5 pb-24 text-[18px] leading-[1.7] text-ink-2 md:px-8">
        {post.body_md ? renderBody(post.body_md) : null}
        <div className="mt-16 rounded-xl bg-field p-6">
          <p className="text-[18px] font-medium text-ink">Reserva tu próxima cita en date.pe</p>
          <p className="mt-1 text-[15px] text-mute">Elige barbero y hora, y paga el adelanto con Yape.</p>
          <Link href="/search" className="mt-4 inline-block rounded-full bg-ink px-5 py-3 text-[15px] font-medium text-white">Buscar barberías</Link>
        </div>
      </article>
      <Footer />
    </>
  );
}
