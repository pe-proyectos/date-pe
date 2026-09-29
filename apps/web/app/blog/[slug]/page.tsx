import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Post {
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string | null;
  cover_url: string | null;
  published_at: string;
}

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
  return { title: post.title, description: post.excerpt ?? undefined };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/blog" className="text-sm text-slate-500 hover:text-slate-900">
        ← Blog
      </Link>
      <h1 className="mt-6 text-3xl font-bold">{post.title}</h1>
      <div className="prose mt-6 whitespace-pre-wrap text-slate-700">{post.body_md}</div>
    </main>
  );
}
