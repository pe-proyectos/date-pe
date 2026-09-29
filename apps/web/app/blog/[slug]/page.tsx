import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Header, Footer } from '@/components/site';

interface Post { slug: string; title: string; excerpt: string | null; body_md: string | null; cover_url: string | null; published_at: string }

async function getPost(slug: string): Promise<Post | null> {
  try { return await apiFetch<Post>(`/api/blog/${slug}`, { revalidate: 300 }); } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Artículo' };
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `https://date.pe/blog/${slug}` },
    openGraph: { title: post.title, description: post.excerpt ?? undefined, type: 'article', images: post.cover_url ? [post.cover_url] : ['/brand/og.png'] },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Article', headline: post.title,
    description: post.excerpt ?? undefined, image: post.cover_url ?? undefined,
    datePublished: post.published_at, publisher: { '@type': 'Organization', name: 'date.pe' },
  };

  return (
    <>
      <Header />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/blog" className="text-sm text-slate-500 hover:text-slate-900">← Blog</Link>
        <h1 className="mt-4 text-4xl font-bold">{post.title}</h1>
        {post.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.cover_url} alt={post.title} className="mt-6 aspect-video w-full rounded-2xl object-cover" />
        )}
        <div className="mt-6 whitespace-pre-wrap text-lg leading-relaxed text-slate-700">{post.body_md}</div>
      </article>
      <Footer />
    </>
  );
}
